import assert from 'node:assert/strict';
import { bindGameControls } from '../src/ui/gameControls.js';

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.dataset = {};
    this.textContent = '';
  }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || new Set();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }
  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type);
    handlers?.delete(handler);
  }
  fire(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler({ target: this, ...event });
  }
  count(type) { return this.listeners.get(type)?.size || 0; }
}

const ids = [
  'chat-form', 'chat-input', 'chat-chips', 'btn-decisao', 'btn-voltar', 'conduta-cards',
  'btn-confirmar', 'mip-list', 'btn-proximo', 'btn-repetir', 'btn-exportar', 'btn-fases',
  'btn-plantao-menu', 'btn-zerar-progresso', 'btn-tts',
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
const calls = [];
const call = (name) => (...args) => calls.push([name, ...args]);
const unbind = bindGameControls({
  elements,
  onSubmit: call('submit'),
  onQuestionChip: call('chip'),
  onDecision: call('decision'),
  onBackToAnamnesis: call('back'),
  onSelectDecision: call('select'),
  onConfirmDecision: call('confirm'),
  onMipChange: call('mip'),
  onNextPatient: call('next'),
  onRepeatPatient: call('repeat'),
  onExportReport: call('export'),
  onOpenMenu: call('menu'),
  onPlantaoMenu: call('shift-menu'),
  onResetProgress: call('reset'),
  onToggleTts: call('tts'),
});

let prevented = false;
elements['chat-form'].fire('submit', { preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(calls.filter(([name]) => name === 'submit').length, 1);

prevented = false;
elements['chat-input'].fire('keydown', { key: 'Enter', shiftKey: false, preventDefault() { prevented = true; } });
assert.equal(prevented, true);
elements['chat-input'].fire('keydown', { key: 'Enter', shiftKey: true, preventDefault() { prevented = true; } });
assert.equal(calls.filter(([name]) => name === 'submit').length, 2, 'Shift+Enter keeps its default newline behavior');

const chip = { dataset: { q: 'Pergunta exemplo' }, textContent: 'Pergunta rápida' };
elements['chat-chips'].fire('click', { target: { closest: (selector) => selector === 'button[data-q]' ? chip : null } });
const choice = { dataset: { conduta: 'sugerir' } };
elements['conduta-cards'].fire('click', { target: { closest: (selector) => selector === '[data-conduta]' ? choice : null } });
assert.deepEqual(calls.filter(([name]) => ['chip', 'select'].includes(name)), [
  ['chip', chip], ['select', 'sugerir'],
]);

for (const [id, type, name] of [
  ['btn-decisao', 'click', 'decision'], ['btn-voltar', 'click', 'back'], ['btn-confirmar', 'click', 'confirm'],
  ['mip-list', 'change', 'mip'], ['btn-proximo', 'click', 'next'], ['btn-repetir', 'click', 'repeat'],
  ['btn-exportar', 'click', 'export'], ['btn-fases', 'click', 'menu'], ['btn-plantao-menu', 'click', 'shift-menu'],
  ['btn-zerar-progresso', 'click', 'reset'], ['btn-tts', 'click', 'tts'],
]) elements[id].fire(type);
assert.deepEqual(calls.slice(-11).map(([name]) => name), [
  'decision', 'back', 'confirm', 'mip', 'next', 'repeat', 'export', 'menu', 'shift-menu', 'reset', 'tts',
]);

unbind();
assert.equal(elements['chat-form'].count('submit'), 0);
assert.equal(elements['chat-input'].count('keydown'), 0);
assert.equal(elements['btn-tts'].count('click'), 0);
elements['chat-form'].fire('submit', { preventDefault() {} });
assert.equal(calls.filter(([name]) => name === 'submit').length, 2, 'cleanup removes the form handler');

const unbindWithoutOptionalControls = bindGameControls({
  elements: { ...elements, 'btn-plantao-menu': null, 'btn-zerar-progresso': null },
  onSubmit: call('submit'), onQuestionChip: call('chip'), onDecision: call('decision'),
  onBackToAnamnesis: call('back'), onSelectDecision: call('select'), onConfirmDecision: call('confirm'),
  onMipChange: call('mip'), onNextPatient: call('next'), onRepeatPatient: call('repeat'),
  onExportReport: call('export'), onOpenMenu: call('menu'), onPlantaoMenu: call('shift-menu'),
  onResetProgress: call('reset'), onToggleTts: call('tts'),
});
unbindWithoutOptionalControls();

console.log('PASS game controls: submit, keyboard newline, chips, decisions, navigation, optional controls and cleanup');
