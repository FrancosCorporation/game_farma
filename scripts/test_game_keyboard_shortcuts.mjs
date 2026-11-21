import assert from 'node:assert/strict';
import { bindGameKeyboardShortcuts } from '../src/ui/gameKeyboard.js';

const input = {};
let state = 'ANAMNESE';
let lastPatientLine = 'Bom dia, estou com dor.';
let patientVoice = 'pt-BR-Female';
const cards = Array.from({ length: 3 }, (_, index) => ({ index, clicks: 0, click() { this.clicks += 1; } }));
const spoken = [];
let returned = 0;
const listeners = new Map();
const fakeDocument = {
  activeElement: null,
  addEventListener(type, callback) { listeners.set(type, callback); },
  removeEventListener(type, callback) {
    if (listeners.get(type) === callback) listeners.delete(type);
  },
};
const unbind = bindGameKeyboardShortcuts({
  documentTarget: fakeDocument,
  getState: () => state,
  chatInput: input,
  getLastPatientLine: () => lastPatientLine,
  getPatientVoice: () => patientVoice,
  selectDecisionByIndex: (index) => {
    if (!cards[index]) return false;
    cards[index].click();
    return true;
  },
  backToAnamnesis: () => { returned += 1; state = 'ANAMNESE'; },
  speak: (...args) => spoken.push(args),
});
assert.equal(listeners.has('keydown'), true);

const dispatch = (key, overrides = {}) => {
  let prevented = false;
  listeners.get('keydown')({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    preventDefault() { prevented = true; },
    ...overrides,
  });
  return prevented;
};

state = 'DECISAO';
assert.equal(dispatch('2'), true);
assert.deepEqual(cards.map((card) => card.clicks), [0, 1, 0]);
assert.equal(dispatch('3', { ctrlKey: true }), false);
assert.equal(dispatch('1', { isComposing: true }), false);
assert.deepEqual(cards.map((card) => card.clicks), [0, 1, 0]);
assert.equal(dispatch('Escape'), true);
assert.equal(returned, 1);
assert.equal(state, 'ANAMNESE');

fakeDocument.activeElement = null;
assert.equal(dispatch('R'), false);
assert.deepEqual(spoken, [['Bom dia, estou com dor.', 'pt-BR-Female']]);
fakeDocument.activeElement = input;
dispatch('r');
assert.equal(spoken.length, 1, 'repeat shortcut does not interrupt typing');
fakeDocument.activeElement = null;
lastPatientLine = '';
dispatch('r');
assert.equal(spoken.length, 1, 'repeat shortcut ignores an empty patient line');

unbind();
assert.equal(listeners.has('keydown'), false);
console.log('✔ game keyboard shortcuts: decision keys, Escape, replay guard and cleanup');
