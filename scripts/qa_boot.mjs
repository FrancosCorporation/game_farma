// Gate de boot do FarmaCheck — pega a regressão que travava o jogo na capa.
//
// Contexto: o main.js tinha um `await loadGLBFPatient(...)` no topo do módulo, então
// TODO o wiring de UI (capa, menu, "Iniciar expediente", HUD) só acontecia depois do
// download do GLB do paciente (~10 s no headless). Nesse intervalo, clicar em
// "Iniciar Jogo" na capa não fazia nada. Este gate falha se o wiring atrasar.
//
// Uso: node scripts/qa_boot.mjs [URL]   (default http://127.0.0.1:4174/)
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.argv[2] || 'http://127.0.0.1:4174/';
const QA_OUTPUT = process.env.QA_OUTPUT || resolve(root, '.planning/2026-10-12-melhoria-integral/implementation/20261018_fc027_runtime_qa/qa_boot.json');
const ORCAMENTO_CAPA_MS = 1500;   // capa precisa responder ao 1º clique rápido
const ORCAMENTO_CENA_MS = 20000;  // cena 3D/GLB pode demorar (SwiftShader/Rede)
const falhas = [];
const cenarios = [];
const progresso = [];
const startedAt = new Date();
const listSourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name);
  if (entry.isDirectory()) return listSourceFiles(path);
  return /\.(?:js|css)$/.test(entry.name) ? [relative(root, path)] : [];
});
const hashFiles = (files) => files.map((path) => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'),
}));
const sourceManifest = hashFiles([
  'scripts/qa_boot.mjs', 'package.json', 'package-lock.json', 'vite.config.js', 'index.html',
  ...listSourceFiles(resolve(root, 'src')),
]);
const viewports = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'celular', viewport: { width: 390, height: 844 }, touch: true },
];
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) falhas.push(msg);
};
const markProgress = (step, detail = undefined) => progresso.push({
  step,
  ...(detail === undefined ? {} : { detail }),
  at: Date.now(),
});

let browser = null;

async function cenario(nome, viewport, usarToque) {
  const scenarioStartedAt = Date.now();
  const failureOffset = falhas.length;
  const scenario = {
    name: nome,
    viewport: { ...viewport },
    touch: usarToque,
    result: 'running',
    progress: [],
    failures: [],
    modelId: null,
    coverClickLatencyMs: null,
  };
  cenarios.push(scenario);
  const markProgress = (step, detail = undefined) => scenario.progress.push({
    step,
    ...(detail === undefined ? {} : { detail }),
    at: Date.now(),
  });
  let contexto = null;
  markProgress('started');
  console.log(`\n── ${nome} (${viewport.width}×${viewport.height})`);
  try {
    contexto = await browser.newContext({ viewport, hasTouch: usarToque, isMobile: usarToque });
    markProgress('context-created');
    const page = await contexto.newPage();
    markProgress('page-created');
    await page.addInitScript(() => {
      localStorage.setItem('farmacheck:llm', JSON.stringify({baseUrl: ''}));
    });
    markProgress('init-script-installed');
    const erros = [];
    page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 160)); });
    page.on('response', (response) => {
      if (response.status() >= 400) erros.push(`HTTP ${response.status()}: ${response.url()}`);
    });

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    markProgress('navigated');
    // Limpar config LLM antiga para evitar probe ERR_CONNECTION_REFUSED
    await page.evaluate(() => localStorage.clear());
  //    que pega a regressão do boot bloqueado. A capa vive no entry leve (~13 kB,
  //    sem three.js), então não pode esperar a cena 3D.
  //    Os tempos vêm carimbados pela própria página (`data-capa-pronta-ms` /
  //    `data-jogo-pronto-ms`): o polling do harness é rAF e fica faminto enquanto a
  //    cena inicializa, o que produzia falso negativo de vários segundos.
    const msCapa = await page.evaluate(() => Number(document.documentElement.dataset.capaProntaMs || 0));
    // O chunk 3D pode bloquear o event loop depois de initCapa() já ter
    // instalado os listeners. Nesse caso, waitForFunction expira sem observar
    // o estado, embora o timestamp escrito pela própria página prove quando
    // a capa ficou pronta. O carimbo é a fonte de verdade para este orçamento.
    const capaMarcada = msCapa > 0;
    ok(capaMarcada && msCapa > 0 && msCapa <= ORCAMENTO_CAPA_MS,
    `capa com listeners prontos em ${msCapa || '>orçamento'} ms (orçamento ${ORCAMENTO_CAPA_MS} ms)`);
    markProgress(capaMarcada ? 'cover-ready' : 'cover-timeout');

    const coverClickStartedAt = Date.now();
  await page.click('#capa-iniciar');
    scenario.coverClickLatencyMs = Date.now() - coverClickStartedAt;
    markProgress('cover-clicked', { latencyMs: scenario.coverClickLatencyMs });
    ok(scenario.coverClickLatencyMs <= ORCAMENTO_CAPA_MS,
      `primeiro clique recebido em ${scenario.coverClickLatencyMs} ms (orçamento ${ORCAMENTO_CAPA_MS} ms)`);
    const stateAfterCoverClick = await page.evaluate(() => ({
      coverHidden: document.getElementById('capa').hidden,
      menuVisible: document.getElementById('menu').hidden === false,
    }));
    ok(stateAfterCoverClick.coverHidden, 'clique em "Iniciar Jogo" fecha a capa');
    ok(stateAfterCoverClick.menuVisible, 'menu visível para escolher a fase');
    markProgress(stateAfterCoverClick.coverHidden && stateAfterCoverClick.menuVisible ? 'menu-open' : 'menu-timeout');

  // 2. Cena 3D + jogo prontos (aqui sim pode demorar: three.js, WebGL, GLB, props)
  const jogoMarcado = await page.waitForFunction(
    () => document.documentElement.dataset.jogoPronto === '1',
    null, { timeout: ORCAMENTO_CENA_MS + 5000, polling: 100 },
  ).then(() => true).catch(() => false);
  const msJogo = await page.evaluate(() => Number(document.documentElement.dataset.jogoProntoMs || 0));
  ok(jogoMarcado && msJogo > 0 && msJogo <= ORCAMENTO_CENA_MS,
    `cena 3D pronta em ${msJogo || '>orçamento'} ms (orçamento ${ORCAMENTO_CENA_MS} ms)`);
  markProgress(jogoMarcado ? 'scene-ready' : 'scene-timeout');
  if (jogoMarcado) {
    scenario.modelId = await page.evaluate(() => window.__farmacheck?.game?.avatar?.modelId || null);
    markProgress('runtime-model-recorded', { modelId: scenario.modelId });
  }

  if (!jogoMarcado) {
    ok(false, 'sem hook __farmacheck: fluxo interrompido');
    markProgress('qa-hook-missing');
    return;
  }
  ok(await page.evaluate(() => Boolean(window.__farmacheck?.game)),
    'hook de QA (__farmacheck.game) disponível');
  ok(await page.$eval('#btn-iniciar', (el) => el.disabled === false), 'botão "Iniciar expediente" liberado quando a cena fica pronta');

  // 3. Menu → atendimento. ORDEM IMPORTA: no headless (SwiftShader ~3 fps) o
  // walk-in do paciente pode passar de 1 min, então primeiro espera a fase
  // ANAMNESE concluir (timeout generoso) e SÓ ENTÃO exige a barra do POV
  // visível. Antes a barra era esperada com 30 s e falhava por orçamento de
  // tempo (gate flaky), não por bug.
  await page.click('#btn-iniciar');
  const anamnese = await page.waitForFunction(
    () => window.__farmacheck.game.state === 'ANAMNESE',
    null, { timeout: 180000, polling: 200 },
  ).then(() => true).catch(() => false);
  ok(anamnese, 'fase chega em ANAMNESE (walk-in conclui)');
  markProgress(anamnese ? 'anamnesis-ready' : 'anamnesis-timeout');
  const hud = await page.waitForSelector('#acoes:not([hidden])', { timeout: 15000 })
    .then(() => true).catch(() => false);
  ok(hud, 'HUD de atendimento aparece (barra do POV visível na anamnese)');

  if (!usarToque) {
    const rodapeSemSobreposicao = await page.evaluate(() => {
      const actions = document.getElementById('acoes').getBoundingClientRect();
      const hint = document.getElementById('dica-controles').getBoundingClientRect();
      return actions.right <= hint.left || actions.left >= hint.right
        || actions.bottom <= hint.top || actions.top >= hint.bottom;
    });
    ok(rodapeSemSobreposicao, 'barra de instruções de teclado não fica atrás das ações');
  }

  ok(await page.$eval('#chat-input', (el) => el.disabled === false), 'chat liberado na anamnese');
  const fase = await page.$eval('#hud-fase', (el) => el.textContent);
  ok(fase === 'Anamnese', `HUD mostra a fase Anamnese (${fase})`);

  if (usarToque) {
    const toggle = page.locator('#btn-chat-toggle');
    ok(await toggle.isVisible(), 'controle de conversa/cena visível no celular');
    await toggle.tap();
    const recolhido = await page.evaluate(() => ({
      collapsed: document.body.classList.contains('mobile-chat-collapsed'),
      expanded: document.getElementById('btn-chat-toggle').getAttribute('aria-expanded'),
      formHidden: getComputedStyle(document.getElementById('chat-form')).display === 'none',
    }));
    ok(recolhido.collapsed && recolhido.expanded === 'false' && recolhido.formHidden,
      'toque recolhe o chat, preserva o botão e libera a cena');
    await toggle.tap();
    const expandido = await page.evaluate(() => ({
      collapsed: document.body.classList.contains('mobile-chat-collapsed'),
      expanded: document.getElementById('btn-chat-toggle').getAttribute('aria-expanded'),
      formVisible: getComputedStyle(document.getElementById('chat-form')).display !== 'none',
    }));
    ok(!expandido.collapsed && expandido.expanded === 'true' && expandido.formVisible,
      'novo toque reabre a conversa e restaura os controles');
    const semSobreposicao = await page.evaluate(() => {
      const a = document.getElementById('acoes').getBoundingClientRect();
      const c = document.getElementById('chat').getBoundingClientRect();
      return a.bottom <= c.top || a.top >= c.bottom;
    });
    ok(semSobreposicao, 'barra de ações e chat não se sobrepõem no viewport móvel');
  }

  // Real atendimento controller: bulário closes through the existing Escape handler.
  await page.locator('#btn-hud-pc').focus();
  await page.keyboard.press('Enter');
  await page.locator('#bulario').waitFor({ state: 'visible' });
  ok(await page.locator('#bulario').getAttribute('role') === 'region', 'bulário identificado como região de consulta');
  ok(await page.locator('#bulario-titulo').count() === 1, 'título do bulário tem ID único');
  await page.keyboard.press('Escape');
  await page.locator('#bulario').waitFor({ state: 'hidden' });
  ok(await page.evaluate(() => document.activeElement.id === 'btn-hud-pc'), 'Escape devolve foco ao acionador do bulário');

  // 4. Chat funcional sem LLM (modo plantão determinístico)
  const antes = await page.$$eval('#chat-log .bub', (els) => els.length);
  await page.fill('#chat-input', 'Onde dói e desde quando?');
  await page.keyboard.press('Enter');
  const respondeu = await page.waitForFunction(
    (n) => document.querySelectorAll('#chat-log .bub').length > n,
    antes, { timeout: 20000 },
  ).then(() => true).catch(() => false);
  ok(respondeu, 'paciente responde no chat (fallback sem LLM)');

  ok(erros.length === 0, `console limpo${erros.length ? ' — ' + erros.slice(0, 3).join(' | ') : ''}`);
  scenario.modelId = await page.evaluate(() => window.__farmacheck.game.avatar?.modelId || null);
  markProgress('scenario-assertions-finished');
  } catch (error) {
    scenario.error = { name: error?.name || 'Error', message: String(error?.message || error) };
    throw error;
  } finally {
    if (contexto) await contexto.close().catch(() => {});
    scenario.failures = falhas.slice(failureOffset);
    scenario.result = scenario.error || scenario.failures.length ? 'FAIL' : 'PASS';
    scenario.durationMs = Date.now() - scenarioStartedAt;
    markProgress('finished');
  }
}

let failure = null;
try {
  markProgress('chromium-launch-started');
  browser = await chromium.launch({ headless: true });
  markProgress('chromium-launched');
  await cenario(viewports[0].name, viewports[0].viewport, viewports[0].touch);
  await cenario(viewports[1].name, viewports[1].viewport, viewports[1].touch);
} catch (error) {
  failure = { name: error?.name || 'Error', message: String(error?.message || error) };
  if (!falhas.includes(failure.message)) falhas.push(failure.message);
  markProgress('failed', failure);
  throw error;
} finally {
  await browser?.close().catch((error) => {
    const message = `Chromium close: ${error?.message || error}`;
    if (!falhas.includes(message)) falhas.push(message);
    failure ||= { name: error?.name || 'Error', message };
  });
  markProgress(failure || falhas.length ? 'finished-with-failure' : 'finished');
  const modelFiles = [...new Set(cenarios.map(({ modelId }) => modelId).filter(Boolean)
    .map((modelId) => `public/models/${modelId}.glb`))];
  const sceneFiles = [
    'public/models/candidates/atendente_balcon_voxel_walkidle_candidate_v024_fairing_preserve_normals.glb',
    'public/models/candidates/atendente_gondola_voxel_walkidle_candidate_v004_fitted_reweighted.glb',
    'public/models/candidates/prop_balcao_v001.glb', 'public/models/candidates/prop_cpu_v002.glb',
    'public/models/candidates/prop_gondola_v002.glb', 'public/models/candidates/prop_mesa_v002.glb',
    'public/models/candidates/prop_pc_v002.glb', 'public/models/candidates/prop_vitrine_v002.glb',
  ];
  const finishedAt = new Date();
  const report = {
    schema: 'farmacheck.boot-runtime-qa.v2',
    id: 'FC-027',
    url: URL,
    status: failure ? 'failed' : falhas.length ? 'failed' : 'passed',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    scenarios: cenarios,
    viewports,
    progress: progresso,
    failures: falhas,
    failure,
    sourceManifest,
    assetManifest: hashFiles([...new Set([...modelFiles, ...sceneFiles])]),
  };
  mkdirSync(dirname(QA_OUTPUT), { recursive: true });
  writeFileSync(QA_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Evidence: ${QA_OUTPUT}`);
}

console.log(falhas.length ? `\n❌ boot: ${falhas.length} falha(s)` : '\n✅ boot OK');
process.exit(falhas.length ? 1 : 0);
