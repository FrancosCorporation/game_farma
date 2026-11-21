// FarmaCheck server — Node 0-dep.
//   · serve o build estático (dist/)
//   · POST /api/case/next  → caso-base randomizado (schema válido) p/ Modo Expediente Livre
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from '../src/data/cases.js';
import { readSpeechRequest, SpeechRequestError, synthesizeSpeechResult } from './tts.mjs';

const ROOT = resolve(process.env.FARMA_DIST_DIR || fileURLToPath(new URL('../dist/', import.meta.url)));
const PORT = process.env.PORT || 4174;
const HOST = process.env.HOST || '127.0.0.1'; // em container, HOST=0.0.0.0 (ver Dockerfile)
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY?.trim() || '';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL?.trim() || 'nvidia/nemotron-3.5-lightning-30b-a3b';
const LLM_RATE_LIMIT = new Map();

async function readJsonBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {
    const error = new Error('Invalid JSON body');
    error.status = 400;
    throw error;
  }
}

function validLlmMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 11) return false;
  let total = 0;
  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return false;
    total += message.content.length;
    if (message.content.length > 16000 || total > 48000) return false;
  }
  return true;
}

function allowLlmRequest(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const key = (typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : '') || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let window = LLM_RATE_LIMIT.get(key);
  if (!window || now - window.start >= 60000) window = { start: now, count: 0 };
  window.count++;
  LLM_RATE_LIMIT.set(key, window);
  if (LLM_RATE_LIMIT.size > 1024) {
    for (const [address, value] of LLM_RATE_LIMIT) if (now - value.start >= 60000) LLM_RATE_LIMIT.delete(address);
  }
  return window.count <= 30;
}

function sameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; }
  catch { return false; }
}

function nvidiaTextChunk(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return '';
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') return 'data: [DONE]\n\n';
  try {
    const content = JSON.parse(payload).choices?.[0]?.delta?.content;
    return typeof content === 'string' && content
      ? `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
      : '';
  } catch { return ''; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

function pickRandomCase() {
  const src = CASES[(Math.random() * CASES.length) | 0];
  return {
    id: src.id,
    seed: Math.floor(Math.random() * 1e6),
  };
}

const server = createServer(async (req, res) => {
  const startedAt = process.hrtime.bigint();
  let route = 'unmatched';
  const logAccess = (status) => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(JSON.stringify({
      event: 'http_access',
      method: req.method,
      route,
      status,
      duration_ms: Math.round(durationMs * 1000) / 1000,
    }));
  };
  const reply = (status, body, headers = {}) => {
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
    logAccess(status);
  };

  try {
    // Do not trust Host to parse the request target. URL parsing accepts many
    // malformed percent sequences; decoding below is the operation that can throw.
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      reply(400, 'Bad request');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      reply(400, 'Malformed URL');
      return;
    }
    if (pathname.includes('\0')) {
      route = 'malformed';
      reply(400, 'Malformed URL');
      return;
    }

    if (pathname === '/api/llm/fallback') {
      route = 'llm-fallback';
      if (req.method !== 'POST') {
        reply(405, JSON.stringify({ error: 'Method Not Allowed' }), {
          Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        });
        return;
      }
      if (!sameOriginRequest(req)) {
        reply(403, JSON.stringify({ error: 'Forbidden' }), { 'Content-Type': 'application/json; charset=utf-8' });
        return;
      }
      if (!NVIDIA_API_KEY) {
        reply(503, JSON.stringify({ error: 'NVIDIA fallback is not configured' }), {
          'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        });
        return;
      }
      if (!allowLlmRequest(req)) {
        reply(429, JSON.stringify({ error: 'Too many requests' }), {
          'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        });
        return;
      }

      let input;
      try { input = await readJsonBody(req, 64 * 1024); }
      catch (error) {
        const status = error.status || 400;
        reply(status, JSON.stringify({ error: status === 413 ? 'Request body too large' : 'Invalid request' }), {
          'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        });
        return;
      }
      if (!validLlmMessages(input.messages)) {
        reply(400, JSON.stringify({ error: 'Invalid messages' }), {
          'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        });
        return;
      }

      const requestedTokens = Number.isInteger(input.max_tokens) ? input.max_tokens : 110;
      const maxTokens = Math.max(1, Math.min(requestedTokens, 350));
      const temperature = Number.isFinite(input.temperature)
        ? Math.max(0, Math.min(input.temperature, 2))
        : 0.7;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const onClose = () => { if (!res.writableEnded) controller.abort(); };
      res.once('close', onClose);

      try {
        const upstream = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: NVIDIA_MODEL,
            messages: input.messages,
            stream: true,
            temperature,
            max_tokens: maxTokens,
            chat_template_kwargs: { enable_thinking: false },
            reasoning_budget: 0,
          }),
          signal: controller.signal,
        });
        if (!upstream.ok || !upstream.body) {
          try { await upstream.body?.cancel(); } catch { /* resposta descartada */ }
          reply(502, JSON.stringify({ error: 'NVIDIA fallback unavailable' }), {
            'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
          });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'X-Content-Type-Options': 'nosniff',
        });
        const write = async (chunk) => {
          if (!res.write(chunk)) await new Promise((resolveDrain) => res.once('drain', resolveDrain));
        };
        const decoder = new TextDecoder();
        let buffer = '';
        let completed = false;
        const forwardLine = async (line) => {
          const safeChunk = nvidiaTextChunk(line);
          if (!safeChunk) return;
          await write(safeChunk);
          if (safeChunk.includes('[DONE]')) completed = true;
        };
        for await (const chunk of upstream.body) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            await forwardLine(line);
            if (completed) break;
          }
          if (completed) break;
        }
        if (buffer.trim()) await forwardLine(buffer);
        if (!completed) await write('data: [DONE]\n\n');
        res.end();
        logAccess(200);
      } catch (error) {
        if (res.headersSent) {
          res.destroy();
          logAccess(error?.name === 'AbortError' ? 504 : 502);
        } else {
          reply(error?.name === 'AbortError' ? 504 : 502, JSON.stringify({ error: 'NVIDIA fallback unavailable' }), {
            'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
          });
        }
      } finally {
        clearTimeout(timer);
        res.off('close', onClose);
      }
      return;
    }

    if (pathname === '/v1/audio/speech') {
      route = 'tts-speech';
      if (req.method !== 'POST') {
        reply(405, 'Method Not Allowed', { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }
      try {
        const speechRequest = await readSpeechRequest(req);
        const { audio, contentType } = await synthesizeSpeechResult(speechRequest);
        reply(200, audio, {
          'Content-Type': contentType,
          'Content-Length': String(audio.length),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
      } catch (error) {
        const status = error instanceof SpeechRequestError ? error.status : 500;
        const message = error instanceof SpeechRequestError ? error.message : 'Speech request failed';
        reply(status, JSON.stringify({ error: message }), {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
      }
      return;
    }

    if (pathname === '/healthz' || pathname === '/readyz') {
      route = pathname.slice(1);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        reply(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
        return;
      }
      if (pathname === '/healthz') {
        reply(200, JSON.stringify({ status: 'ok' }), {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        return;
      }
      try {
        const readyFile = await stat(join(ROOT, 'index.html'));
        if (!readyFile.isFile()) throw new Error('not-ready');
        reply(200, JSON.stringify({ status: 'ready' }), {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
      } catch {
        reply(503, JSON.stringify({ status: 'not_ready' }), {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
      }
      return;
    }

    if (req.method === 'POST' && (pathname === '/api/case/next' || pathname === '/cases/next')) {
      route = 'case-next';
      const c = pickRandomCase();
      reply(200, JSON.stringify(c), { 'Content-Type': 'application/json; charset=utf-8' });
      return;
    }
    if ((pathname === '/api/case/next' || pathname === '/cases/next') && req.method !== 'POST') {
      route = 'case-next';
      reply(405, 'Method Not Allowed', { Allow: 'POST' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      route = 'method-not-allowed';
      reply(405, 'Method Not Allowed', { Allow: 'GET, HEAD, POST' });
      return;
    }

    route = `static:${extname(pathname).slice(1).toLowerCase() || 'extensionless'}`;

    // Resolve beneath dist and use path.relative so encoded separators and
    // traversal segments cannot escape the static root.
    let path = resolve(ROOT, `.${pathname}`);
    const relativePath = relative(ROOT, path);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      route = 'static:blocked';
      reply(403, 'Forbidden');
      return;
    }

    let fileInfo;
    try {
      fileInfo = await stat(path);
      if (fileInfo.isDirectory()) {
        path = join(path, 'index.html');
        fileInfo = await stat(path);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
      const isSpaNavigation = !extname(pathname) && req.headers.accept?.includes('text/html');
      if (!isSpaNavigation) {
        reply(404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }
      route = 'spa-fallback';
      path = join(ROOT, 'index.html'); // SPA fallback only for browser navigations.
      fileInfo = await stat(path);
    }

    const ext = extname(path);
    // Cache: assets com hash de build são imutáveis; o resto (html/glb/sons) revalida.
    const hashed = /-[A-Za-z0-9_]{8,}\.[a-z]+$/i.test(path.split('/').pop() || '');
    const cache = (ext === '.js' || ext === '.css') && hashed
      ? 'public, max-age=31536000, immutable'
      : ext === '.html' ? 'no-store' : 'no-cache';
    const lm = fileInfo.mtime.toUTCString();
    if (req.headers['if-modified-since'] === lm) {
      reply(304, undefined, { 'Cache-Control': cache });
      return;
    }
    const data = await readFile(path);
    reply(200, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
      'Last-Modified': lm,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'server_error',
      method: req.method,
      route,
      error: error?.code || error?.name || 'Error',
    }));
    if (!res.headersSent) reply(500, 'Internal Server Error', { 'Content-Type': 'text/plain; charset=utf-8' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FarmaCheck server → http://${HOST}:${PORT}  (POST /api/case/next)`);
});
