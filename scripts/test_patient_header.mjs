import assert from 'node:assert/strict';
import { renderPatientHeader, renderTurnCounter } from '../src/ui/patientHeader.js';

const makeElement = () => ({ textContent: '', hidden: true });
const elements = {
  'chat-nome': makeElement(),
  'chat-avatar': makeElement(),
  'hud-paciente': makeElement(),
  'hud-fila': makeElement(),
};
const caseDef = { persona: { nome: 'Dona Rosa', idade: 54 } };
const phase = { id: 'iniciante', casos: ['ana', 'rosa', 'carlos'] };
const translate = (key) => ({
  'chat.anos': ' anos',
  'chat.cliente': 'Paciente',
  'hud.fila': 'Fila',
}[key] || key);

renderPatientHeader(elements, { caseDef, phase, translate });
assert.equal(elements['chat-nome'].textContent, 'Dona Rosa, 54 anos');
assert.equal(elements['chat-avatar'].textContent, 'R');
assert.equal(elements['hud-paciente'].textContent, 'Paciente Dona Rosa');
assert.equal(elements['hud-fila'].textContent, 'Fila 1/3');
assert.equal(elements['hud-fila'].hidden, false);

renderPatientHeader(elements, {
  caseDef,
  phase,
  progress: { state: { porFase: { iniciante: { feitos: ['ana', 'rosa', 'carlos', 'extra'] } } } },
  translate,
});
assert.equal(elements['hud-fila'].textContent, 'Fila 3/3', 'fila limita posição ao total de casos');

renderPatientHeader(elements, { caseDef, phase: { id: 'livre', casos: [] }, translate });
assert.equal(elements['hud-fila'].hidden, true, 'expediente sem fila fixa oculta o indicador');

const counter = makeElement();
renderTurnCounter(counter, 0, 30);
assert.equal(counter.textContent, '0/30');
renderTurnCounter(counter, 7, 30);
assert.equal(counter.textContent, '7/30');
assert.doesNotThrow(() => renderPatientHeader(null, { caseDef, phase, translate }));
assert.doesNotThrow(() => renderPatientHeader(elements, { caseDef: null, phase, translate }));
assert.doesNotThrow(() => renderTurnCounter(null, 1, 30));

console.log('✔ patient header: identificação, fila fixa/livre, limites e contador');
