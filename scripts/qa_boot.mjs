// Gate de boot do FarmaCheck — pega a regressão que travava o jogo na capa.
//
// Contexto: o main.js tinha um `await loadGLBFPatient(...)` no topo do módulo, então
// TODO o wiring de UI (capa, menu, "Iniciar expediente", HUD) só acontecia depois do
// download do GLB do paciente (~10 s no headless). Nesse intervalo, clicar em
// "Iniciar Jogo" na capa não fazia nada. Este gate falha se o wiring atrasar.
//
// Uso: node scripts/qa_boot.mjs [URL]   (default http://127.0.0.1:4174/)
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4174/';
const ORCAMENTO_CAPA_MS = 1500;   // capa precisa responder ao 1º clique rápido
const ORCAMENTO_CENA_MS = 20000;  // cena 3D/GLB pode demorar (SwiftShader/Rede)
const falhas = [];
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) falhas.push(msg);
};

const browser = await chromium.launch({ headless: true });

async function cenario(nome, viewport, usarToque) {
  console.log(`\n── ${nome} (${viewport.width}×${viewport.height})`);
  const contexto = await browser.newContext({ viewport, hasTouch: usarToque, isMobile: usarToque });
  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 1. Capa interativa logo no começo: É o primeiro clique do jogador e o teste
  //    que pega a regressão do boot bloqueado. A capa vive no entry leve (~13 kB,
  //    sem three.js), então não pode esperar a cena 3D.
  //    Os tempos vêm carimbados pela própria página (`data-capa-pronta-ms` /
  //    `data-jogo-pronto-ms`): o polling do harness é rAF e fica faminto enquanto a
  //    cena inicializa, o que produzia falso negativo de vários segundos.
  const capaMarcada = await page.waitForFunction(
    () => document.documentElement.dataset.capaPronta === '1',
    null, { timeout: ORCAMENTO_CAPA_MS + 5000, polling: 100 },
  ).then(() => true).catch(() => false);
  const msCapa = await page.evaluate(() => Number(document.documentElement.dataset.capaProntaMs || 0));
  ok(capaMarcada && msCapa > 0 && msCapa <= ORCAMENTO_CAPA_MS,
    `capa com listeners prontos em ${msCapa || '>orçamento'} ms (orçamento ${ORCAMENTO_CAPA_MS} ms)`);

  await page.evaluate(() => document.getElementById('capa-iniciar')?.click());
  const capaFechou = await page.waitForFunction(() => document.getElementById('capa').hidden === true, null,
    { timeout: 4000, polling: 100 }).then(() => true).catch(() => false);
  ok(capaFechou, 'clique em "Iniciar Jogo" fecha a capa e abre o menu');
  ok(await page.$eval('#menu', (el) => el.hidden === false), 'menu visível para escolher a fase');

  // 2. Cena 3D + jogo prontos (aqui sim pode demorar: three.js, WebGL, GLB, props)
  const jogoMarcado = await page.waitForFunction(
    () => document.documentElement.dataset.jogoPronto === '1',
    null, { timeout: ORCAMENTO_CENA_MS + 5000, polling: 100 },
  ).then(() => true).catch(() => false);
  const msJogo = await page.evaluate(() => Number(document.documentElement.dataset.jogoProntoMs || 0));
  ok(jogoMarcado && msJogo > 0 && msJogo <= ORCAMENTO_CENA_MS,
    `cena 3D pronta em ${msJogo || '>orçamento'} ms (orçamento ${ORCAMENTO_CENA_MS} ms)`);

  if (!jogoMarcado) { ok(false, 'sem hook __farmacheck: fluxo interrompido'); await contexto.close(); return; }
  ok(await page.evaluate(() => Boolean(window.__farmacheck?.game)),
    'hook de QA (__farmacheck.game) disponível');
  ok(await page.$eval('#btn-iniciar', (el) => el.disabled === false), 'botão "Iniciar expediente" liberado quando a cena fica pronta');

  // 3. Menu → atendimento
  await page.click('#btn-iniciar');
  const hud = await page.waitForSelector('#acoes:not([hidden])', { timeout: 30000 }).then(() => true).catch(() => false);
  ok(hud, 'HUD de atendimento aparece');

  // 4. Chegada → Anamnese (chat destravado)
  const anamnese = await page.waitForFunction(
    () => window.__farmacheck.game.state === 'ANAMNESE',
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  ok(anamnese, 'fase chega em ANAMNESE (walk-in conclui)');
  ok(await page.$eval('#chat-input', (el) => el.disabled === false), 'chat liberado na anamnese');
  const fase = await page.$eval('#hud-fase', (el) => el.textContent);
  ok(fase === 'Anamnese', `HUD mostra a fase Anamnese (${fase})`);

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
  await contexto.close();
}

try {
  await cenario('desktop', { width: 1280, height: 800 }, false);
  await cenario('celular', { width: 390, height: 844 }, true);
} finally {
  await browser.close();
}

console.log(falhas.length ? `\n❌ boot: ${falhas.length} falha(s)` : '\n✅ boot OK');
process.exit(falhas.length ? 1 : 0);
