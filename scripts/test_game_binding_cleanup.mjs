import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

class FakeElement {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    const entries = this.listeners.get(type) || new Set();
    entries.add(handler);
    this.listeners.set(type, entries);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  count() { return [...this.listeners.values()].reduce((sum, entries) => sum + entries.size, 0); }
}

const ids = [
  'chat-log', 'chat-input', 'chat-form', 'chat-chips', 'chat-nome', 'chat-avatar', 'chat-status',
  'chat-contador', 'chat-cobertura', 'hud-paciente', 'hud-fila', 'hud-fase', 'hud-score', 'hud-combo',
  'menu-meta', 'debrief-conquistas', 'btn-decisao', 'decision', 'redflag-list', 'mip-box',
  'conduta-cards', 'mip-list', 'orient-list', 'btn-voltar', 'btn-confirmar', 'btn-proximo', 'btn-repetir',
  'btn-exportar', 'btn-fases', 'btn-zerar-progresso', 'debrief', 'debrief-stars', 'debrief-tag',
  'debrief-titulo', 'debrief-texto', 'debrief-pontos', 'debrief-breakdown', 'debrief-detalhes',
  'debrief-preceptor', 'debrief-stamp', 'plantao-modal', 'plantao-total', 'plantao-estrelas',
  'plantao-bonus', 'btn-plantao-menu', 'btn-tts', 'menu', 'phase-select',
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
const keyHandlers = new Set();
const fakeDocument = {
  activeElement: null,
  addEventListener(type, handler) { if (type === 'keydown') keyHandlers.add(handler); },
  removeEventListener(type, handler) { if (type === 'keydown') keyHandlers.delete(handler); },
  querySelectorAll() { return []; },
};
const originalDocument = globalThis.document;
let game = null;
globalThis.document = fakeDocument;

try {
  game = Object.create(Game.prototype);
  game.el = elements;
  game.state = 'MENU';
  game.bind();
  assert.equal(keyHandlers.size, 1, 'bind installs one keyboard listener');
  assert.ok(Object.values(elements).every((element) => element.count() <= 1));

  const firstKeyHandler = [...keyHandlers][0];
  game.bind();
  assert.equal(keyHandlers.size, 1, 'rebinding replaces rather than duplicates keyboard listener');
  assert.notEqual([...keyHandlers][0], firstKeyHandler);
  assert.ok(Object.values(elements).every((element) => element.count() <= 1));

  game.unbind();
  game.unbind();
  assert.equal(keyHandlers.size, 0, 'unbind is idempotent and removes keyboard listener');
  assert.ok(Object.values(elements).every((element) => element.count() === 0));
} finally {
  game?.unbind?.();
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

console.log('PASS Game binding lifecycle: repeated bind and explicit cleanup leave no duplicate listeners');
