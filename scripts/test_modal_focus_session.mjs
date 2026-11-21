import assert from 'node:assert/strict';
import { createModalFocusSession } from '../src/ui/focus.js';

class FakeElement {
  constructor() {
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.isConnected = true;
    this.tabIndex = 0;
    this.parentElement = null;
    this.listeners = new Map();
    this.focusCount = 0;
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  querySelectorAll() { return []; }
  matches(selector) { return selector === ':disabled' && this.disabled; }
  closest() { return null; }
  getClientRects() { return this.hidden ? [] : [{}]; }
  focus() { this.focusCount += 1; globalThis.document.activeElement = this; }
}

const oldDocument = globalThis.document;
const oldHTMLElement = globalThis.HTMLElement;
const doc = { activeElement: null, body: new FakeElement() };
globalThis.document = doc;
globalThis.HTMLElement = FakeElement;

try {
  const backgroundA = new FakeElement();
  const backgroundB = new FakeElement();
  backgroundB.inert = true;
  const overlay = new FakeElement();
  overlay.hidden = true;
  const parent = { children: [backgroundA, overlay, backgroundB] };
  overlay.parentElement = parent;

  const trigger = new FakeElement();
  doc.activeElement = trigger;
  const modal = createModalFocusSession(overlay);

  assert.equal(modal.open(), true);
  assert.equal(overlay.hidden, false);
  assert.equal(backgroundA.inert, true);
  assert.equal(backgroundB.inert, true);
  assert.equal(overlay.listeners.size, 1);
  assert.equal(modal.open(), false, 'opening an already-open modal is idempotent');
  assert.equal(overlay.listeners.size, 1, 'duplicate open does not install a second trap');

  assert.equal(modal.close(), true);
  assert.equal(overlay.hidden, true);
  assert.equal(backgroundA.inert, false, 'close restores the original inert state');
  assert.equal(backgroundB.inert, true, 'close preserves a sibling that was already inert');
  assert.equal(overlay.listeners.size, 0, 'close removes the key handler');
  assert.equal(doc.activeElement, trigger, 'close returns focus to the original trigger');
  assert.equal(modal.close(), false, 'closing an already-closed modal is idempotent');

  const staleTrigger = new FakeElement();
  const fallback = new FakeElement();
  doc.activeElement = staleTrigger;
  assert.equal(modal.open(), true);
  staleTrigger.isConnected = false;
  assert.equal(modal.close(fallback), true);
  assert.equal(doc.activeElement, fallback, 'close uses the fallback when the original trigger is stale');
  assert.equal(overlay.listeners.size, 0);

  console.log('PASS modal focus session: idempotent open/close, inert restoration, trigger and fallback focus');
} finally {
  if (oldDocument === undefined) delete globalThis.document;
  else globalThis.document = oldDocument;
  if (oldHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = oldHTMLElement;
}
