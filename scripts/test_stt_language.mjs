import assert from 'node:assert/strict';

const listeners = new Map();
const status = { textContent: '' };
const button = {
  hidden: false,
  attributes: {},
  handlers: {},
  addEventListener(type, fn) { this.handlers[type] = fn; },
  setAttribute(name, value) { this.attributes[name] = value; },
};
globalThis.document = {
  documentElement: { lang: 'pt-BR' },
  addEventListener(type, fn) {
    const callbacks = listeners.get(type) || [];
    callbacks.push(fn);
    listeners.set(type, callbacks);
  },
  dispatchEvent(event) {
    for (const callback of listeners.get(event.type) || []) callback(event);
    return true;
  },
  getElementById(id) { return id === 'btn-mic' ? button : id === 'mic-status' ? status : null; },
};
globalThis.localStorage = { getItem: () => null, setItem() {} };

const recognitions = [];
class FakeRecognition {
  constructor() { this.startCount = 0; this.stopCount = 0; this.failStart = false; recognitions.push(this); }
  start() {
    if (this.failStart) { this.failStart = false; throw new Error('start failed'); }
    this.startCount++;
  }
  stop() { this.stopCount++; this.onend?.(); }
}
globalThis.window = { SpeechRecognition: FakeRecognition };

const { createDictation } = await import('../src/audio/stt.js');
const { setLang } = await import('../src/ui/i18n.js');
const input = { value: '' };
const submitted = [];
const dictation = createDictation(input, { onSubmit: () => submitted.push(input.value) });
const rec = recognitions[0];

assert.equal(dictation.supported, true);
assert.equal(rec.lang, 'pt-BR');
button.handlers.click();
assert.equal(dictation.active, true);
assert.equal(button.attributes['aria-pressed'], 'true');

setLang('en');
assert.equal(rec.lang, 'en-US', 'language changes update recognizer locale');
assert.equal(dictation.active, false, 'active recognition stops on language change');
button.handlers.click();
assert.equal(rec.startCount, 2);
rec.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'hello there' }, isFinal: true }] });
assert.equal(input.value, 'hello there');
assert.match(button.textContent, /Stop & send/i, 'recording button visibly changes to stop and submit');
button.handlers.click();
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(submitted, ['hello there'], 'stopping dictation submits the recognized speech to the chat');
assert.match(button.textContent, /Speak/i, 'button returns to its ready label after sending');

input.value = '';
button.handlers.click();
rec.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'next question' }, isFinal: true }] });
rec.onend();
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(submitted, ['hello there', 'next question'], 'natural recognition end also submits the finalized transcript');

rec.onerror({ error: 'not-allowed' });
assert.equal(dictation.active, false);
assert.equal(button.attributes['aria-pressed'], 'false');
assert.match(status.textContent, /permission denied/i);

rec.failStart = true;
button.handlers.click();
assert.equal(dictation.active, false, 'start failure leaves control off');
assert.match(status.textContent, /Dictation failed/i);

setLang('pt');
assert.equal(dictation.language, 'pt-BR');
dictation.toggle();
assert.equal(dictation.active, true);
dictation.stop();
assert.equal(dictation.active, false, 'stop ends active recognizer');
assert.equal(button.attributes['aria-pressed'], 'false');
assert.equal(submitted.length, 2, 'lifecycle stop cancels dictation without submitting');

globalThis.window = {};
const unsupportedButton = { hidden: false };
document.getElementById = (id) => id === 'btn-mic' ? unsupportedButton : null;
assert.equal(createDictation(input).supported, false);
assert.equal(unsupportedButton.hidden, true, 'unsupported dictation hides its control');

console.log('PASS: STT language changes, errors, stop, and unsupported browsers');
