import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const portProbe = createServer();
await new Promise((resolveListen, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolveListen);
});
const port = portProbe.address().port;
await new Promise((resolveClose, reject) => portProbe.close((error) => error ? reject(error) : resolveClose()));

const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, TTS_ENGINE: process.env.QA_TTS_ENGINE || 'espeak', HOST: '127.0.0.1', PORT: String(port), FARMA_DIST_DIR: resolve(root, 'dist') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
server.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
server.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
const base = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function requestSpeech(body, headers = { 'Content-Type': 'application/json' }) {
  return fetch(`${base}/v1/audio/speech`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`server exited early (${server.exitCode}): ${stderr}`);
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* wait for the HTTP listener */ }
    await wait(50);
  }
  assert.equal(ready, true, 'HTTP server starts before speech requests');

  const wrongMethod = await fetch(`${base}/v1/audio/speech`);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');

  const wrongType = await requestSpeech('{}', { 'Content-Type': 'text/plain' });
  assert.equal(wrongType.status, 415);
  const malformed = await requestSpeech('{');
  assert.equal(malformed.status, 400);
  const empty = await requestSpeech({ input: '  ', voice: 'pt-BR' });
  assert.equal(empty.status, 400);
  const unsupportedLanguage = await requestSpeech({ input: 'Hello.', voice: 'fr-FR' });
  assert.equal(unsupportedLanguage.status, 400);
  const unsupportedVoice = await requestSpeech({ input: 'Hello.', voice: 'pt-BR-FakeNeural' });
  assert.equal(unsupportedVoice.status, 400);
  const invalidSpeed = await requestSpeech({ input: 'Hello.', voice: 'en-US', speed: 4 });
  assert.equal(invalidSpeed.status, 400);
  const invalidPitch = await requestSpeech({ input: 'Hello.', voice: 'en-US', pitch: 0 });
  assert.equal(invalidPitch.status, 400);
  const oversized = await requestSpeech({ input: 'x'.repeat(9000), voice: 'pt-BR' });
  assert.equal(oversized.status, 413);

  for (const sample of [
    { input: 'A paciente relata dor de cabeça e febre.', voice: 'pt-BR-FranciscaNeural' },
    { input: 'The patient reports a headache and fever.', voice: 'en-US-ChristopherNeural' },
  ]) {
    const response = await requestSpeech(sample);
    assert.equal(response.status, 200, `${sample.voice} synthesizes successfully`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const audio = Buffer.from(await response.arrayBuffer());
    assert.ok(audio.length > 64, 'synthesized audio contains sample data');
    if (process.env.QA_TTS_ENGINE === 'edge-tts') {
      assert.match(response.headers.get('content-type') || '', /^audio\/mpeg/);
      assert.ok(audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0), 'Microsoft response is an MP3 stream');
    } else {
      assert.match(response.headers.get('content-type') || '', /^audio\/wav/);
      assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
      assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
    }
  }

  assert.equal(server.exitCode, null, 'invalid and valid speech requests leave the server alive');
  let records = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    records = stdout.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    if (records.filter((item) => item.route === 'tts-speech' && item.status === 200).length === 2) break;
    await wait(10);
  }
  assert.equal(records.filter((item) => item.route === 'tts-speech' && item.status === 200).length, 2);
  assert.doesNotMatch(stdout + stderr, /paciente relata|patient reports/);
  console.log(`PASS: ${process.env.QA_TTS_ENGINE === 'edge-tts' ? 'Microsoft Edge TTS' : 'eSpeak NG'} endpoint produces PT/EN audio; request bounds and HTTP errors verified`);
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    await new Promise((resolveClose) => {
      server.once('close', resolveClose);
      server.kill('SIGTERM');
    });
  }
}
