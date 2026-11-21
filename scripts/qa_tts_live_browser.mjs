// Integra o TTS real do jogo com o servidor de voz acessível por HTTP.
// QA_TTS_ENGINE_URL aponta para a base do FarmaCheck em container/servidor local.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const engineBase = process.env.QA_TTS_ENGINE_URL;
if (!engineBase) throw new Error('Defina QA_TTS_ENGINE_URL para o servidor com eSpeak NG.');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const probe = createServer();
await new Promise((resolveListen, reject) => {
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', resolveListen);
});
const port = probe.address().port;
await new Promise((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()));

const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let viteErrors = '';
vite.stderr.setEncoding('utf8').on('data', (chunk) => { viteErrors += chunk; });
let browser;
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const engineRequests = [];

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveClose) => {
    child.once('close', resolveClose);
    child.kill('SIGTERM');
  });
}

try {
  const appBase = `http://127.0.0.1:${port}/`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${viteErrors}`);
    try {
      if ((await fetch(appBase)).status === 200) { ready = true; break; }
    } catch { /* Vite is starting */ }
    await wait(50);
  }
  assert.equal(ready, true, 'Vite starts for live browser playback');

  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/src/main.js*', (route) => route.abort());
  await page.route('**/v1/audio/speech', async (route) => {
    const target = new URL('/v1/audio/speech', engineBase).toString();
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: route.request().postData(),
    });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    engineRequests.push({ status: upstream.status, contentType: upstream.headers.get('content-type'), bytes: bytes.length });
    await route.fulfill({
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store',
      },
      body: bytes,
    });
  });
  await page.goto(appBase, { waitUntil: 'domcontentloaded' });
  await page.setContent('<!doctype html><html lang="pt-BR"><body><main>live TTS test</main></body></html>');

  const languages = await page.evaluate(async () => {
    const [{ TTS }, { setLang }] = await Promise.all([
      import('/src/audio/tts.js'), import('/src/ui/i18n.js'),
    ]);
    window.__liveTTS = TTS;
    TTS.enabled = true;
    TTS.currentCaseId = '';
    TTS.ttsUrl = '/v1';
    setLang('pt');
    const portuguese = await TTS.play('A paciente relata dor de cabeça e febre.');
    setLang('en');
    const english = await TTS.play('The patient reports a headache and fever.');
    return { portuguese, english };
  });
  assert.deepEqual(languages, { portuguese: true, english: true }, 'real TTS module plays both language speech streams to completion');

  const stopped = await page.evaluate(async () => {
    const TTS = window.__liveTTS;
    const playback = TTS.play('This longer sentence should stop immediately when the user mutes narration. '.repeat(8));
    const deadline = performance.now() + 5000;
    while (!TTS._activeAudio && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    const audio = TTS._activeAudio;
    TTS.setEnabled(false);
    const result = await playback;
    TTS.setEnabled(true);
    return { active: Boolean(audio), result, paused: audio?.paused, position: audio?.currentTime };
  });
  assert.deepEqual(stopped, { active: true, result: false, paused: true, position: 0 }, 'mute cancels real browser audio and prevents a later fallback');

  const replaced = await page.evaluate(async () => {
    const TTS = window.__liveTTS;
    const firstPlayback = TTS.play('This first case must stop when the next case begins. '.repeat(8));
    const deadline = performance.now() + 5000;
    while (!TTS._activeAudio && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    const firstAudio = TTS._activeAudio;
    const secondPlayback = TTS.play('The next patient is ready for the consultation.');
    const firstResult = await firstPlayback;
    const secondResult = await secondPlayback;
    return { active: Boolean(firstAudio), firstResult, firstPaused: firstAudio?.paused, secondResult };
  });
  assert.deepEqual(replaced, { active: true, firstResult: false, firstPaused: true, secondResult: true }, 'changing the active phrase stops the prior WAV before the next one plays');
  assert.deepEqual(pageErrors, [], 'live speech playback has no page errors');
  assert.equal(engineRequests.length, 5, 'each uncached phrase reaches the actual local TTS server');
  assert.ok(engineRequests.every((request) => request.status === 200 && /audio\/(?:wav|mpeg)/.test(request.contentType || '') && request.bytes > 44));
  console.log(`PASS: live TTS PT/EN playback, mute and no-overlap; ${engineRequests.length} actual speech streams (${[...new Set(engineRequests.map((item) => item.contentType))].join(', ')}), ${engineRequests.reduce((sum, request) => sum + request.bytes, 0)} bytes`);
} finally {
  await browser?.close();
  await stop(vite);
}
