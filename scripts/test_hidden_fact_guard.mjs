import assert from 'node:assert/strict';
import { containsHiddenFact } from '../src/core/hiddenFactGuard.js';

const facts = [
  { tag: 'ulcera_prev', segredo: '(ulcera|sangramento)' },
  { tag: 'optional', segredo: '' },
];
const revealed = new Set();

assert.equal(containsHiddenFact('A pessoa conta que teve úlcera.', facts, revealed), true,
  'normaliza acentos antes de conferir um fato ainda oculto');
assert.equal(containsHiddenFact('Ela tomou água hoje.', facts, revealed), false,
  'não sinaliza texto sem conteúdo do segredo');
revealed.add('ulcera_prev');
assert.equal(containsHiddenFact('A pessoa conta que teve úlcera.', facts, revealed), false,
  'um fato já revelado deixa de ser vazamento');
assert.equal(containsHiddenFact('', facts, revealed), false,
  'texto vazio não revela fatos');

console.log('✔ hidden fact guard blocks only unrevealed secrets');
