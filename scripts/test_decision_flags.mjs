import assert from 'node:assert/strict';
import { renderDecisionFlags } from '../src/ui/decisionFlags.js';

const makeElement = (tag) => ({
  tagName: tag.toUpperCase(),
  className: '',
  textContent: '',
  value: '',
  type: '',
  dataset: {},
  children: [],
  append(...nodes) { this.children.push(...nodes); },
  appendChild(node) { this.children.push(node); },
});
const list = {
  children: [{ stale: true }],
  set innerHTML(value) { assert.equal(value, ''); this.children = []; },
  appendChild(node) { this.children.push(node); },
};
const facts = [
  { tag: 'alergia', rotulo: 'Alergia medicamentosa', valor: true, redFlag: true },
  { tag: 'febre', rotulo: 'Febre alta', valor: false, redFlag: true },
  { tag: 'dor', rotulo: 'Dor leve', valor: true, redFlag: false },
  { tag: 'risco-nao-revelado', rotulo: 'Risco oculto', valor: true, redFlag: true },
];

renderDecisionFlags(list, facts, new Set(['alergia', 'febre', 'dor']), (key) => ` [${key}]`, makeElement);
assert.equal(list.children.length, 2, 'renderiza somente flags e achados negativos já revelados');

const [positive, denied] = list.children;
assert.equal(positive.tagName, 'LABEL');
assert.equal(positive.className, 'check-row');
assert.deepEqual(positive.dataset, { tag: 'alergia', negado: 'false' });
assert.deepEqual(positive.children.map(({ tagName, type, value, textContent }) => ({ tagName, type, value, textContent })), [
  { tagName: 'INPUT', type: 'checkbox', value: 'alergia', textContent: '' },
  { tagName: 'SPAN', type: '', value: '', textContent: 'Alergia medicamentosa' },
]);
assert.deepEqual(denied.dataset, { tag: 'febre', negado: 'true' });
assert.equal(denied.children[1].textContent, 'Febre alta [sys.negado]');
assert.equal(denied.children[0].value, 'febre');

const hostileLabel = '<img src=x onerror=alert(1)>';
renderDecisionFlags(list, [{ tag: 'alerta', rotulo: hostileLabel, valor: true, redFlag: true }], new Set(['alerta']), () => '', makeElement);
assert.equal(list.children[0].children[1].textContent, hostileLabel, 'rótulo permanece texto e nunca é interpretado como HTML');
assert.equal(list.children[0].children[1].innerHTML, undefined);
renderDecisionFlags(list, facts, new Set(), () => '', makeElement);
assert.equal(list.children.length, 0, 'limpa achados antigos quando nenhum risco foi revelado');
assert.doesNotThrow(() => renderDecisionFlags(null, facts, new Set(), () => '', makeElement));

console.log('✔ decision flags: achados revelados, negativos e rótulos seguros');
