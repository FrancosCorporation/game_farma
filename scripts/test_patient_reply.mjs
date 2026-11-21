import assert from 'node:assert/strict';
import { generatePatientReply } from '../src/ai/patientReply.js';
import { buildActorSystemPrompt, templateReply } from '../src/ai/prompts.js';
import { CASES } from '../src/data/cases.js';
import { classify, KnowledgeState } from '../src/core/factGate.js';

const caseDef = {
  id: 'case-1',
  fatos: ['segredo'],
  pedido: 'a remedy',
  abertura: 'I have a headache.',
  persona: { nome: 'Ana', idade: 30, resumo: 'A patient', falaForaDominio: 'I am not sure.' },
};
const knowledge = { revealed: ['queixa'], recent: () => [], turnsWithoutNews: 0 };
const newFacts = [{ falaLeiga: 'Eu posso esperar.' }];
const evasions = [];
const history = Array.from({ length: 11 }, (_, index) => ({ role: 'user', content: String(index) }));
const base = {
  caseDef,
  knowledge,
  newFacts,
  evasions,
  history,
  language: 'en',
  isHiddenFact: (text) => text.includes('segredo'),
  translate: async (text, options) => {
    assert.deepEqual(options, { llm: base.llm, language: 'en', maxTokens: 160 });
    return text === 'Eu posso esperar.' ? 'I can wait.' : text;
  },
};

let request;
let streamed = [];
base.llm = {
  ok: true,
  async chat(messages, options) {
    request = { messages, options };
    options.onToken('Eu', 'Eu posso');
    options.onToken(' esperar.', 'Eu posso esperar.');
    return { text: 'Eu posso esperar.' };
  },
};
const translated = await generatePatientReply({ ...base, onStream: (text) => streamed.push(text) });
assert.equal(translated, 'I can wait.');
assert.deepEqual(streamed, ['Eu posso', 'Eu posso esperar.']);
assert.equal(request.messages[0].role, 'system');
assert.deepEqual(request.messages.slice(1), history.slice(-9), 'envia apenas os nove turnos recentes');
assert.equal(typeof request.options.onToken, 'function');

const hidden = await generatePatientReply({
  ...base,
  llm: { ok: true, async chat() { return { text: 'segredo' }; } },
  translate: async (text) => text,
  isHiddenFact: (text) => text === 'segredo',
});
assert.notEqual(hidden, 'segredo', 'resposta que revela fato oculto é substituída');
assert.ok(typeof hidden === 'string' && hidden.length > 0);

for (const llm of [null, { ok: false }, { ok: true, async chat() { throw new Error('offline'); } }]) {
  const result = await generatePatientReply({
    ...base,
    llm,
    translate: async () => { throw new Error('não deve traduzir fallback'); },
  });
  assert.ok(result.length > 0, 'indisponibilidade/erro usa resposta determinística');
}

const examReply = await generatePatientReply({
  ...base,
  newFacts: [],
  history: [{ role: 'user', content: 'Você já fez teste de influenza?' }],
  llm: { ok: true, async chat() { throw new Error('exam question should use safe case answer'); } },
});
assert.match(examReply, /resultado de exame/i);
assert.doesNotMatch(examReply, /amoxicilina|antibiótico/i);

const knownFact = { dominio: 'associados', falaLeiga: 'Também tenho tosse seca.' };
const contextual = templateReply(caseDef, {
  revealed: new Map([['tosse', knownFact]]), turnsWithoutNews: 3,
}, [], [], 'Tem outros sintomas, como tosse?');
assert.equal(contextual, knownFact.falaLeiga, 'pergunta repetida usa fato já revelado do domínio');

const mariana = CASES.find((item) => item.id === 'carla_dengue');
const marianaKnowledge = new KnowledgeState(mariana);
const firstPrompt = buildActorSystemPrompt(mariana, marianaKnowledge, [], []);
assert.doesNotMatch(firstPrompt, /3[,.]6 L|dipirona|hemograma|NS1|marmita/i,
  'ator não recebe fatos ocultos nem gabarito clínico do documento antes da pergunta');
const food = marianaKnowledge.ask('Mudou a alimentação ou comeu algo estragado?', ['fatores']);
assert.deepEqual(food.novos.map((fact) => fact.tag), ['alimentacao_habitual']);
assert.match(buildActorSystemPrompt(mariana, marianaKnowledge, food.novos, []), /marmita/,
  'trecho da história documentada aparece quando o fato é liberado');
assert.doesNotMatch(templateReply(mariana, marianaKnowledge, [], [], 'Qual foi o resultado do exame?'), /Sonrisal/i,
  'pergunta livre de exame não volta ao pedido de medicamento');
const weight = marianaKnowledge.ask('Quanto você pesa?', ['historico']);
assert.match(templateReply(mariana, marianaKnowledge, weight.novos, [], 'Quanto você pesa?'), /62 quilos/);
const warningSigns = [
  ['Teve dor abdominal intensa e contínua?', 'dor_abdominal_neg', /não tive dor forte/i],
  ['Teve vômitos persistentes?', 'vomitos_persistentes_neg', /não vomitei/i],
  ['Teve sangramento?', 'sangramento_neg', /não tive sangramento/i],
  ['Sentiu tontura ao se levantar ou sensação de desmaio?', 'hipotensao_postural_neg', /não fico tonta/i],
];
for (const [question, tag, expected] of warningSigns) {
  const state = new KnowledgeState(mariana);
  const allowed = state.ask(question, classify(question));
  assert.ok(allowed.novos.some((fact) => fact.tag === tag && fact.valor === false));
  const warning = await generatePatientReply({
    ...base, caseDef: mariana, knowledge: state, newFacts: allowed.novos,
    history: [{ role: 'user', content: question }],
    llm: { ok: true, async chat() { throw new Error('resposta de sinal de alarme deve ser determinística'); } },
  });
  assert.match(warning, expected);
  const repeat = state.ask(question, classify(question));
  const repeatedWarning = await generatePatientReply({
    ...base, caseDef: mariana, knowledge: state, newFacts: repeat.novos,
    history: [{ role: 'user', content: question }],
    llm: { ok: true, async chat() { throw new Error('repeated alarm sign stays deterministic'); } },
  });
  assert.equal(repeatedWarning, warning, `${tag} repeat answers only the sign that was asked`);
}
const allWarningSigns = new KnowledgeState(mariana);
const allWarningQuestion = 'Teve dor abdominal intensa, vômitos persistentes, sangramento ou tontura ao levantar?';
const allWarningAsk = allWarningSigns.ask(allWarningQuestion, classify(allWarningQuestion));
const allWarningReply = templateReply(mariana, allWarningSigns, allWarningAsk.novos, [], allWarningQuestion);
assert.equal(allWarningAsk.novos.length, 4, 'asking all four warning signs reveals four separate negative facts');
assert.equal(allWarningReply, warningSigns.map(([, , expected], index) => {
  const fact = mariana.fatos.find((item) => item.tag === warningSigns[index][1]);
  assert.match(fact.falaLeiga, expected);
  return fact.falaLeiga;
}).join(' '), 'the patient answers each warning sign asked and does not disclose unrelated history');
const antibioticLoop = await generatePatientReply({
  ...base, caseDef: mariana, knowledge: marianaKnowledge, newFacts: [],
  history: [{ role: 'user', content: 'Onde você trabalha?' }],
  llm: { ok: true, async chat() { return { text: 'Então, você tem amoxicilina ou não?' }; } },
  translate: async (text) => text,
});
assert.doesNotMatch(antibioticLoop, /amoxicilina|antibiótico/i);

let current = false;
let translatedStale = false;
let staleStream = false;
const stale = await generatePatientReply({
  ...base,
  llm: {
    ok: true,
    async chat(_messages, options) {
      options.onToken('texto', 'texto obsoleto');
      return { text: 'texto obsoleto' };
    },
  },
  isCurrentInteraction: () => current,
  onStream: () => { staleStream = true; },
  translate: async () => { translatedStale = true; return 'stale'; },
});
assert.equal(stale, '');
assert.equal(staleStream, false);
assert.equal(translatedStale, false);

console.log('✔ patient reply: streaming, PT→EN, hidden-fact guard, fallback and stale interaction');
