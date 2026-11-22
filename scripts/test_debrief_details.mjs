import assert from 'node:assert/strict';
import { buildDebriefDetails } from '../src/ui/debriefDetails.js';

const t = (key) => `[${key}]`;
const domainLabel = (domain) => `<${domain}>`;
const cleanResult = () => ({
  missedDomains: [],
  missedRed: [],
  reprovado: false,
  testeRapidoPerdido: false,
  arboviroseNaoEncaminhada: false,
  orientacaoInadequada: false,
  dsfOk: true,
  criticals: [],
});

const findings = buildDebriefDetails({
  ...cleanResult(),
  missedDomains: ['duracao', 'localizacao'],
  missedRed: ['sinais_alarme'],
}, {}, { t, domainLabel });
assert.deepEqual(findings, [
  { text: '[debrief.faltaPerguntar]<duracao>, <localizacao>.', className: 'text-amber-300' },
  { text: '[debrief.alertaNaoInvestigado]<sinais_alarme>.', className: 'text-amber-300' },
]);

const negative = buildDebriefDetails({
  ...cleanResult(),
  reprovado: true,
  testeRapidoPerdido: true,
  arboviroseNaoEncaminhada: true,
  orientacaoInadequada: true,
  dsfOk: false,
  criticals: ['risco A', 'risco B'],
}, {
  contraindicado: { motivo: 'uso contraindicado' },
  testeRapido: { tipo: 'glicemia' },
  dsf: { required: true },
}, { t, domainLabel });
assert.deepEqual(negative.map(({ text }) => text), [
  '[debrief.reprovado]uso contraindicado).',
  '[debrief.testePerdidoPre]glicemia[debrief.testePerdidoPos]',
  '[debrief.arbovirose]',
  '[debrief.orientacao]',
  '[debrief.dsf]',
  '[debrief.critico]risco A',
  '[debrief.critico]risco B',
]);
assert.equal(negative[0].className, 'text-red-400 font-semibold');
assert.equal(negative[1].className, 'text-amber-300');
assert.equal(negative[4].className, 'text-amber-300');

const perfect = buildDebriefDetails(cleanResult(), {}, { t, domainLabel });
assert.deepEqual(perfect, [{ text: '[debrief.perfeito]', className: 'text-teal-300' }]);
const flagged = buildDebriefDetails({
  ...cleanResult(), marcacoesIncorretas: ['Vômitos persistentes: negados'],
}, {}, { t, domainLabel });
assert.deepEqual(flagged, [{
  text: '[debrief.marcacoesIncorretas]Vômitos persistentes: negados.',
  className: 'text-amber-300',
}]);

const incompleteDsf = buildDebriefDetails({ ...cleanResult(), dsfOk: false }, {}, { t, domainLabel });
assert.deepEqual(incompleteDsf, [], 'resultado sem DSF obrigatório não mostra erro nem elogio de perfeito');

console.log('✔ debrief details: riscos, achados, classes e resultado perfeito');
