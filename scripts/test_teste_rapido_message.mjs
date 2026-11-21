import assert from 'node:assert/strict';
import { buildTesteRapidoSystemMessage } from '../src/core/testeRapidoMessage.js';

const strings = {
  'tlac.title': 'Teste rápido',
  'sys.testeResultado': 'Resultado do teste: ',
  'sys.testeExecutado': 'Teste realizado.',
};
const translate = (key) => strings[key] ?? key;

assert.deepEqual(
  buildTesteRapidoSystemMessage('positivo', 'Teste de antígeno', translate),
  { message: 'Teste de antígeno: Resultado do teste: POSITIVO', isPositive: true },
  'mantém tipo do caso, caixa alta e alerta positivo em português',
);
assert.deepEqual(
  buildTesteRapidoSystemMessage('positive', 'Rapid test', (key) => ({
    'sys.testeResultado': 'Test result: ',
    'sys.testeExecutado': 'Test performed.',
    'tlac.title': 'Rapid test',
  })[key]),
  { message: 'Rapid test: Test result: POSITIVE', isPositive: true },
  'classifica positivo em inglês sem alterar o texto localizado',
);
assert.deepEqual(
  buildTesteRapidoSystemMessage('negativo', 'Teste rápido', translate),
  { message: 'Teste rápido: Resultado do teste: NEGATIVO', isPositive: false },
  'resultado negativo não sinaliza alerta positivo',
);
assert.deepEqual(
  buildTesteRapidoSystemMessage(null, '', translate),
  { message: 'Teste rápido: Teste realizado.', isPositive: false },
  'sem resultado usa o rótulo localizado e mensagem de execução',
);

console.log('✔ mensagem do teste rápido preserva texto, localização e classificação');
