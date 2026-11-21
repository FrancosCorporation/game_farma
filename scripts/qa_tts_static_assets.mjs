// Valida clips reais servidos pelo Vite sem depender de endpoint TTS ou voz do sistema.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const portProbe = createServer();
await new Promise((resolveListen, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolveListen);
});
const port = portProbe.address().port;
await new Promise((resolveClose, reject) => portProbe.close((error) => error ? reject(error) : resolveClose()));

const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let viteErrors = '';
vite.stderr.setEncoding('utf8').on('data', (chunk) => { viteErrors += chunk; });
let browser;
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveClose) => {
    child.once('close', resolveClose);
    child.kill('SIGTERM');
  });
}

try {
  const base = `http://127.0.0.1:${port}/`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${viteErrors}`);
    try {
      if ((await fetch(base)).status === 200) { ready = true; break; }
    } catch { /* wait for Vite */ }
    await wait(50);
  }
  assert.equal(ready, true, 'Vite serves the game before voice playback');

  browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-gpu', '--disable-extensions', '--disable-background-networking'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  const voiceResponses = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/audio/voices/')) {
      voiceResponses.push({ status: response.status(), url: response.url(), type: response.headers()['content-type'] });
    }
  });
  await page.route('**/src/main.js*', (route) => route.abort());
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.addInitScript(() => {
    window.__nativeSpeakCount = 0;
    if (window.speechSynthesis) {
      const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (utterance) => {
        window.__nativeSpeakCount++;
        return speak(utterance);
      };
    }
  });
  await page.goto(base, { waitUntil: 'commit', timeout: 15000 });
  await page.setContent('<!doctype html><html lang="pt-BR"><body><main>static speech test</main></body></html>');

  const playback = await page.evaluate(async () => {
    const [{ TTS }, { CASES, localizeCase }, { setLang }] = await Promise.all([
      import('/src/audio/tts.js'), import('/src/data/cases.js'), import('/src/ui/i18n.js'),
    ]);
    TTS.enabled = true;
    TTS.ttsUrl = '';
    const patient = CASES.find((item) => item.id === 'ana_coriza');
    TTS.setCase(patient.id);
    setLang('pt');
    const portugueseOpening = await TTS.play(patient.abertura);
    const lines = patient.fatos.filter((fact) => fact.falaLeiga).slice(0, 2).map((fact) => fact.falaLeiga);
    const composedReply = await TTS.play(lines.join(' '));
    const englishPatient = localizeCase(patient, 'en');
    setLang('en');
    const englishOpening = await TTS.play(englishPatient.abertura);

    const outcome = patient.consequencias.sugerir;
    const outcomeLine = `${outcome.titulo}. ${outcome.texto}`;
    let hash = 5381;
    for (const char of outcomeLine.trim().replace(/\s+/g, ' ')) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
    const manifest = await (await fetch('audio/voices/manifest.json')).json();
    const outcomeKey = `${patient.id}/${(hash >>> 0).toString(36)}`;
    const expectedOutcomeUrl = new URL(manifest.assets[outcomeKey], location.href).href;
    const interrupted = TTS.play(outcomeLine);
    const deadline = performance.now() + 3000;
    while (!TTS._activeAudio && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    const active = TTS._activeAudio;
    TTS.stop();
    const interruptedResult = await interrupted;
    return {
      portugueseOpening,
      composedReply,
      englishOpening,
      interruptedResult,
      active: Boolean(active),
      paused: active?.paused,
      activeSrc: active?.src,
      expectedOutcomeUrl,
      nativeSpeakCount: window.__nativeSpeakCount,
    };
  });

  const { activeSrc, expectedOutcomeUrl, ...playbackState } = playback;
  assert.deepEqual(playbackState, {
    portugueseOpening: true,
    composedReply: true,
    englishOpening: true,
    interruptedResult: false,
    active: true,
    paused: true,
    nativeSpeakCount: 0,
  }, 'PT/EN openings, composed replies and the exact outcome line play from assets without system voices; stop cancels cleanly');
  assert.equal(activeSrc, expectedOutcomeUrl, 'the narrated outcome title and text resolve to their exact combined clip');
  assert.ok(voiceResponses.length >= 5, 'the browser fetched manifest and real Ogg clips');
  assert.ok(voiceResponses.every((response) => [200, 206].includes(response.status)),
    `every speech asset returned HTTP 200 or a valid byte range 206: ${JSON.stringify(voiceResponses)}`);
  assert.ok(voiceResponses.filter((response) => response.type?.startsWith('audio/ogg')).length >= 4,
    'the browser received playable Ogg media');
  assert.deepEqual(pageErrors, [], 'static speech playback has no page errors');
  console.log(`PASS: real PT/EN static TTS playback, joined response segments and stop; ${voiceResponses.length} voice requests, no OS voice needed.`);
} finally {
  await browser?.close();
  await stop(vite);
}
