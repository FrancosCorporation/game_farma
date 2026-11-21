import assert from 'node:assert/strict';
import { renderDecisionConfirm } from '../src/ui/decisionConfirm.js';

const button = { disabled: false };
let selectedMip = null;
const mipList = {
  querySelector(selector) {
    assert.equal(selector, 'input:checked');
    return selectedMip;
  },
};

renderDecisionConfirm(button, mipList, null);
assert.equal(button.disabled, true, 'sem conduta não pode confirmar');

renderDecisionConfirm(button, mipList, 'vender');
assert.equal(button.disabled, false, 'vender não exige seleção de MIP');

renderDecisionConfirm(button, mipList, 'encaminhar');
assert.equal(button.disabled, false, 'encaminhar não exige seleção de MIP');

renderDecisionConfirm(button, mipList, 'sugerir');
assert.equal(button.disabled, true, 'sugerir exige ao menos um MIP');

selectedMip = { value: 'produto-1' };
renderDecisionConfirm(button, mipList, 'sugerir');
assert.equal(button.disabled, false, 'sugestão pode confirmar com MIP selecionado');

selectedMip = null;
renderDecisionConfirm(button, mipList, 'sugerir');
assert.equal(button.disabled, true, 'remover a seleção bloqueia a sugestão novamente');
assert.doesNotThrow(() => renderDecisionConfirm(null, mipList, 'sugerir'));
assert.doesNotThrow(() => renderDecisionConfirm(button, null, 'sugerir'));
assert.equal(button.disabled, true, 'lista indisponível falha com segurança');

console.log('✔ decisão: confirmação exige conduta e MIP para sugerir');
