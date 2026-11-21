import assert from 'node:assert/strict';
import { renderDecisionOptions } from '../src/ui/decisionOptions.js';

const makeElement = (tag) => ({
  tagName: tag.toUpperCase(),
  className: '',
  textContent: '',
  value: '',
  type: '',
  children: [],
  append(...nodes) { this.children.push(...nodes); },
  appendChild(node) { this.children.push(node); },
});
const makeList = () => ({
  children: [{ stale: true }],
  set innerHTML(value) { assert.equal(value, ''); this.children = []; },
  appendChild(node) { this.children.push(node); },
});
const mipBox = { hidden: true };
const mipList = makeList();
const orientationList = makeList();
const confirmButton = { textContent: '', disabled: true };
const keys = [];
const translate = (key) => { keys.push(key); return `[${key}]`; };

renderDecisionOptions({
  kind: 'sugerir', mipBox, mipList, orientationList, confirmButton,
  shelf: [{ id: 'dipirona', nome: 'Dipirona' }, { id: 'hostile', nome: '<b>Rótulo</b>' }],
  orientations: ['Usar conforme bula', 'Retornar em 48 horas'],
  translate, createElement: makeElement,
});
assert.equal(mipBox.hidden, false);
assert.equal(confirmButton.textContent, '[decision.confirmarSugerir]');
assert.deepEqual(keys, ['decision.confirmarSugerir']);
assert.equal(mipList.children.length, 2);
assert.equal(mipList.children[0].children[0].value, 'dipirona');
assert.equal(mipList.children[0].children[0].type, 'checkbox');
assert.equal(mipList.children[0].children[1].textContent, 'Dipirona');
assert.equal(mipList.children[1].children[1].textContent, '<b>Rótulo</b>', 'rótulos hostis permanecem texto');
assert.equal(orientationList.children.length, 2);
assert.equal(orientationList.children[0].children[0].value, 'Usar conforme bula');
assert.equal(orientationList.children[1].children[0].value, 'Retornar em 48 horas');

renderDecisionOptions({ kind: 'vender', mipBox, mipList, orientationList, confirmButton, translate });
assert.equal(mipBox.hidden, true);
assert.equal(confirmButton.textContent, '[decision.confirmarVender]');
assert.equal(mipList.children.length, 2, 'ocultar opções não altera seleção/render anterior');

renderDecisionOptions({ kind: 'encaminhar', mipBox, mipList, orientationList, confirmButton, translate });
assert.equal(confirmButton.textContent, '[decision.confirmarEncaminhar]');
assert.equal(mipBox.hidden, true);

renderDecisionOptions({ kind: 'sugerir', mipBox, mipList, orientationList, confirmButton, shelf: [], orientations: [], translate });
assert.equal(mipList.children.length, 0, 'reselecionar sugestão limpa itens antigos');
assert.equal(orientationList.children.length, 0);
assert.doesNotThrow(() => renderDecisionOptions({ kind: 'vender' }));

console.log('✔ decision options: listas, labels, acessibilidade básica e estados preservados');
