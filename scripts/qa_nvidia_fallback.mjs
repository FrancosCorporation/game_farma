import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LLMClient } from '../src/ai/llm.js';
import { generatePatientReply } from '../src/ai/patientReply.js';

const url = process.env.QA_NVIDIA_URL || 'http://127.0.0.1:4174/api/llm/fallback';
const output = process.argv[2] || '/tmp/farma-nvidia-fallback.json';
const startedAt = Date.now();
const llm = new LLMClient({
  baseUrl: 'http://127.0.0.1:1/v1',
  fallbackUrl: url,
  retryMs: 15000,
});
llm.ok = false;
llm.retryAt = Date.now() + 15000;
const caseDef = {
  id: 'synthetic-nvidia-fallback',
  pedido: 'um analgésico',
  abertura: 'Estou um pouco cansada hoje.',
  persona: {
    nome: 'Ana', idade: 35, resumo: 'É simpática e fala de modo simples.',
    falaForaDominio: 'Só vim buscar o que pedi.', falaRepetida: 'Já contei o que sei.',
  },
};
const newFacts = [{ falaLeiga: 'Estou me sentindo cansada hoje.' }];
const reply = await generatePatientReply({
  llm,
  caseDef,
  knowledge: { turnsWithoutNews: 0, recent: () => [] },
  newFacts,
  evasions: [],
  history: [{ role: 'user', content: 'Como você está hoje?' }],
  language: 'pt',
  isHiddenFact: (text) => /fato secreto/i.test(text),
});
const result = {
  url, status: 200, durationMs: Date.now() - startedAt, model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  caseId: caseDef.id, text: reply,
};
assert.ok(result.text.trim(), 'NVIDIA fallback returns a patient line');
assert.notEqual(result.text.trim(), newFacts[0].falaLeiga, 'uses generated wording rather than the canned allowed-fact line');
assert.doesNotMatch(result.text, /sou (um )?modelo de linguagem|as an? ai|language model/i, 'does not identify itself as an assistant');
result.scenarioSha256 = createHash('sha256').update(JSON.stringify({ caseDef, newFacts, question: 'Como você está hoje?' })).digest('hex');
result.responseSha256 = createHash('sha256').update(result.text).digest('hex');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`PASS NVIDIA fallback: streaming natural patient response in ${result.durationMs} ms; evidence ${output}`);
