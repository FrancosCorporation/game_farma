// FarmaCheck server — Node 0-dep.
//   · serve o build estático (dist/)
//   · POST /api/case/next  → caso-base randomizado (schema válido) p/ Modo Expediente Livre
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from '../src/data/cases.js';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = process.env.PORT || 4174;
const HOST = process.env.HOST || '127.0.0.1'; // em container, HOST=0.0.0.0 (ver Dockerfile)

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
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

function pickRandomCase() {
  const src = CASES[(Math.random() * CASES.length) | 0];
  return {
    ...src,
    id: `${src.id}_s${Math.floor(Math.random() * 1e6)}`,
    version: src.version,
    seed: Math.floor(Math.random() * 1e6),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/case/next') {
    const c = pickRandomCase();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(c));
    return;
  }

  // Estático
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (path.startsWith(ROOT) === false) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    let f = await stat(path);
    if (f.isDirectory()) path = join(path, 'index.html');
  } catch {
    path = join(ROOT, 'index.html'); // SPA fallback
  }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FarmaCheck server → http://${HOST}:${PORT}  (POST /api/case/next)`);
});