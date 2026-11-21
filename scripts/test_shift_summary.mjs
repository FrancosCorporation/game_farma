import assert from 'node:assert/strict';
import { renderShiftSummary } from '../src/ui/shiftSummary.js';

const modal = { hidden: true };
const totalElement = { textContent: '' };
const starsElement = { textContent: '' };
renderShiftSummary({ modal, totalElement, starsElement, completed: 4, totalStars: 9 });
assert.equal(totalElement.textContent, 4);
assert.equal(starsElement.textContent, '★ 9');
assert.equal(modal.hidden, false, 'abre o resumo após receber os valores calculados');

assert.doesNotThrow(() => renderShiftSummary({
  modal: null,
  totalElement: null,
  starsElement: null,
  completed: 0,
  totalStars: 0,
}), 'elementos opcionais ausentes não bloqueiam o controlador');

console.log('✔ shift summary renders totals and opens its panel');
