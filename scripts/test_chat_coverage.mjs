import assert from 'node:assert/strict';
import { renderChatCoverage } from '../src/ui/chatCoverage.js';

const box = { textContent: 'stale', innerHTML: '' };
const caseDef = { checklistDominios: ['localizacao', 'duracao'] };

renderChatCoverage(box, null, null);
assert.equal(box.textContent, '', 'sem caso/estado, limpa a cobertura anterior');

renderChatCoverage(box, caseDef, { askedDomains: new Set() });
assert.match(box.textContent, /Anamnese:/, 'sem domínios cobertos, mostra a instrução vazia');

renderChatCoverage(box, caseDef, { askedDomains: new Set(['localizacao']) });
assert.match(box.innerHTML, /✓ localização da queixa/, 'exibe o domínio coberto');
assert.match(box.innerHTML, /1 pendentes/, 'exibe a quantidade pendente');

renderChatCoverage(box, caseDef, { askedDomains: new Set(['localizacao', 'duracao']) });
assert.match(box.innerHTML, /checklist completo/, 'exibe estado completo');
assert.match(box.innerHTML, /✓ duração do quadro/, 'inclui o segundo domínio coberto');

renderChatCoverage(null, caseDef, { askedDomains: new Set() });
console.log('✔ chat coverage renderer OK');
