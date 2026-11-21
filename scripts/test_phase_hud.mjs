import assert from 'node:assert/strict';
import { renderPhaseHud } from '../src/ui/phaseHud.js';

const element = { textContent: '' };
const translations = {
  'fase.chegada': 'Arrival',
  'fase.anamnese': 'Anamnesis',
  'fase.decisao': 'Decision',
};
const translate = (key) => translations[key] || key;

renderPhaseHud(element, 'chegada', translate);
assert.equal(element.textContent, 'Arrival');
renderPhaseHud(element, 'anamnese', translate);
assert.equal(element.textContent, 'Anamnesis', 'phase change replaces the previous label');
renderPhaseHud(element, 'decisao', translate);
assert.equal(element.textContent, 'Decision');
assert.doesNotThrow(() => renderPhaseHud(null, 'anamnese', translate));

console.log('✔ phase HUD: localized phase labels and missing element');
