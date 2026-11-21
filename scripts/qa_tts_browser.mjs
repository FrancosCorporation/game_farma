// Exercita o módulo TTS real no browser sem depender de dispositivo de áudio,
// microfone ou serviço externo. Audio/speechSynthesis são dublês controláveis;
// a chamada fetch do módulo passa pelo Chromium e pelo endpoint HTTP simulado.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const portProbe = createServer();
await new Promise((ok, fail) => {
  portProbe.once('error', fail);
  portProbe.listen(0, '127.0.0.1', ok);
});
const port = portProbe.address().port;
await new Promise((ok, fail) => portProbe.close((error) => error ? fail(error) : ok()));

const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
vite.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
let browser;

let apiMode = 'failure';
const apiRequests = [];
const fixtureCaseId = 'browser-fixture';
const fixtureText = 'fala de teste no browser';
function speechHash(text) {
  let value = 5381;
  for (const char of text.trim().replace(/\s+/g, ' ')) value = ((value << 5) + value + char.charCodeAt(0)) | 0;
  return (value >>> 0).toString(36);
}
const fixtureKey = `${fixtureCaseId}/${speechHash(fixtureText)}`;
const fixtureAsset = `audio/voices/${fixtureKey}.ogg`;

try {
  const base = `http://127.0.0.1:${port}/`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${stderr}`);
    try {
      const response = await fetch(base);
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is starting */ }
    await wait(50);
  }
  assert.equal(ready, true, 'Vite starts for the isolated browser test');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/src/main.js*', (route) => route.abort());
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.route('**/audio/voices/manifest.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: 1, assets: { [fixtureKey]: fixtureAsset } }),
  }));
  await page.route('**/v1/audio/speech', async (route) => {
    apiRequests.push({
      method: route.request().method(),
      body: route.request().postDataJSON(),
    });
    if (apiMode === 'failure') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test fixture"}' });
    } else {
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('FAKE-MP3-TEST') });
    }
  });
  await page.addInitScript(() => localStorage.setItem('farmacheck:lang', 'pt'));
  await page.goto(base, { waitUntil: 'commit', timeout: 15000 });
  await page.setContent('<!doctype html><html lang="pt-BR"><head></head><body><main id="tts-test"></main></body></html>');

  await page.evaluate(async (caseId) => {
    window.__qaAudioMode = 'error';
    window.__qaAudioInstances = [];
    window.__qaNative = {
      speakCount: 0,
      cancelCount: 0,
      utterances: [],
      getVoices: () => [{ lang: 'pt-BR' }, { lang: 'en-US' }],
      cancel() { this.cancelCount++; },
      speak(utterance) {
        this.speakCount++;
        this.utterances.push({ text: utterance.text, lang: utterance.lang });
        // Native speech emits `start` before `end`; the hook test depends on
        // that lifecycle to observe both speaking=true and speaking=false.
        queueMicrotask(() => {
          utterance.onstart?.(new Event('start'));
          utterance.onend?.(new Event('end'));
        });
      },
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: window.__qaNative });
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
    window.Audio = class {
      constructor(src = '') {
        this.src = src;
        this.paused = false;
        this.currentTime = 0;
        this.volume = 1;
        window.__qaAudioInstances.push(this);
      }
      play() {
        if (window.__qaAudioMode === 'hold') return Promise.resolve();
        queueMicrotask(() => {
          if (window.__qaAudioMode === 'error') this.onerror?.(new Event('error'));
          else this.onended?.(new Event('ended'));
        });
        return Promise.resolve();
      }
      pause() { this.paused = true; }
    };

    const [{ TTS }, { setLang }] = await Promise.all([
      import('/src/audio/tts.js'), import('/src/ui/i18n.js'),
    ]);
    window.__qaTTS = TTS;
    window.__qaDefaultTtsUrl = TTS.ttsUrl;
    window.__qaSetLang = setLang;
    TTS.enabled = true;
    TTS.ttsUrl = '';
    TTS.currentCaseId = caseId;
    setLang('pt');
  }, fixtureCaseId);

  const devDefaultTtsUrl = await page.evaluate(() => window.__qaDefaultTtsUrl);
  assert.equal(devDefaultTtsUrl, '', 'Vite development defaults to native speech; it has no local /v1 route');

  const assetFallback = await page.evaluate(async () => {
    const states = [];
    const remove = window.__qaTTS.hookSpeak((speaking) => states.push(speaking));
    const played = await window.__qaTTS.play('fala de teste no browser');
    remove();
    return {
      played,
      nativeSpeakCount: window.__qaNative.speakCount,
      states,
      assetUrl: window.__qaAudioInstances[0]?.src,
      speakingAfterFinish: window.__qaTTS._speaking,
    };
  });
  assert.equal(assetFallback.played, true, 'asset failure reaches the native browser fallback');
  assert.equal(assetFallback.nativeSpeakCount, 1, 'native speech starts once after failed asset');
  assert.equal(assetFallback.assetUrl, fixtureAsset, 'manifest fixture resolves the exact hashed voice asset');
  assert.deepEqual(assetFallback.states, [true, false], 'speak hook brackets playback');
  assert.equal(assetFallback.speakingAfterFinish, false, 'speaking state clears after native completion');

  const apiFailure = await page.evaluate(async () => {
    window.__qaTTS.currentCaseId = '';
    window.__qaTTS.ttsUrl = `${location.origin}/v1`;
    window.__qaSetLang('pt');
    const before = window.__qaNative.speakCount;
    const played = await window.__qaTTS.play('fallback após erro da API');
    return { played, nativeCalls: window.__qaNative.speakCount - before };
  });
  assert.equal(apiFailure.played, true, 'API 503 reaches native fallback');
  assert.equal(apiFailure.nativeCalls, 1);
  assert.equal(apiRequests.length, 1);
  assert.equal(apiRequests[0].method, 'POST');
  assert.equal(apiRequests[0].body.voice, 'pt-BR-FranciscaNeural');
  assert.equal(apiRequests[0].body.response_format, 'mp3');

  apiMode = 'success';
  const cachedPlayback = await page.evaluate(async () => {
    window.__qaAudioMode = 'ended';
    window.__qaSetLang('en');
    const before = window.__qaTTS._cache.size;
    const first = await window.__qaTTS.play('same browser voice line');
    const afterFirst = window.__qaTTS._cache.size;
    const second = await window.__qaTTS.play('same browser voice line');
    const afterSecond = window.__qaTTS._cache.size;
    window.__qaSetLang('pt');
    const otherLanguage = await window.__qaTTS.play('same browser voice line');
    return { before, first, second, otherLanguage, afterFirst, afterSecond, finalSize: window.__qaTTS._cache.size };
  });
  assert.equal(cachedPlayback.first, true);
  assert.equal(cachedPlayback.second, true);
  assert.equal(cachedPlayback.otherLanguage, true);
  assert.equal(cachedPlayback.afterFirst, cachedPlayback.before + 1);
  assert.equal(cachedPlayback.afterSecond, cachedPlayback.afterFirst, 'same language/voice reuses cached object URL');
  assert.equal(cachedPlayback.finalSize, cachedPlayback.before + 2, 'language partitions the cache key');
  assert.equal(apiRequests.length, 3, 'one failed API request plus one request per language');
  assert.equal(apiRequests[1].body.voice, 'en-US-EmmaNeural');
  assert.equal(apiRequests[2].body.voice, 'pt-BR-FranciscaNeural');

  const stoppedPlayback = await page.evaluate(async () => {
    window.__qaAudioMode = 'hold';
    const nativeBefore = window.__qaNative.speakCount;
    const playback = window.__qaTTS.play('unique interrupted browser line');
    const deadline = performance.now() + 3000;
    while (!window.__qaTTS._activeAudio && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const active = window.__qaTTS._activeAudio;
    window.__qaTTS.stop();
    const played = await playback;
    return {
      played,
      activeWasCreated: Boolean(active),
      paused: active?.paused,
      currentTime: active?.currentTime,
      nativeCallsAfterStop: window.__qaNative.speakCount - nativeBefore,
    };
  });
  assert.equal(stoppedPlayback.activeWasCreated, true);
  assert.equal(stoppedPlayback.played, false, 'stop resolves pending browser playback as cancelled');
  assert.equal(stoppedPlayback.paused, true, 'stop pauses the active audio');
  assert.equal(stoppedPlayback.currentTime, 0, 'stop rewinds the active audio');
  assert.equal(stoppedPlayback.nativeCallsAfterStop, 0, 'stop prevents fallback from starting afterward');
  assert.deepEqual(pageErrors, [], 'the real TTS module runs without page errors');

  console.log('✅ TTS Chromium QA: asset/API fallback, native speech, language cache and stop PASS');
} finally {
  await browser?.close();
  if (vite.exitCode === null) vite.kill('SIGTERM');
  if (vite.exitCode === null) await new Promise((ok) => vite.once('close', ok));
}
