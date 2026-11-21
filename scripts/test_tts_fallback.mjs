import assert from 'node:assert/strict';

const audioInstances = [];
let audioMode = 'reject';
const native = {
  speakCount: 0,
  cancelCount: 0,
  getVoices: () => [],
  cancel() { this.cancelCount++; },
  speak(utterance) {
    this.speakCount++;
    queueMicrotask(() => {
      utterance.onstart?.();
      utterance.onboundary?.({ charIndex: 1 });
      utterance.onend?.();
    });
  },
};

globalThis.window = { speechSynthesis: native };
globalThis.speechSynthesis = native;
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};
globalThis.Audio = class {
  constructor(src = '') { this.sources = []; this.src = src; this.paused = false; this.duration = 1; this.currentTime = 0; audioInstances.push(this); }
  set src(value) { this._src = value; this.sources.push(value); }
  get src() { return this._src; }
  play() {
    if (audioMode === 'reject') return Promise.reject(new Error('audio unavailable'));
    queueMicrotask(() => {
      this.onplay?.();
      this.currentTime = 0.25;
      this.ontimeupdate?.();
      if (audioMode !== 'hold') this.onended?.();
    });
    return Promise.resolve();
  }
  pause() { this.paused = true; }
};

const objectUrl = URL.createObjectURL;
URL.createObjectURL = () => 'blob:tts-test';

function assetKey(text, caseId = 'caso-teste') {
  const normalized = text.trim().replace(/\s+/g, ' ');
  let value = 5381;
  for (let index = 0; index < normalized.length; index++) value = ((value << 5) + value + normalized.charCodeAt(index)) | 0;
  return `${caseId}/${(value >>> 0).toString(36)}`;
}

const { TTS } = await import('../src/audio/tts.js');
const speakEvents = [];
TTS.hookSpeak((on, text, progress, duration) => speakEvents.push({ on, text, progress, duration }));
TTS.enabled = true;
TTS.currentCaseId = 'caso-teste';
TTS._assetManifest = new Map();
TTS._assetPhrases = new Map();
TTS._assetManifestPromise = null;

// TTS hooks must be removable so an evicted patient is not retained by the global Set.
const speakHook = () => {};
const unhookSpeak = TTS.hookSpeak(speakHook);
assert.equal(TTS._speakHooks.has(speakHook), true);
assert.equal(unhookSpeak(), true);
assert.equal(TTS._speakHooks.has(speakHook), false);

// Frase sem asset não deve requisitar arquivo inexistente nem criar áudio inválido.
audioMode = 'reject';
TTS.ttsUrl = '';
let manifestRequests = 0;
globalThis.fetch = async (url) => {
  assert.equal(url, 'audio/voices/manifest.json');
  manifestRequests++;
  return { ok: true, json: async () => ({ version: 1, assets: {} }) };
};
const nativeBefore = native.speakCount;
const audioBeforeMissing = audioInstances.length;
assert.equal(await TTS.play('fala de teste'), true);
assert.equal(native.speakCount, nativeBefore + 1);
assert.equal(audioInstances.length, audioBeforeMissing);
assert.equal(manifestRequests, 1);
assert.ok(speakEvents.some((event) => event.on && event.text === 'fala de teste' && event.progress === 0),
  'native speech start publishes the spoken text and initial progress');
assert.ok(speakEvents.some((event) => event.on && event.progress > 0),
  'native speech boundaries publish progress for lip sync');
assert.equal(speakEvents.at(-1).on, false, 'native speech completion closes the speaking state');

// Repetir a mesma fala usa o cache bounded de ausências e vai direto ao fallback.
const nativeBeforeCachedMiss = native.speakCount;
assert.equal(await TTS.play('fala de teste'), true);
assert.equal(native.speakCount, nativeBeforeCachedMiss + 1);
assert.equal(manifestRequests, 1);

// Se o asset existe mas a reprodução falha, a narração nativa continua sendo o fallback.
TTS._assetManifestPromise = null;
globalThis.fetch = async (url) => {
  assert.equal(url, 'audio/voices/manifest.json');
  const key = assetKey('asset existe, áudio indisponível');
  return { ok: true, json: async () => ({ version: 1, assets: { [key]: `audio/voices/${key}.ogg` } }) };
};
const audioBeforePresent = audioInstances.length;
const nativeBeforePresent = native.speakCount;
assert.equal(await TTS.play('asset existe, áudio indisponível'), true);
assert.equal(audioInstances.length, audioBeforePresent + 1);
assert.equal(native.speakCount, nativeBeforePresent + 1);

// Respostas determinísticas compostas por vários fatos reproduzem os clipes em sequência.
TTS._assetManifestPromise = null;
audioMode = 'end';
const phraseParts = ['A paciente relata dor lombar.', 'A paciente nega febre.'];
const phraseEntries = phraseParts.map((phrase) => {
  const key = assetKey(phrase);
  return [key, phrase, `audio/voices/${key}.ogg`];
});
globalThis.fetch = async (url) => {
  assert.equal(url, 'audio/voices/manifest.json');
  return {
    ok: true,
    json: async () => ({
      version: 2,
      assets: Object.fromEntries(phraseEntries.map(([key, , path]) => [key, path])),
      phrases: Object.fromEntries(phraseEntries.map(([key, phrase]) => [key, phrase])),
    }),
  };
};
const audioBeforeSequence = TTS._audioElement?.sources.length || 0;
const nativeBeforeSequence = native.speakCount;
assert.equal(await TTS.play(phraseParts.join(' ')), true);
assert.deepEqual(TTS._audioElement.sources.slice(audioBeforeSequence), phraseEntries.map(([, , path]) => path),
  'one unlocked media element plays cached phrase segments in sequence');
assert.equal(native.speakCount, nativeBeforeSequence, 'cached phrase segments do not require an OS voice');
TTS.setCase('caso-teste_s123456');
assert.equal(await TTS.play(phraseParts[0]), true, 'Free Shift case IDs reuse the base case voice clip');
TTS.setCase('caso-teste');

// Endpoint API não configurado corretamente/devolvendo erro não pode engolir o fallback.
let requestedUrl = '';
globalThis.fetch = async (url) => {
  requestedUrl = url;
  return { ok: false, status: 503 };
};
TTS.ttsUrl = 'https://tts.example/v1';
const fallbackBefore = native.speakCount;
assert.equal(await TTS.play('outra fala'), true);
assert.equal(requestedUrl, 'https://tts.example/v1/audio/speech');
assert.equal(native.speakCount, fallbackBefore + 1);

// API playback waits for completion and reuses a cache partitioned by voice/language.
audioMode = 'end';
TTS.currentCaseId = '';
let apiCalls = 0;
globalThis.fetch = async (url) => {
  requestedUrl = url;
  apiCalls++;
  return {
    ok: true,
    headers: { get: () => 'audio/mpeg' },
    blob: async () => ({ type: 'audio/mpeg' }),
  };
};
const nativeDuringApi = native.speakCount;
assert.equal(await TTS.play('fala via API'), true);
assert.equal(await TTS.play('fala via API'), true);
assert.equal(apiCalls, 1);
assert.equal(native.speakCount, nativeDuringApi);
assert.ok(speakEvents.some((event) => event.on && event.text === 'fala via API' && event.progress === 0),
  'audio playback start begins the speech hook');
assert.ok(speakEvents.some((event) => event.on && event.text === 'fala via API' && event.progress === 0.25),
  'audio currentTime is forwarded as speech progress');

// SPA fallback HTML pode responder 200 na rota de áudio, mas não é um áudio tocável.
TTS._cache.clear();
globalThis.fetch = async () => ({
  ok: true,
  headers: { get: () => 'text/html; charset=utf-8' },
});
const nativeBeforeHtmlResponse = native.speakCount;
assert.equal(await TTS.play('resposta do servidor foi HTML'), true);
assert.equal(native.speakCount, nativeBeforeHtmlResponse + 1);
assert.equal(audioInstances.at(-1).src, 'blob:tts-test');

// stop() encerra áudio em andamento e impede que um fallback comece depois.
audioMode = 'hold';
globalThis.fetch = async () => ({
  ok: true,
  headers: { get: () => 'audio/mpeg' },
  blob: async () => ({ type: 'audio/mpeg' }),
});
const stopBefore = native.speakCount;
const playback = TTS.play('fala interrompida');
await new Promise((resolve) => setImmediate(resolve));
const active = audioInstances.at(-1);
assert.ok(active);
TTS.stop();
assert.equal(await playback, false);
assert.equal(active.paused, true);
assert.equal(native.speakCount, stopBefore);

TTS.ttsUrl = '';
TTS.enabled = false;
assert.equal(await TTS.play('silêncio'), false);

URL.createObjectURL = objectUrl;
console.log('PASS: TTS API/asset fallback e stop');
