// Gera áudio offline para as falas determinísticas de todos os pacientes.
// Saída: public/audio/voices/<caseId>/<hash>.ogg (PT e EN).
//
// Engines suportadas:
//   1. Microsoft Edge  VOICEGEN_ENGINE=edge-tts npm run voicegen
//   2. eSpeak NG local ESPEAK_NG_BIN=/caminho/espeak-ng npm run voicegen
//   3. OpenAI-compat   TTS_URL=http://127.0.0.1:8080/v1/audio/speech TTS_VOICE=... npm run voicegen
//   4. CLI customizado TTS_CMD="comando com {text} e {out}" npm run voicegen

import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { CASES, localizeCase } from '../src/data/cases.js';
import { CHARACTER_VOICE_PROFILES, getCharacterVoiceProfile } from '../src/data/characterVoices.js';
import { synthesizeEdgeSpeech, synthesizeSpeech } from '../server/tts.mjs';

const execFileAsync = promisify(execFile);
const OUT = resolve(process.env.VOICEGEN_OUT_DIR || fileURLToPath(new URL('../public/audio/voices/', import.meta.url)));
const TTS_URL = process.env.TTS_URL || '';
const TTS_CMD = process.env.TTS_CMD || '';
const TTS_VOICE = process.env.TTS_VOICE || '';
const VOICEGEN_ENGINE = process.env.VOICEGEN_ENGINE || 'local';
const ASSET_PREFIX = process.env.VOICEGEN_ASSET_PREFIX || 'audio/voices';
const FORMAT = process.env.TTS_FORMAT || 'ogg';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const LANGUAGES = (process.env.VOICEGEN_LANGUAGES || 'pt,en').split(',').map((value) => value.trim()).filter(Boolean);
const CONCURRENCY = Number(process.env.VOICEGEN_CONCURRENCY || (VOICEGEN_ENGINE === 'edge-tts' ? 1 : 3));
const REQUEST_INTERVAL_MS = Number(process.env.VOICEGEN_INTERVAL_MS || 1000);
const EDGE_TTS_TIMEOUT_MS = Number(process.env.VOICEGEN_EDGE_TIMEOUT_MS || 90000);

if (!['ogg', 'mp3'].includes(FORMAT)) throw new Error('TTS_FORMAT deve ser ogg ou mp3.');
if (!['local', 'edge-tts'].includes(VOICEGEN_ENGINE)) throw new Error('VOICEGEN_ENGINE deve ser local ou edge-tts.');
if (!/^audio\/voices(?:-[a-z0-9-]+)?$/.test(ASSET_PREFIX)) throw new Error('VOICEGEN_ASSET_PREFIX inválido.');
if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 8) throw new Error('VOICEGEN_CONCURRENCY deve ficar entre 1 e 8.');
if (!Number.isInteger(REQUEST_INTERVAL_MS) || REQUEST_INTERVAL_MS < 0 || REQUEST_INTERVAL_MS > 60000) throw new Error('VOICEGEN_INTERVAL_MS deve ficar entre 0 e 60000.');
if (!Number.isInteger(EDGE_TTS_TIMEOUT_MS) || EDGE_TTS_TIMEOUT_MS < 1000 || EDGE_TTS_TIMEOUT_MS > 180000) throw new Error('VOICEGEN_EDGE_TIMEOUT_MS deve ficar entre 1000 e 180000.');
if (LANGUAGES.some((language) => !['pt', 'en'].includes(language))) {
  throw new Error('VOICEGEN_LANGUAGES aceita somente pt,en.');
}
if (VOICEGEN_ENGINE !== 'edge-tts' && !TTS_URL && !TTS_CMD && !process.env.ESPEAK_NG_BIN) {
  throw new Error('Defina ESPEAK_NG_BIN, TTS_URL ou TTS_CMD para gerar as vozes.');
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function normalize(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function collectLines(c) {
  const set = new Set();
  const add = (text) => {
    const clean = normalize(text);
    if (clean) set.add(clean);
  };
  add(c.abertura);
  for (const fact of c.fatos || []) {
    add(fact.falaLeiga);
    add(fact.falaEvasiva);
  }
  add(c.persona.falaForaDominio);
  add(c.persona.falaRepetida);
  for (const outcome of Object.values(c.consequencias || {})) {
    add(outcome.titulo);
    add(outcome.texto);
    add(`${outcome.titulo}. ${outcome.texto}`);
  }
  return [...set];
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function encodeAudio(bytes, target, sourceFormat) {
  if (sourceFormat === FORMAT) {
    await writeFile(target, bytes);
    return;
  }
  const temporaryInput = `${target}.${sourceFormat}`;
  await writeFile(temporaryInput, bytes);
  try {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', temporaryInput];
    if (FORMAT === 'ogg') args.push('-c:a', 'libvorbis', '-q:a', '3');
    else args.push('-c:a', 'libmp3lame', '-b:a', '48k');
    args.push(target);
    await execFileAsync(FFMPEG_BIN, args, { timeout: 30000 });
  } finally {
    await rm(temporaryInput, { force: true });
  }
}

async function synth(text, out, language, personaVoice = {}, caseId = '') {
  const langVoice = language === 'en' ? 'en-us' : 'pt-br';
  const speed = Number(personaVoice.rate) || 1;
  const pitch = Number(personaVoice.pitch) || 1;
  const characterVoice = getCharacterVoiceProfile(caseId, language);

  if (VOICEGEN_ENGINE === 'edge-tts') {
    const audio = await synthesizeEdgeSpeech({
      text,
      voice: characterVoice.voice,
      speed,
      pitch,
      edgeTtsBin: process.env.EDGE_TTS_BIN || undefined,
      timeoutMs: EDGE_TTS_TIMEOUT_MS,
    });
    await encodeAudio(audio, out, 'mp3');
    return;
  }

  if (TTS_URL) {
    const voice = TTS_VOICE || characterVoice.voice;
    const response = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1', input: text, voice, speed, pitch, response_format: FORMAT,
      }),
    });
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const actualFormat = contentType.includes('audio/wav') ? 'wav'
      : contentType.includes('audio/mpeg') ? 'mp3'
        : contentType.includes('audio/ogg') ? 'ogg' : '';
    if (!actualFormat) throw new Error(`Formato de áudio inesperado: ${contentType || 'sem Content-Type'}`);
    await encodeAudio(Buffer.from(await response.arrayBuffer()), out, actualFormat);
    return;
  }

  if (TTS_CMD) {
    const cmd = TTS_CMD.replaceAll('{text}', text).replaceAll('{out}', out);
    await new Promise((resolveRun, rejectRun) => {
      const process = spawn('bash', ['-c', cmd], { stdio: 'inherit' });
      process.once('error', rejectRun);
      process.once('close', (code) => (code === 0 ? resolveRun() : rejectRun(new Error(`cmd exit ${code}`))));
    });
    return;
  }

  const wav = await synthesizeSpeech({
    text,
    voice: langVoice,
    speed,
    pitch,
  });
  await encodeAudio(wav, out, 'wav');
}

let total = 0;
let generated = 0;
let skipped = 0;
let failed = 0;
const assets = {};
const phrases = {};
const speakers = Object.fromEntries(Object.entries(CHARACTER_VOICE_PROFILES).map(([caseId, profile]) => [
  caseId,
  { gender: profile.gender, pt: profile.pt, en: profile.en },
]));

const jobs = [];
for (const language of LANGUAGES) {
  for (const sourceCase of CASES) {
    const patient = localizeCase(sourceCase, language);
    for (const line of collectLines(patient)) {
      jobs.push({
        language,
        sourceCase,
        line,
        key: `${sourceCase.id}/${hash(line)}`,
        personaVoice: patient.persona.voz || {},
      });
    }
  }
}
total = jobs.length;
let nextJob = 0;
let rateLimited = false;
let nextRequestAt = 0;

async function waitForRequestSlot() {
  const now = Date.now();
  const delay = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + REQUEST_INTERVAL_MS;
  if (delay) await new Promise((resolveWait) => setTimeout(resolveWait, delay));
}

async function processJob({ language, sourceCase, line, key, personaVoice }) {
  const file = join(OUT, `${key}.${FORMAT}`);
  if (await exists(file)) {
    assets[key] = `${ASSET_PREFIX}/${key}.${FORMAT}`;
    phrases[key] = line;
    skipped++;
    return;
  }
  await mkdir(join(OUT, sourceCase.id), { recursive: true });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (VOICEGEN_ENGINE === 'edge-tts') await waitForRequestSlot();
      await synth(line, file, language, personaVoice, sourceCase.id);
      const info = await stat(file);
      if (!info.isFile() || info.size < 64) throw new Error('arquivo de áudio vazio ou incompleto');
      assets[key] = `${ASSET_PREFIX}/${key}.${FORMAT}`;
      phrases[key] = line;
      generated++;
      if (generated % 25 === 0 || generated + skipped === total) console.log(`Vozes: ${generated + skipped}/${total} processadas.`);
      return;
    } catch (error) {
      lastError = error;
      if (error?.status === 429) {
        rateLimited = true;
        break;
      }
      const transientMicrosoftFailure = VOICEGEN_ENGINE === 'edge-tts'
        && error?.status === 503
        && /synthesis failed|timed out/i.test(error.message || '');
      if (transientMicrosoftFailure && attempt < 2) {
        console.warn(`↻ ${language} ${sourceCase.id}: temporary Microsoft synthesis failure; retry ${attempt + 1}/2 after 5 seconds.`);
        await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
        continue;
      }
      break;
    }
  }
  failed++;
  if (lastError?.status === 429) {
    console.error(`⏸ Microsoft Edge TTS rate limit reached during ${language}/${sourceCase.id}; generation stopped. Re-run after the service cools down to resume from completed assets.`);
  } else {
    console.error(`✗ ${language} ${sourceCase.id}: ${lastError?.message || 'unknown synthesis error'}`);
  }
  await rm(file, { force: true });
}

async function worker() {
  while (true) {
    if (rateLimited) return;
    const index = nextJob++;
    if (index >= jobs.length) return;
    await processJob(jobs[index]);
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));

const manifestFile = join(OUT, 'manifest.json');
await mkdir(OUT, { recursive: true });
await writeFile(manifestFile, `${JSON.stringify({
  version: 2,
  provider: VOICEGEN_ENGINE === 'edge-tts' ? 'microsoft-edge-tts' : 'local',
  speakers,
  assets,
  phrases,
}, null, 2)}\n`);
console.log(`\nVozes: ${generated} geradas, ${skipped} já existentes, ${failed} falhas, ${total} linhas.`);
console.log(`Manifesto TTS atualizado: ${Object.keys(assets).length} clips PT/EN em ${manifestFile}.`);
if (failed) process.exitCode = 1;
