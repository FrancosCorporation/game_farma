import assert from 'node:assert/strict';
import { buildPhaseCaseOrder, selectNextCaseId } from '../src/core/caseSelection.js';

const caseCatalog = [{ id: 'ana' }, { id: 'jose' }];
const fixedOrder = ['jose', 'ana'];
const fixedOrderResult = buildPhaseCaseOrder({ casos: fixedOrder }, caseCatalog);
assert.deepEqual(fixedOrderResult, ['jose', 'ana'], 'preserva a ordem configurada da fase fixa');
fixedOrderResult.pop();
assert.deepEqual(fixedOrder, ['jose', 'ana'], 'não expõe o array mutável da definição da fase');
assert.deepEqual(buildPhaseCaseOrder({ casos: null }, caseCatalog), ['ana', 'jose'],
  'fase livre usa o catálogo local');
assert.deepEqual(buildPhaseCaseOrder({ casos: [] }, caseCatalog), [],
  'array vazio é uma ordem fixa intencional, não fallback para todos os casos');

assert.equal(selectNextCaseId({ pool: ['ana', 'jose'], completedIds: ['ana'] }), 'jose',
  'prioriza o primeiro caso ainda não concluído');

const randomValues = [0.1, 0.9];
let randomCalls = 0;
const repeatedPoolSelection = selectNextCaseId({
  pool: ['ana', 'jose'],
  completedIds: new Set(['ana', 'jose']),
  previousCaseId: 'ana',
  random: () => randomValues[randomCalls++],
});
assert.equal(repeatedPoolSelection, 'jose', 'sorteia novamente para não repetir o último caso quando há alternativa');
assert.equal(randomCalls, 2);

assert.equal(selectNextCaseId({
  pool: ['ana'],
  completedIds: ['ana'],
  previousCaseId: 'ana',
  random: () => 0.99,
}), 'ana', 'permite repetição quando só existe um caso');
assert.equal(selectNextCaseId({
  pool: ['ana', 'jose'],
  completedIds: ['ana', 'jose'],
  random: () => 0.75,
}), 'jose', 'não evita repetição quando não há caso anterior na ordem da fase');
assert.equal(selectNextCaseId({ pool: [], completedIds: [] }), undefined,
  'preserva o retorno vazio usado pelo fluxo de indisponibilidade');

console.log('PASS case selection: prioridade aos não concluídos, sorteio, antirrepetição e pool vazio');
