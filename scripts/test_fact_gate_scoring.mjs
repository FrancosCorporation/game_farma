// Deterministic, browser-free regression tests for fact disclosure and local scoring.
import assert from 'node:assert/strict';
import { classify, domainLabel, KnowledgeState, norm, warningSignsFromQuestion } from '../src/core/factGate.js';
import { scoreCase, starsForScore, gddLabel, dsfCorreta } from '../src/core/scoring.js';
import { CASES } from '../src/data/cases.js';
import { setLang } from '../src/ui/i18n.js';

assert.equal(norm('DOR ÁGUA'), 'dor agua', 'normalization removes accents and folds case');
assert.deepEqual(classify('Há quanto tempo começou e onde dói?'), ['duracao', 'localizacao']);
assert.deepEqual(classify('How long has this been? Where is the pain?'), ['duracao', 'localizacao']);
const allDomains = [
  'duracao', 'localizacao', 'caracter', 'irradiacao', 'intensidade', 'fatores',
  'associados', 'febre', 'historico', 'medicamentos', 'alergias', 'episodios', 'genero',
];
assert.deepEqual(
  classify('Há quanto tempo? Onde fica? Como sente? Irradia para o braço? De 0 a 10, quão forte? O que piora ao deitar? Falta de ar? Tem febre? Pressão alta? Toma remédio? Tem alergia? Já teve antes? Quantos anos?'),
  allDomains,
  'Portuguese boundary phrases cover all expected question domains in stable order',
);
assert.deepEqual(
  classify('How long? Where? What does it feel like? Does it spread to your arm? How severe? What makes it worse after walking? Shortness of breath? Fever? Blood pressure history? What medications are you taking? Any allergies? Have you had this before? How old?'),
  allDomains,
  'English boundary phrases cover all expected question domains in stable order',
);
assert.deepEqual(classify(''), [], 'empty messages do not classify');
assert.ok(classify('Onde você trabalha?').includes('historico'));
assert.ok(classify('Mudou a alimentação ou comeu algo estragado?').includes('fatores'));
assert.ok(classify('Teve sangramento ou vômitos persistentes?').includes('associados'));
assert.deepEqual(warningSignsFromQuestion('Dor abdominal, vômitos, sangramento ou tontura ao levantar?'),
  ['dor_abdominal', 'vomitos', 'sangramento', 'hipotensao_postural']);

// i18n label boundaries without a browser: setLang only needs these DOM hooks.
const originalDocument = globalThis.document;
globalThis.document = { documentElement: { lang: '' }, dispatchEvent() {} };
try {
  setLang('en');
  assert.equal(domainLabel('duracao'), 'duration of the problem');
  assert.equal(gddLabel('dsf'), 'DSF with correct conduct');
  setLang('pt');
  assert.equal(domainLabel('duracao'), 'duração do quadro');
  assert.equal(gddLabel('dsf'), 'DSF com conduta correta');
} finally {
  setLang('pt');
  globalThis.document = originalDocument;
}

const knowledgeCase = {
  fatos: [
    { tag: 'spontaneous', dominio: 'localizacao', nivel: 'voluntario' },
    { tag: 'reluctant', dominio: 'historico', nivel: 'relutante', gatilho: '(ulcera|sangr)' },
    { tag: 'duration', dominio: 'duracao', nivel: 'extraivel' },
    { tag: 'medication', dominio: 'medicamentos', nivel: 'extraivel' },
  ],
};
const knowledge = new KnowledgeState(knowledgeCase);
assert.deepEqual([...knowledge.revealed.keys()], ['spontaneous'], 'only voluntary facts start revealed');

const firstHistoryAsk = knowledge.ask('Quero entender melhor.', ['historico']);
assert.deepEqual(firstHistoryAsk.novos, []);
assert.deepEqual(firstHistoryAsk.evasivas.map((fact) => fact.tag), ['reluctant']);
assert.equal(knowledge.attempts.get('reluctant'), 1, 'first indirect attempt stays hidden');

const durationAsk = knowledge.ask('Quando começou?', ['duracao']);
assert.deepEqual(durationAsk.novos.map((fact) => fact.tag), ['duration']);
assert.equal(knowledge.attempts.get('reluctant'), 1, 'asking another domain does not increment hidden-fact attempts');
assert.equal(knowledge.revealed.has('medication'), false, 'facts outside requested domains stay hidden');

const retry = knowledge.ask('Pode me contar mais?', ['historico']);
assert.deepEqual(retry.novos.map((fact) => fact.tag), ['reluctant'], 'second indirect attempt reveals a reluctant fact');
assert.deepEqual(retry.evasivas, []);
assert.equal(knowledge.attempts.get('reluctant'), 2);
assert.deepEqual(knowledge.recent(2).map((fact) => fact.tag), ['duration', 'reluctant'], 'recent facts preserve reveal order');
assert.deepEqual(knowledge.recent(1, [{ tag: 'duration' }]).map((fact) => fact.tag), ['reluctant'], 'recent supports exclusions');

const directKnowledge = new KnowledgeState(knowledgeCase);
assert.deepEqual(directKnowledge.ask('Já teve úlcera?', ['historico']).novos.map((fact) => fact.tag), ['reluctant'], 'a direct trigger reveals immediately');
assert.equal(directKnowledge.attempts.get('reluctant'), 1);
assert.equal(directKnowledge.turnsWithoutNews, 0, 'a reveal resets the no-news counter');
directKnowledge.ask('Outra pergunta sem domínio.', []);
assert.equal(directKnowledge.turnsWithoutNews, 1, 'a turn with no matching domain increments the no-news counter');

const carla = CASES.find((item) => item.id === 'carla_dengue');
assert.ok(carla, 'local scoring fixture exists');
assert.equal(carla.temRedFlag, false, 'Mariana has no positive alarm signs in the authored case');
const warningKnowledge = new KnowledgeState(carla);
const bleedingAsk = warningKnowledge.ask('Teve sangramento?', classify('Teve sangramento?'));
assert.deepEqual(bleedingAsk.novos.map((fact) => fact.tag), ['sangramento_neg'], 'pergunta sobre sangramento revela somente a resposta negativa correspondente');
assert.equal(warningKnowledge.revealed.has('nausea_diarreia'), false);
const nauseaAsk = warningKnowledge.ask('Teve náusea ou diarreia?', classify('Teve náusea ou diarreia?'));
assert.deepEqual(nauseaAsk.novos.map((fact) => fact.tag), ['nausea_diarreia']);
const weightAsk = warningKnowledge.ask('Quanto você pesa?', classify('Quanto você pesa?'));
assert.deepEqual(weightAsk.novos.map((fact) => fact.tag), ['peso_62kg']);
assert.equal(warningKnowledge.revealed.get('peso_62kg').falaLeiga, 'Peso 62 quilos.');
const fourSignKnowledge = new KnowledgeState(carla);
for (const [question, tag] of [
  ['Tem dor abdominal intensa e contínua?', 'dor_abdominal_neg'],
  ['Vômitos persistentes?', 'vomitos_persistentes_neg'],
  ['Algum sangramento?', 'sangramento_neg'],
  ['Tontura ao levantar?', 'hipotensao_postural_neg'],
]) {
  const answer = fourSignKnowledge.ask(question, classify(question));
  assert.ok(answer.novos.some((fact) => fact.tag === tag && fact.valor === false), `${tag} is explicitly denied when asked`);
}
assert.equal(fourSignKnowledge.warningSignsAsked.size, 4);
const fullyAsked = {
  askedDomains: new Set([...carla.checklistDominios, 'medicamentos', 'alergias']),
  warningSignsAsked: new Set(['dor_abdominal', 'vomitos', 'sangramento', 'hipotensao_postural']),
  revealed: new Map(carla.fatos.filter((fact) => fact.nivel === 'voluntario').map((fact) => [fact.tag, fact])),
};
const marianaDsfText = 'Febre, mialgia e manchas no pescoço após dipirona. Recusei Sonrisal por conter AAS; orientei hidratação e sinais de alarme e encaminhei para avaliação na UBS. Avaliação clínica presumida: suspeita de dengue a esclarecer.';
const correctDecision = {
  conduta: 'encaminhar', mips: [], redFlags: [], consultaBulario: true,
  testeRapido: { executado: true }, dsf: marianaDsfText,
};
const history = [{ content: 'Bom dia, Carla.' }];

const perfect = scoreCase(carla, fullyAsked, correctDecision, history);
assert.equal(perfect.total, 100, 'complete local case performance reaches the score ceiling');
const revealedWarnings = { ...fullyAsked, revealed: new Map([...fullyAsked.revealed, ...fourSignKnowledge.revealed]) };
const correctlyMarked = scoreCase(carla, revealedWarnings, correctDecision, history);
const wronglyMarked = scoreCase(carla, revealedWarnings, {
  ...correctDecision, redFlags: ['vomitos_persistentes_neg'],
}, history);
assert.equal(correctlyMarked.total - wronglyMarked.total, 3,
  'marcar como alerta um sinal negado reduz a nota somente na avaliação final');
assert.deepEqual(wronglyMarked.marcacoesIncorretas, ['Vômitos persistentes: negados']);
assert.equal(perfect.dsfOk, true);
assert.equal(perfect.testeRapidoPerdido, false);
assert.equal(perfect.arboviroseNaoEncaminhada, false);
assert.equal(perfect.reprovado, false);

const writtenDsf = scoreCase(carla, fullyAsked, {
  ...correctDecision, dsf: 'Quadro febril com cefaleia e exantema após dipirona. Não dispensei o AAS; recomendei reidratação, retorno se dor abdominal ou sangramento e encaminhei para avaliação clínica. Avaliação clínica presumida: suspeita de dengue.',
}, history);
assert.equal(writtenDsf.breakdown.find((item) => item.metrica === 'dsf')?.pontos, 30,
  'DSF emitida com redação própria e decisão correta recebe os 30 pontos');
const absentDsf = scoreCase(carla, fullyAsked, { ...correctDecision, dsf: null }, history);
assert.equal(absentDsf.breakdown.find((item) => item.metrica === 'dsf')?.pontos, 0,
  'sem emissão, o item DSF permanece zerado');
assert.equal(dsfCorreta(carla, 'Recusei Sonrisal e encaminhei à UBS.', 'encaminhar'), false,
  'registro sem achados e avaliação não recebe crédito completo');
const partialDsf = scoreCase(carla, fullyAsked, {
  ...correctDecision, dsf: 'Recusei Sonrisal e encaminhei à UBS.',
}, history);
assert.equal(partialDsf.breakdown.find((item) => item.metrica === 'dsf')?.pontos, 10,
  'DSF emitida com decisão correta recebe crédito parcial, sem ficar zerada');

const dsfThresholdCase = {
  dsf: { condutaCorreta: 'encaminhar paciente avaliação clínica imediata' },
  condutaGabarito: { tipo: 'encaminhar' },
};
assert.equal(
  dsfCorreta(dsfThresholdCase, 'Encaminhei para avaliação imediata e registrei a orientação.', 'encaminhar'),
  true,
  'DSF emitida com decisão correta não depende de reproduzir as palavras do gabarito',
);
assert.equal(
  dsfCorreta(dsfThresholdCase, '', 'encaminhar'),
  false,
  'DSF vazia não foi emitida',
);
assert.equal(dsfCorreta(dsfThresholdCase, 'Texto emitido.', 'vender'), false,
  'DSF emitida não recebe crédito com decisão clínica incorreta');

const missedTest = scoreCase(carla, fullyAsked, {
  ...correctDecision, testeRapido: { executado: false },
}, history);
assert.equal(missedTest.testeRapidoPerdido, true, 'an indicated but unperformed test is flagged');
assert.equal(missedTest.breakdown.find((item) => item.metrica === 'teste_pendente')?.pontos, -30);
assert.equal(missedTest.total, 50, 'missing the rapid test applies its bounded bonus loss and penalty');

const soldContraindicated = scoreCase(carla, fullyAsked, {
  ...correctDecision, conduta: 'vender', mips: ['aas'],
}, history);
assert.equal(soldContraindicated.reprovado, true, 'dispensing the contraindicated item is an immediate fail');
assert.equal(soldContraindicated.total, 0, 'immediate fail clamps the final score to zero');
assert.equal(soldContraindicated.breakdown.find((item) => item.metrica === 'contraindicado')?.pontos, -100);
const suggestedContraindicated = scoreCase(carla, fullyAsked, {
  ...correctDecision, conduta: 'sugerir', mips: ['aas'],
}, history);
assert.equal(suggestedContraindicated.reprovado, true,
  'item contraindicado selecionado é avaliado na confirmação da conduta');

const notReferred = scoreCase(carla, fullyAsked, {
  ...correctDecision, conduta: 'sugerir', mips: ['paracetamol'],
}, history);
assert.equal(notReferred.arboviroseNaoEncaminhada, true, 'suspected arboviral illness requires referral');
assert.equal(notReferred.breakdown.find((item) => item.metrica === 'arbovirose')?.pontos, -40);

const ana = CASES.find((item) => item.id === 'ana_coriza');
const anaKnowledge = new KnowledgeState(ana);
anaKnowledge.askedDomains = new Set([
  ...ana.checklistDominios, ...ana.redFlagDominios, 'medicamentos', 'alergias',
]);
for (const fact of ana.fatos) if (fact.valor) anaKnowledge.revealed.set(fact.tag, fact);
const anaDecision = {
  conduta: ana.condutaGabarito.tipo,
  mips: [...ana.condutaGabarito.mips],
  redFlags: ana.fatos.filter((fact) => fact.redFlag && fact.valor).map((fact) => fact.tag),
  consultaBulario: true,
  testeRapido: null,
  dsf: ana.dsf?.condutaCorreta || null,
};
const anaPerfect = scoreCase(ana, anaKnowledge, anaDecision, [{ content: 'Bom dia, Ana.' }]);
assert.equal(anaPerfect.breakdown.find((item) => item.metrica === 'teste_rapido')?.pontos, 20,
  'a correct decision not to test earns the rapid-test rubric points when TLAC is not indicated');
assert.equal(anaPerfect.total, 100, 'a perfect case without TLAC indication can reach 100');

const anaUnnecessaryTest = scoreCase(ana, anaKnowledge, {
  ...anaDecision, testeRapido: { executado: true, resultado: 'positivo' },
}, [{ content: 'Bom dia, Ana.' }]);
assert.equal(anaUnnecessaryTest.breakdown.find((item) => item.metrica === 'teste_rapido')?.pontos, 0,
  'an unnecessary rapid test does not earn the rubric points');

for (const caso of CASES) {
  const state = new KnowledgeState(caso);
  state.askedDomains = new Set([
    ...(caso.checklistDominios || []), ...(caso.redFlagDominios || []), 'medicamentos', 'alergias',
  ]);
  if (caso.id === carla.id) state.warningSignsAsked = new Set(fullyAsked.warningSignsAsked);
  for (const fact of caso.fatos) if (fact.valor) state.revealed.set(fact.tag, fact);
  const decision = {
    conduta: caso.condutaGabarito.tipo,
    mips: [...caso.condutaGabarito.mips],
    redFlags: caso.fatos.filter((fact) => fact.redFlag && fact.valor).map((fact) => fact.tag),
    consultaBulario: true,
    testeRapido: caso.testeRapido?.indicado
      ? { executado: true, resultado: caso.testeRapido.resultado }
      : null,
    dsf: caso.id === carla.id ? marianaDsfText : (caso.dsf?.condutaCorreta || null),
  };
  const result = scoreCase(caso, state, decision, [{ content: `Bom dia, ${caso.persona.nome}.` }]);
  assert.equal(result.total, 100, `${caso.id}: perfect encoded-case performance reaches 100`);
}

assert.deepEqual([0, 1, 59, 60, 79, 80, 100].map(starsForScore), [0, 1, 1, 2, 2, 3, 3], 'star thresholds are inclusive at 60 and 80');

console.log('✅ fact-gate/scoring QA: normalization, bilingual classification, disclosure boundaries, score penalties, fail floor and stars PASS');
