import assert from 'node:assert/strict';
import { applyFactRevealFeedback } from '../src/ui/factRevealFeedback.js';

const effects = [];
const calls = [];
const avatar = {
  setMood: (mood) => calls.push(['mood', mood]),
  setPose: (pose) => calls.push(['pose', pose]),
};
const fx = { pulse: () => calls.push(['pulse']) };
const translate = (key) => `<${key}>`;
const addSystem = (...args) => effects.push(args);

applyFactRevealFeedback({ tag: 'alergia', rotulo: 'Alergia grave', valor: true, redFlag: true, postura: 'sentado' }, {
  avatar,
  fx,
  patientName: 'João',
  playRedFlag: () => calls.push(['sound']),
  addSystem,
  translate,
});
assert.deepEqual(calls, [['sound'], ['pulse'], ['mood', 'dolorido'], ['pose', 'sentado']]);
assert.deepEqual(effects, [
  ['<sys.redflag>Alergia grave', true],
  ['João <pose.sentado>.'],
]);

calls.length = 0;
effects.length = 0;
applyFactRevealFeedback({ tag: 'febre', rotulo: 'Febre alta', valor: false, redFlag: true }, { addSystem, translate });
assert.deepEqual(calls, []);
assert.deepEqual(effects, [['<sys.investigado>Febre alta']]);

calls.length = 0;
effects.length = 0;
applyFactRevealFeedback({ tag: 'dor', rotulo: 'Dor leve', valor: true, redFlag: false });
assert.deepEqual(calls, []);
assert.deepEqual(effects, [], 'fato sem alerta, negação ou postura não gera feedback redundante');

assert.doesNotThrow(() => applyFactRevealFeedback({ valor: true, postura: 'repouso' }, { patientName: 'Ana' }));
console.log('✔ fact reveal feedback: alerta, negação, postura e dependências opcionais');
