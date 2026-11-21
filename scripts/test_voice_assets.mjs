import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, localizeCase } from '../src/data/cases.js';
import { CHARACTER_VOICE_PROFILES } from '../src/data/characterVoices.js';

const publicDir = resolve(process.env.VOICE_PUBLIC_DIR || fileURLToPath(new URL('../public/', import.meta.url)));
const manifestPath = join(publicDir, 'audio/voices/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.version, 2, 'voice manifest includes phrase metadata for joined deterministic replies');
assert.equal(manifest.provider, 'microsoft-edge-tts', 'published speech assets use the Microsoft neural voice generator');
assert.ok(manifest.assets && typeof manifest.assets === 'object');
assert.ok(manifest.phrases && typeof manifest.phrases === 'object');
assert.deepEqual(Object.keys(manifest.speakers || {}).sort(), Object.keys(CHARACTER_VOICE_PROFILES).sort(), 'manifest records a voice profile for all 14 characters');
for (const [caseId, profile] of Object.entries(CHARACTER_VOICE_PROFILES)) {
  assert.deepEqual(manifest.speakers[caseId], { gender: profile.gender, pt: profile.pt, en: profile.en });
  assert.match(profile.pt, profile.gender === 'female' ? /^(pt-BR-Francisca|pt-BR-Thalita)/ : /^pt-BR-Antonio/,
    `${caseId} uses a Portuguese voice matching the character gender`);
  assert.match(profile.en, profile.gender === 'female' ? /^(en-US-(Ava|Jenny|Emma|Michelle|Aria|Ana))/ : /^en-US-(Christopher|Andrew|Brian|Guy|Roger|Eric)/,
    `${caseId} uses an English voice matching the character gender`);
}

function hash(text) {
  let value = 5381;
  for (const char of text.trim().replace(/\s+/g, ' ')) value = ((value << 5) + value + char.charCodeAt(0)) | 0;
  return (value >>> 0).toString(36);
}

function collectLines(patient) {
  const lines = new Set();
  const add = (text) => { if (text) lines.add(String(text).trim().replace(/\s+/g, ' ')); };
  add(patient.abertura);
  for (const fact of patient.fatos || []) { add(fact.falaLeiga); add(fact.falaEvasiva); }
  add(patient.persona.falaForaDominio);
  add(patient.persona.falaRepetida);
  for (const outcome of Object.values(patient.consequencias || {})) {
    add(outcome.titulo);
    add(outcome.texto);
    add(`${outcome.titulo}. ${outcome.texto}`);
  }
  return lines;
}

const expected = new Map();
for (const language of ['pt', 'en']) {
  for (const sourceCase of CASES) {
    const patient = localizeCase(sourceCase, language);
    for (const phrase of collectLines(patient)) {
      const key = `${sourceCase.id}/${hash(phrase)}`;
      expected.set(key, phrase);
    }
  }
}

assert.deepEqual(Object.keys(manifest.assets).sort(), [...expected.keys()].sort(), 'every built-in patient utterance has one clip and no stale manifest entry remains');
assert.deepEqual(Object.keys(manifest.phrases).sort(), [...expected.keys()].sort(), 'all speech clips are segmentable for deterministic multi-fact replies');

let totalBytes = 0;
for (const [key, phrase] of expected) {
  assert.equal(manifest.phrases[key], phrase, `phrase metadata matches source text: ${key}`);
  assert.equal(key.split('/')[1], hash(phrase), `clip key matches the normalized source phrase: ${key}`);
  const relativePath = manifest.assets[key];
  assert.match(relativePath, /^audio\/voices(?:-[a-z0-9-]+)?\/[a-z0-9_-]+\/[a-z0-9]+\.ogg$/, `clip path is relative to the game URL: ${key}`);
  const file = join(publicDir, relativePath);
  const bytes = await readFile(file);
  assert.ok(bytes.length > 64, `clip contains encoded audio: ${key}`);
  assert.equal(bytes.toString('ascii', 0, 4), 'OggS', `clip is Ogg/Vorbis: ${key}`);
  totalBytes += bytes.length;
}

const caseIds = new Set(CASES.map((patient) => patient.id));
const roots = new Set(Object.values(manifest.assets).map((path) => path.split('/').slice(0, 2).join('/')));
assert.equal(roots.size, 1, 'all current voice assets share one versioned root');
const activeRoot = join(publicDir, [...roots][0]);
const actualCaseDirs = (await readdir(activeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
assert.deepEqual(actualCaseDirs, [...caseIds].sort(), 'assets exist only for the 14 clinical cases');
for (const caseId of caseIds) {
  const directory = join(activeRoot, caseId);
  const files = (await readdir(directory)).sort();
  const expectedFiles = Object.entries(manifest.assets)
    .filter(([key]) => key.startsWith(`${caseId}/`))
    .map(([, relativePath]) => relativePath.split('/').at(-1)).sort();
  assert.deepEqual(files, expectedFiles, `the ${caseId} directory has no orphan clips`);
  assert.ok((await stat(directory)).isDirectory());
}

console.log(`PASS: ${expected.size} PT/EN Microsoft neural clips match 14 gendered character profiles (${(totalBytes / 1024 / 1024).toFixed(2)} MiB).`);
