// qa_dynamics.mjs — gate de integração da DINÂMICA DE PLANTÃO no browser:
// boota o jogo, confere o painel do menu (rank/combos/medalhas), o HUD de combo
// e o bloco do debrief ao encerrar um atendimento pela própria UI do jogo.
// Uso: node scripts/qa_dynamics.mjs [URL]   (jogo servido: npm run build && npm run serve)
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4174/';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };

// save com combo 2 e pontos — para o HUD de combo aparecer no boot
// (sem badges: assim o primeiro atendimento SEMPE desbloqueia 'primeiro_dia')
await page.addInitScript(() => {
  localStorage.setItem('farmacheck:progress', JSON.stringify({
    pontos: 120, combo: 2, semReprovar: 2, tresEstrelas: 1,
    badges: {}, historico: [], porFase: {}, porCaso: {},
  }));
  localStorage.setItem('farmacheck:narration', 'false');
});
// Config LLM opt-in: sem endpoint salvo, probe não roda e console fica limpo
page.addInitScript(() => {
  localStorage.setItem('farmacheck:llm', JSON.stringify({baseUrl: ''}));
});
// Este gate valida lógica/UI, não a animação visual. O loop real do cenário e
// a chegada do avatar são cobertos separadamente por qa:boot/qa:character-walk.
// Impedir o rAF recursivo evita que SwiftShader renderize sem parar no Chromium.
page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Limpar somente a configuração LLM antiga; preservar o save de prova
  // definido pelo gate para validar rank, pontos e combo persistidos.
  await page.evaluate(() => localStorage.removeItem('farmacheck:llm'));
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 20000, polling: 100 });
await page.evaluate(() => document.getElementById('capa-iniciar').click());
await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 90000, polling: 100 });
await page.waitForFunction(() => window.__farmacheck?.game, null, { timeout: 30000, polling: 100 });
// Não stubar load/mapeamento do avatar; somente a chegada cosmética.
await page.evaluate(() => {
  const game = window.__farmacheck.game;
  let currentAvatar = game.avatar;
  const skipCosmeticArrival = (model) => {
    if (model && typeof model.enter === 'function') model.enter = async () => {};
    return model;
  };
  currentAvatar = skipCosmeticArrival(currentAvatar);
  Object.defineProperty(game, 'avatar', {
    configurable: true,
    enumerable: true,
    get: () => currentAvatar,
    set: (model) => { currentAvatar = skipCosmeticArrival(model); },
  });
});

// ---- 1. painel do menu (rank + combo + medalhas) ----
await page.click('#btn-fases').catch(() => {});
const meta = await page.evaluate(() => {
  const box = document.getElementById('menu-meta');
  const menuVisible = !document.getElementById('menu').hidden;
  return {
    menuVisible,
    html: box ? box.innerHTML : null,
    medalhas: box ? box.querySelectorAll('.medalha').length : 0,
    on: box ? box.querySelectorAll('.medalha.on').length : 0,
    rankbar: box ? box.querySelector('.rankbar i')?.style.width || null : null,
  };
});
ok(meta.menuVisible, 'menu abre (Fases)');
ok(meta.rankbar !== null, 'barra de rank renderizada');
ok(meta.medalhas >= 12, `12+ medalhas no painel (${meta.medalhas})`);
ok(meta.on === 0, `save vazio → 0 medalhas acesas (${meta.on})`);
ok(/Prata/.test(meta.html || ''), 'rank Prata (120 pts) exibido');

// ---- 2. HUD de combo após o boot do caso ----
await page.click('#btn-iniciar');
await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 240000, polling: 200 });
const hud = await page.evaluate(() => {
  const c = document.getElementById('hud-combo');
  return { hidden: c.hidden, txt: c.textContent, score: document.getElementById('hud-score').textContent };
});
ok(!hud.hidden, 'HUD de combo visível (combo 2 no save)');
ok(/1\.2/.test(hud.txt), `HUD mostra ×1,2 (got "${hud.txt}")`);
ok(/120/.test(hud.score), 'HUD de pontos reflete o save (120)');
const patientHeader = await page.evaluate(() => {
  const game = window.__farmacheck.game;
  const phase = game.phaseDef();
  const name = game.case.persona.nome;
  const completed = game.progress?.state?.porFase?.[phase.id]?.feitos?.length || 0;
  const expectedQueue = phase.casos?.length
    ? `${document.documentElement.lang === 'en' ? 'Queue:' : 'Fila:'} ${Math.min(phase.casos.length, completed + 1)}/${phase.casos.length}`
    : null;
  return {
    caseName: name,
    chatName: document.getElementById('chat-nome').textContent,
    patientHud: document.getElementById('hud-paciente').textContent,
    queue: document.getElementById('hud-fila').textContent,
    queueHidden: document.getElementById('hud-fila').hidden,
    expectedQueue,
    counter: document.getElementById('chat-contador').textContent,
  };
});
ok(patientHeader.chatName.startsWith(`${patientHeader.caseName}, `), 'cabeçalho identifica o caso atual');
ok(patientHeader.patientHud.endsWith(patientHeader.caseName), 'HUD de paciente acompanha a troca de caso');
ok(patientHeader.expectedQueue === null
  ? patientHeader.queueHidden
  : !patientHeader.queueHidden && patientHeader.queue === patientHeader.expectedQueue,
'indicador de fila corresponde à fase atual');
ok(patientHeader.counter === '0/30', `contador inicia zerado (${patientHeader.counter})`);

// ---- 3. jogabilidade da anamnese: dica de onboarding, cobertura e chips ----
const anam = await page.evaluate(() => {
  const g = window.__farmacheck.game;
  return {
    dica: document.getElementById('chat-log').textContent.includes('Dica'),
    cobertura: document.getElementById('chat-cobertura').textContent.trim(),
    chips: document.querySelectorAll('#chat-chips button').length,
  };
});
ok(anam.dica, 'dica de onboarding no 1º atendimento');
ok(/Anamnese/i.test(anam.cobertura), `checklist de cobertura visível ("${anam.cobertura.slice(0, 40)}…")`);
ok(anam.chips >= 3, `perguntas rápidas renderizadas (${anam.chips})`);

const chipUsado = await page.evaluate(async () => {
  const g = window.__farmacheck.game;
  const b = document.querySelector('#chat-chips button');
  if (!b) return { clicked: false };
  const antes = document.querySelectorAll('#chat-chips button').length;
  b.click();
  await new Promise((r) => setTimeout(r, 400));
  const depois = document.querySelectorAll('#chat-chips button').length;
  return {
    clicked: true,
    antes,
    depois,
    usados: g.usedChips.size,
    cobertura: document.getElementById('chat-cobertura').textContent,
    counter: document.getElementById('chat-contador').textContent,
  };
});
if (chipUsado.clicked) {
  ok(chipUsado.depois === chipUsado.antes - 1, `chip usado some do painel (${chipUsado.antes} → ${chipUsado.depois})`);
  ok(chipUsado.usados >= 1, 'usedChips registrado');
  ok(/✓|Anamnese/i.test(chipUsado.cobertura), 'cobertura atualizada após a pergunta');
  ok(chipUsado.counter === '1/30', `contador acompanha o primeiro turno (${chipUsado.counter})`);
}

// ---- 4. encerrar um atendimento pela UI → bloco do debrief ----
const deb = await page.evaluate(async () => {
  const g = window.__farmacheck.game;
  g.goDecision();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); // atalho 1
  const condutaAtalho = g.conduta;
  g.selectConduta('sugerir');
  const confirmar = document.getElementById('btn-confirmar');
  const sugestaoSemMipBloqueada = confirmar.disabled;
  const primeiroMip = document.querySelector('#mip-list input[type="checkbox"]');
  if (primeiroMip) {
    primeiroMip.checked = true;
    primeiroMip.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const sugestaoComMipLiberada = !confirmar.disabled;
  if (primeiroMip) {
    primeiroMip.checked = false;
    primeiroMip.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const sugestaoSemSelecaoBloqueada = confirmar.disabled;
  g.selectConduta('vender');
  const historicoAntes = (g.progress.state.historico || []).length;
  await Promise.all([g.confirmDecision(), g.confirmDecision()]);
  const registroUnico = (g.progress.state.historico || []).length - historicoAntes;
  const box = document.getElementById('debrief-conquistas');
  const hist = g.progress.state.historico || [];
  const ult = hist[hist.length - 1] || {};
  return {
    visible: !box.hidden, html: box.innerHTML, condutaAtalho,
    registroUnico,
    mipOptions: document.querySelectorAll('#mip-list input[type="checkbox"]').length,
    sugestaoSemMipBloqueada, sugestaoComMipLiberada, sugestaoSemSelecaoBloqueada,
    score: document.getElementById('hud-score').textContent,
    pontos: g.progress.state.pontos, combo: g.progress.state.combo,
    nota: ult.nota, badges: Object.keys(g.progress.state.badges || {}),
  };
});
ok(deb.condutaAtalho === 'vender', `atalho 1 escolhe a conduta ("${deb.condutaAtalho}")`);
ok(deb.mipOptions > 0, `caso oferece MIPs selecionáveis (${deb.mipOptions})`);
ok(deb.sugestaoSemMipBloqueada, 'sugerir fica bloqueado sem MIP marcado');
ok(deb.sugestaoComMipLiberada, 'sugerir libera após marcar um MIP');
ok(deb.sugestaoSemSelecaoBloqueada, 'sugerir volta a bloquear após desmarcar o MIP');
ok(deb.registroUnico === 1, `confirmações simultâneas registram uma vez (${deb.registroUnico})`);
ok(Number.isFinite(deb.nota), 'atendimento registrado no histórico (nota)');
ok(deb.nota === 0 || deb.pontos > 120, `pontos cresceram (+${deb.pontos - 120}) a menos que reprovado (nota ${deb.nota})`);
ok(deb.visible, 'bloco do debrief (combo/bônus) visível');
ok(/Combo aplicado|combo/i.test(deb.html), 'linha "Combo aplicado" no debrief');
ok(/Conquista desbloqueada/i.test(deb.html), 'conquista nova listada no debrief');
ok(deb.badges.includes('primeiro_dia'), `primeiro_dia desbloqueado no save (${deb.badges.join(',')})`);
ok(deb.score.includes(String(deb.pontos)), `HUD de pontos bate com o save (${deb.score} vs ${deb.pontos})`);
ok(deb.nota >= 70 ? deb.combo === 3 : deb.combo === 0,
  `combo segue a nota (seed 2 → ${deb.nota >= 70 ? 3 : 0} após nota ${deb.nota}; got ${deb.combo})`);

const practiceLabel = await page.locator('#btn-repetir').innerText();
await page.click('#btn-repetir');
await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 90000, polling: 100 });
const replay = await page.evaluate(async () => {
  const game = window.__farmacheck.game;
  const faseId = game.phaseDef().id;
  const before = {
    pontos: game.progress.state.pontos,
    combo: game.progress.state.combo,
    feitos: game.progress.state.porFase[faseId]?.feitos?.length || 0,
    historico: game.progress.state.historico.length,
    badges: Object.keys(game.progress.state.badges).sort(),
  };
  game.goDecision();
  game.selectConduta('vender');
  await game.confirmDecision();
  const after = {
    pontos: game.progress.state.pontos,
    combo: game.progress.state.combo,
    feitos: game.progress.state.porFase[faseId]?.feitos?.length || 0,
    historico: game.progress.state.historico.length,
    badges: Object.keys(game.progress.state.badges).sort(),
  };
  return {
    before, after, practice: game.progress.state.pontos === before.pontos &&
      game.progress.state.combo === before.combo && after.feitos === before.feitos &&
      after.historico === before.historico && JSON.stringify(after.badges) === JSON.stringify(before.badges),
    notice: document.getElementById('debrief-conquistas').textContent,
    repeatMode: game.isPracticeReplay,
  };
});
ok(/treino.*sem pontuação/i.test(practiceLabel), `botão de replay identifica o modo treino ("${practiceLabel}")`);
ok(replay.practice && replay.repeatMode, `replay não altera pontos/combo/fase/conquistas (${JSON.stringify(replay.before)} → ${JSON.stringify(replay.after)})`);
ok(/Treino:.*não altera pontos/i.test(replay.notice), 'debrief informa que replay é treino sem recompensa');

await page.evaluate(() => {
  window.__reportPrintCalls = 0;
  window.print = () => { window.__reportPrintCalls += 1; };
});
await page.click('#btn-exportar');
ok(await page.evaluate(() => window.__reportPrintCalls === 1), 'exportar relatório aciona window.print uma única vez');

// ---- 4b. duas ativações rápidas de Próximo não podem cruzar chegadas ----
const transition = await page.evaluate(async () => {
  const game = window.__farmacheck.game;
  game.setPhase(0); // fixe a fila local para isolar o guard do serviço opcional do Expediente Livre
  const pendingBefore = game.caseTransitionPending;
  const phaseId = game.phaseDef().id;
  const originalEnterCase = game.enterCase;
  let releaseArrival;
  const arrivalGate = new Promise((resolve) => { releaseArrival = resolve; });
  let entries = 0;
  game.enterCase = async () => { entries++; await arrivalGate; game.state = 'ANAMNESE'; return true; };
  const first = game.nextPatient();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = game.nextPatient();
  const entriesBeforeRelease = entries;
  releaseArrival();
  const results = await Promise.all([first, second]);
  const state = game.state;
  game.enterCase = originalEnterCase;
  return { entries, entriesBeforeRelease, state, pendingBefore, phaseId, results };
});
ok(transition.entries === 1 && transition.results[0] === true && transition.results[1] === false,
  `duplo acionamento inicia uma chegada (antes/depois=${transition.entriesBeforeRelease}/${transition.entries}; pendente=${transition.pendingBefore}, fase=${transition.phaseId}, retornos=${transition.results})`);
ok(transition.state === 'ANAMNESE', `transição termina em anamnese (${transition.state})`);

const repeatTransition = await page.evaluate(async () => {
  const game = window.__farmacheck.game;
  const originalEnterCase = game.enterCase;
  let releaseArrival;
  const arrivalGate = new Promise((resolve) => { releaseArrival = resolve; });
  let entries = 0;
  game.enterCase = async () => { entries++; await arrivalGate; return true; };
  const first = game.startCase(game.case, { repeat: true, focusAfterArrival: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = game.startCase(game.case, { repeat: true, focusAfterArrival: true });
  const entriesBeforeRelease = entries;
  releaseArrival();
  const results = await Promise.all([first, second]);
  game.enterCase = originalEnterCase;
  return { entries, entriesBeforeRelease, results };
});
ok(repeatTransition.entriesBeforeRelease === 1 && repeatTransition.entries === 1 &&
  repeatTransition.results[0] === true && repeatTransition.results[1] === false,
  `duplo acionamento de repetir inicia uma vez (${repeatTransition.entriesBeforeRelease}/${repeatTransition.entries}; retornos=${repeatTransition.results})`);

const interruptedArrival = await page.evaluate(async () => {
  const game = window.__farmacheck.game;
  const originalEnter = game.avatar.enter;
  let releaseArrival;
  const arrivalGate = new Promise((resolve) => { releaseArrival = resolve; });
  let entered = false;
  game.avatar.enter = async () => { entered = true; await arrivalGate; };
  const starting = game.startCase(game.case, { repeat: true, focusAfterArrival: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  game.openMenu();
  releaseArrival();
  const started = await starting;
  const state = game.state;
  const menuVisible = !game.el.menu.hidden;
  game.avatar.enter = originalEnter;
  return { entered, started, state, menuVisible };
});
ok(interruptedArrival.entered && interruptedArrival.started === false &&
  interruptedArrival.state === 'MENU' && interruptedArrival.menuVisible,
  `abrir o menu interrompe a chegada pendente (started=${interruptedArrival.started}, state=${interruptedArrival.state}, menu=${interruptedArrival.menuVisible})`);

const staleReplyAfterMenu = await page.evaluate(async () => {
  const game = window.__farmacheck.game;
  await game.startCase(game.case, { repeat: true });
  const originalLlm = game.llm;
  let signalStarted;
  let releaseReply;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const responseGate = new Promise((resolve) => { releaseReply = resolve; });
  game.llm = {
    ok: true,
    chat: async (_messages, options = {}) => {
      signalStarted();
      await responseGate;
      options.onToken?.('Resposta antiga', 'Resposta antiga que não deve aparecer');
      return { text: 'Resposta antiga que não deve aparecer' };
    },
  };
  const input = game.el['chat-input'];
  input.value = 'onde dói?';
  const lastLineBefore = game.lastPatientLine;
  const pendingReply = game.onSubmit();
  await started;
  game.openMenu();
  releaseReply();
  const submitted = await pendingReply;
  const result = {
    submitted,
    state: game.state,
    busy: game.busy,
    menuVisible: !game.el.menu.hidden,
    lastLineUnchanged: game.lastPatientLine === lastLineBefore,
    staleTextVisible: game.el['chat-log'].textContent.includes('Resposta antiga que não deve aparecer'),
  };
  game.llm = originalLlm;
  return result;
});
ok(staleReplyAfterMenu.submitted === false && staleReplyAfterMenu.state === 'MENU' &&
  staleReplyAfterMenu.menuVisible && !staleReplyAfterMenu.busy &&
  staleReplyAfterMenu.lastLineUnchanged && !staleReplyAfterMenu.staleTextVisible,
  `resposta pendente descartada ao abrir menu (${JSON.stringify(staleReplyAfterMenu)})`);

const staleReplyAfterCaseChange = await page.evaluate(async () => {
  const game = window.__farmacheck.game;
  await game.startCase(game.case, { repeat: true });
  const originalLlm = game.llm;
  let signalStarted;
  let releaseReply;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const responseGate = new Promise((resolve) => { releaseReply = resolve; });
  game.llm = {
    ok: true,
    chat: async (_messages, options = {}) => {
      signalStarted();
      await responseGate;
      options.onToken?.('Resposta antiga', 'Resposta antiga que não deve aparecer');
      return { text: 'Resposta antiga que não deve aparecer' };
    },
  };
  game.el['chat-input'].value = 'onde dói?';
  const pendingReply = game.onSubmit();
  await started;
  const priorCaseId = game.case.id;
  const nextCase = game.cases.find((candidate) => candidate.id !== priorCaseId);
  const startedNext = await game.startCase(nextCase, { repeat: true });
  const currentCaseId = game.case.id;
  const openingBefore = game.lastPatientLine;
  releaseReply();
  const submitted = await pendingReply;
  const result = {
    submitted,
    startedNext,
    state: game.state,
    caseChanged: currentCaseId !== priorCaseId,
    lineUnchanged: game.lastPatientLine === openingBefore,
    historyLength: game.history.length,
    staleTextVisible: game.el['chat-log'].textContent.includes('Resposta antiga que não deve aparecer'),
  };
  game.llm = originalLlm;
  return result;
});
ok(staleReplyAfterCaseChange.submitted === false && staleReplyAfterCaseChange.startedNext &&
  staleReplyAfterCaseChange.state === 'ANAMNESE' && staleReplyAfterCaseChange.caseChanged &&
  staleReplyAfterCaseChange.lineUnchanged && staleReplyAfterCaseChange.historyLength === 0 &&
  !staleReplyAfterCaseChange.staleTextVisible,
  `resposta de caso anterior descartada após troca (${JSON.stringify(staleReplyAfterCaseChange)})`);

// ---- 5. resumo visual do fechamento de uma fase ----
const shift = await page.evaluate(() => {
  const game = window.__farmacheck.game;
  const phase = game.phases.find((candidate) => candidate.casos?.length);
  if (!phase) return { phaseFound: false };
  game.progress.state.porFase[phase.id] = {
    feitos: ['qa-a', 'qa-b'],
    estrelas: { 'qa-a': 3, 'qa-b': 2 },
  };
  game.mostrarFechamentoPlantao(phase);
  return {
    phaseFound: true,
    state: game.state,
    visible: !document.getElementById('plantao-modal').hidden,
    completed: document.getElementById('plantao-total').textContent,
    stars: document.getElementById('plantao-estrelas').textContent,
  };
});
ok(shift.phaseFound, 'fase finita encontrada para validar o fechamento');
ok(shift.state === 'PLANTAO_CONCLUIDO', 'controlador preserva o estado de fase concluída');
ok(shift.visible, 'modal de fechamento fica visível');
ok(shift.completed === '2', `total do turno renderizado (${shift.completed})`);
ok(shift.stars === '★ 5', `soma de estrelas renderizada (${shift.stars})`);

await browser.close();
console.log('\nerros de página:', errs.length ? errs.slice(0, 5).join(' | ') : 'nenhum');
if (errs.length) fails.push('erros de console/page');
console.log(fails.length ? `\n${fails.length} FALHA(S):\n- ${fails.join('\n- ')}` : '\n✔ QA DINÂMICA OK');
process.exit(fails.length ? 1 : 0);
