import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCharacterVoiceProfile, isSupportedCharacterVoice } from '../src/data/characterVoices.js';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_TEXT_LENGTH = 1200;
const MAX_SPEECH_JOBS = 1;
const SPEECH_TIMEOUT_MS = 20000;
const MAX_SPEECH_BYTES = 4 * 1024 * 1024;
const SPEECH_BINARY = process.env.ESPEAK_NG_BIN || 'espeak-ng';

let activeSpeechJobs = 0;

export class SpeechRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readSpeechRequest(request) {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new SpeechRequestError(415, 'Content-Type must be application/json');
  }

  const chunks = [];
  let bytes = 0;
  let oversized = false;
  await new Promise((resolve, reject) => {
    request.setTimeout(5000, () => reject(new SpeechRequestError(408, 'Request body timed out')));
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
        return;
      }
      if (!oversized) chunks.push(chunk);
    });
    request.once('end', () => {
      request.setTimeout(0);
      resolve();
    });
    request.once('error', reject);
    request.once('aborted', () => reject(new SpeechRequestError(400, 'Request body was interrupted')));
  });
  if (oversized) throw new SpeechRequestError(413, 'Request body is too large');

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new SpeechRequestError(400, 'Invalid JSON body');
  }

  const text = typeof body?.input === 'string' ? body.input.trim().replace(/\s+/g, ' ') : '';
  if (!text) throw new SpeechRequestError(400, 'input must be a non-empty string');
  if (text.length > MAX_TEXT_LENGTH) throw new SpeechRequestError(413, 'input is too long');

  const selectedVoice = typeof body.voice === 'string' ? body.voice : '';
  if (!isSupportedCharacterVoice(selectedVoice)) {
    throw new SpeechRequestError(400, 'voice must be a supported pt-BR or en-US character voice');
  }
  const lang = /^en(?:[-_]|$)/i.test(selectedVoice) ? 'en-us' : 'pt-br';
  const defaultVoice = getCharacterVoiceProfile('', lang === 'en-us' ? 'en' : 'pt').voice;

  const speed = Number(body.speed ?? 1);
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new SpeechRequestError(400, 'speed must be between 0.5 and 2');
  }
  const pitch = Number(body.pitch ?? 1);
  if (!Number.isFinite(pitch) || pitch < 0.5 || pitch > 2) {
    throw new SpeechRequestError(400, 'pitch must be between 0.5 and 2');
  }

  return {
    text,
    voice: selectedVoice === 'pt-BR' || selectedVoice === 'en-US' ? defaultVoice : selectedVoice,
    language: lang,
    speed,
    pitch,
  };
}

function signed(value, unit) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}${unit}`;
}

export async function synthesizeEdgeSpeech({ text, voice, speed = 1, pitch = 1, edgeTtsBin, timeoutMs = SPEECH_TIMEOUT_MS } = {}) {
  if (typeof text !== 'string' || !text.trim() || !isSupportedCharacterVoice(voice)) {
    throw new SpeechRequestError(400, 'Invalid Microsoft speech request');
  }
  const directory = await mkdtemp(join(tmpdir(), 'farmacheck-edge-tts-'));
  const outputPath = join(directory, 'speech.mp3');
  const executable = edgeTtsBin || process.env.EDGE_TTS_BIN || 'edge-tts';
  const args = [
    '--voice', voice,
    '--text', text,
    '--write-media', outputPath,
    `--rate=${signed((Number(speed) - 1) * 100, '%')}`,
    `--pitch=${signed((Number(pitch) - 1) * 80, 'Hz')}`,
  ];

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      let stderr = '';
      const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new SpeechRequestError(503, 'Microsoft speech synthesis timed out'));
      }, timeoutMs);
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 2048) stderr += chunk.toString('utf8').slice(0, 2048 - stderr.length);
      });
      child.once('error', (error) => finish(new SpeechRequestError(503,
        error.code === 'ENOENT' ? 'Microsoft speech engine is unavailable' : 'Microsoft speech engine could not start')));
      child.once('close', (code) => {
        if (code === 0) finish();
        else {
          const rateLimited = /\b429\b/.test(stderr);
          if (stderr && !rateLimited) {
            const detail = stderr.trim().split(/\r?\n/).slice(-4).join(' | ').slice(-600);
            console.error(`Microsoft speech engine failed: ${detail}`);
          }
          finish(new SpeechRequestError(rateLimited ? 429 : 503,
            rateLimited ? 'Microsoft speech service is rate limiting requests' : 'Microsoft speech synthesis failed'));
        }
      });
    });
    const info = await stat(outputPath);
    if (!info.isFile() || info.size < 64 || info.size > MAX_SPEECH_BYTES) {
      throw new SpeechRequestError(503, 'Microsoft speech output is invalid');
    }
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function synthesizeSpeechResult(request) {
  if (process.env.TTS_ENGINE === 'edge-tts') {
    if (activeSpeechJobs >= MAX_SPEECH_JOBS) throw new SpeechRequestError(503, 'Speech service is busy');
    activeSpeechJobs++;
    try {
      return {
        audio: await synthesizeEdgeSpeech(request),
        contentType: 'audio/mpeg',
      };
    } finally {
      activeSpeechJobs--;
    }
  }
  const audio = await synthesizeSpeech({ ...request, voice: request.language });
  return { audio, contentType: 'audio/wav' };
}

export async function synthesizeSpeech({ text, voice, speed = 1, pitch = 1 }) {
  if (activeSpeechJobs >= MAX_SPEECH_JOBS) throw new SpeechRequestError(503, 'Speech service is busy');
  activeSpeechJobs++;

  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let outputBytes = 0;
      const output = [];
      const errors = [];
      let errorBytes = 0;
      const child = spawn(SPEECH_BINARY, [
        '--stdout', '-v', voice, '-s', String(Math.round(175 * speed)),
        '-p', String(Math.max(0, Math.min(99, Math.round(50 * pitch)))), '--stdin',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new SpeechRequestError(503, 'Speech synthesis timed out'));
      }, SPEECH_TIMEOUT_MS);

      function finish(error, wav) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(wav);
      }

      child.stdout.on('data', (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_SPEECH_BYTES) {
          child.kill('SIGKILL');
          finish(new SpeechRequestError(503, 'Speech output exceeded its size limit'));
          return;
        }
        output.push(chunk);
      });
      child.stderr.on('data', (chunk) => {
        if (errorBytes >= 2048) return;
        const kept = chunk.subarray(0, 2048 - errorBytes);
        errors.push(kept);
        errorBytes += kept.length;
      });
      child.once('error', (error) => {
        finish(new SpeechRequestError(503, error.code === 'ENOENT'
          ? 'Local speech engine is unavailable'
          : 'Local speech engine could not start'));
      });
      child.once('close', (code) => {
        if (settled) return;
        const wav = Buffer.concat(output);
        if (code !== 0 || wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
          // Keep details out of the HTTP response; the bounded stderr is only for server-side diagnosis.
          if (errors.length) console.error(`Local speech engine failed: ${Buffer.concat(errors).toString('utf8').trim().slice(0, 240)}`);
          finish(new SpeechRequestError(503, 'Local speech engine failed'));
          return;
        }
        finish(null, wav);
      });
      child.stdin.once('error', () => {});
      child.stdin.end(text);
    });
  } finally {
    activeSpeechJobs--;
  }
}
