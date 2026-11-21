import assert from 'node:assert/strict';
import { renderPhaseSelection } from '../src/ui/phaseSelection.js';

function makeBox() {
  return {
    children: [],
    _innerHTML: '',
    set innerHTML(value) { this._innerHTML = value; this.children = []; },
    get innerHTML() { return this._innerHTML; },
    appendChild(child) { this.children.push(child); return child; },
  };
}

function makeDocument() {
  return {
    createElement(tag) {
      return {
        tagName: tag,
        attributes: {},
        listeners: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, callback) { this.listeners[name] = callback; },
      };
    },
  };
}

const phases = [
  { id: 'plantao', icone: '🟢', casos: ['ana', 'jose'] },
  { id: 'cuidado', icone: '🔵', casos: ['marina'] },
  { id: 'livre', icone: '✨', casos: null },
];
const translate = (key) => key;
const selected = [];
const progress = {
  unlockLevel: () => 0,
  state: { porFase: { plantao: { feitos: ['ana'], estrelas: { ana: 3, jose: 2 } } } },
};
const box = makeBox();

renderPhaseSelection(box, {
  phases,
  phaseIndex: 0,
  progress,
  onSelect: (index) => selected.push(index),
  translate,
  createElement: makeDocument().createElement,
});

assert.equal(box.children.length, 3);
assert.equal(box.children[0].disabled, false);
assert.equal(box.children[1].disabled, true);
assert.equal(box.children[2].disabled, false, 'última fase segue liberada');
assert.equal(box.children[0].attributes['aria-pressed'], 'true');
assert.equal(box.children[1].attributes['aria-pressed'], 'false');
assert.match(box.children[0].className, /pressed/);
assert.match(box.children[1].className, /locked/);
assert.match(box.children[0].innerHTML, /★ 5 · 1\/2 menu\.fase\.casos/);
box.children[0].listeners.click();
assert.deepEqual(selected, [0], 'clique encaminha a seleção ao dono do estado');

renderPhaseSelection(box, {
  phases,
  phaseIndex: 1,
  progress: { ...progress, unlockLevel: () => 1 },
  onSelect: (index) => selected.push(index),
  translate,
  createElement: makeDocument().createElement,
});
assert.equal(box.children[1].disabled, false, 'fase deixa de ficar bloqueada após desbloqueio');
assert.equal(box.children[1].attributes['aria-pressed'], 'true');

console.log('✔ phase selection cobre bloqueio, progresso, foco semântico e callback de seleção');
