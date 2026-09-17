// QA loop v2 — FarmaCheck: menu → fase → paciente → chat → decisão → debriefing
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.argv[2] || 'http://localhost:4174/';
const OUT = process.argv[3] || '/tmp/opencode/farmacheck_qa';
mkdirSync(OUT, { recursive: true });

const issues = [];
const checks = [];
const screens = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) issues.push(`${name}: ${detail}`);
}
async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p });
  screens.push(p);
  console.log(`📸 ${p}`);
}
const grab = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });

try {
  // ---- 1. Carregamento + menu ----
  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  check('servidor responde', resp && resp.ok(), resp && String(resp.status()));
  await page.waitForTimeout(2000);
  await shot(page, '00_menu');

  const capaHidden = await page.$eval('#capa', (el) => el.hidden).catch(() => null);
  const btnCapaIniciar = await page.$('#capa-iniciar');
  check('capa visível com hotspot iniciar', capaHidden === false && !!btnCapaIniciar, `capa.hidden=${capaHidden}`);

  // Capa → Menu
  if (btnCapaIniciar && capaHidden === false) {
    await page.evaluate(() => document.querySelector('#capa-iniciar').click());
    await page.waitForTimeout(800);
    await shot(page, '00b_menu');
  }

  const menuHidden = await page.$eval('#menu', (el) => el.hidden).catch(() => null);
  const btnIniciar = await page.$('#btn-iniciar');
  check('menu visível com botão iniciar', menuHidden === false && !!btnIniciar, `menu.hidden=${menuHidden}`);

  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('#scene3d');
    return c ? { w: c.width, h: c.height, hasGL: !!c.getContext('webgl2') || !!c.getContext('webgl') } : null;
  });
  check('canvas 3D presente', !!canvasInfo && canvasInfo.w > 0, `w=${canvasInfo?.w} h=${canvasInfo?.h}`);

  // ---- 2. Iniciar jogo ----
  if (btnIniciar) {
    await page.evaluate(() => document.querySelector('#btn-iniciar').click());
    // aguarda o jogo chegar à ANAMNESE (o GLB pode demorar ~4s)
    let anamnese = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      anamnese = await page.evaluate(() => window.__farmacheck?.game?.state === 'ANAMNESE');
      if (anamnese) break;
    }
    await shot(page, '01_iniciado');
    const paciente = await grab(page, '#hud-paciente');
    const fase = await grab(page, '#hud-fase');
    const chatNome = await grab(page, '#chat-nome');
    check('iniciou e mostrou paciente', !!paciente && !/encerrado/i.test(paciente || ''), `hud-paciente="${paciente}"`);
    check('fase setada (Anamnese)', anamnese && !!fase && fase !== '—', `fase="${fase}" state=${anamnese}`);
    check('chat com nome do paciente', !!chatNome && !/aguardando/i.test(chatNome || ''), `chat-nome="${chatNome}"`);
    console.log('PACIENTE:', paciente, '| FASE:', fase, '| CHAT:', chatNome);
  } else {
    check('botão iniciar encontrado', false, 'sem #btn-iniciar');
  }

  // ---- 3. Chat de anamnese (enviar pergunta) ----
  await page.waitForTimeout(1500);
  const chatLogBefore = await page.$eval('#chat-log', (el) => el.childElementCount).catch(() => 0);
  await page.fill('#chat-input', 'Olá! O que está sentindo?');
  await page.click('#btn-send');
  await page.waitForTimeout(2500);
  const chatLogAfter = await page.$eval('#chat-log', (el) => el.childElementCount).catch(() => 0);
  check('chat envia mensagem', chatLogAfter > chatLogBefore, `bolhas ${chatLogBefore} → ${chatLogAfter}`);
  await shot(page, '02_chat');

  // ---- 4. Bulário (Consultar Computador) ----
  const btnPC = await page.$('#btn-hud-pc');
  if (btnPC) {
    await page.evaluate(() => document.querySelector('#btn-hud-pc').click());
    await page.waitForTimeout(1200);
    const bularioVisivel = !(await page.$eval('#bulario', (el) => el.hidden).catch(() => true));
    check('abre bulário', bularioVisivel);
    await shot(page, '03_bulario');
    const bularioCorpo = await grab(page, '#bulario-corpo');
    check('bulário com conteúdo', !!bularioCorpo && bularioCorpo.trim().length > 20, `len=${bularioCorpo?.trim().length}`);
    const fechar = await page.$('#btn-bulario-fechar');
    if (fechar) { await page.evaluate(() => document.querySelector('#btn-bulario-fechar').click()); await page.waitForTimeout(600); }
  } else {
    check('botão Consultar Computador', false, 'sem #btn-hud-pc');
  }

  // ---- 5. Teste Rápido (TLAC) ----
  const btnTLAC = await page.$('#btn-hud-tlac');
  if (btnTLAC) {
    await page.evaluate(() => document.querySelector('#btn-hud-tlac').click());
    await page.waitForTimeout(1200);
    await shot(page, '04_tlac');
    // verifica se abriu algum painel
    const tlacVisible = !(await page.$eval('#tlac', (el) => el.hidden).catch(() => true));
    const tlacText = await grab(page, '#tlac') || await grab(page, '#tlac-corpo');
    check('abre teste rápido (TLAC)', tlacVisible || (tlacText && tlacText.length > 10), `visivel=${tlacVisible}`);
  } else {
    check('botão Teste Rápido', false, 'sem #btn-hud-tlac');
  }

  // ---- 6. Decisão clínica ----
  const btnDecisao = await page.$('#btn-decisao');
  if (btnDecisao && await btnDecisao.isVisible().catch(() => false)) {
    await page.evaluate(() => document.querySelector('#btn-decisao').click());
    await page.waitForTimeout(1000);
    await shot(page, '05_decisao');
    const condutas = await page.$$('.conduta');
    check('painel de decisão com condutas', condutas.length >= 3, `${condutas.length} condutas`);
    const redflags = await page.$eval('#redflag-list', (el) => el.childElementCount).catch(() => 0);
    const condutaCards = await page.$eval('#conduta-cards', (el) => el.childElementCount).catch(() => 0);
    check('red flags listadas', redflags > 0, `${redflags} red flags`);
    check('condutas renderizadas', condutaCards >= 3, `${condutaCards} cards`);
  } else {
    check('botão de decisão', false, 'sem #btn-decisao visível');
  }

  // ---- 7. WebGL + FPS + erros ----
  const webgl = await page.evaluate(() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
    catch { return false; }
  });
  check('WebGL disponível', webgl);
  check('sem erros JS', errors.length === 0, errors.slice(0, 5).join(' | '));

  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else res(Math.round(n / 1.5)); };
    requestAnimationFrame(loop);
  }));
  check('FPS renderização', fps >= 20, `${fps} fps`);

} catch (e) {
  check('execução do QA', false, e.message.slice(0, 250));
}

await browser.close();

const report = { ts: new Date().toISOString(), url: URL, checks, issues, errors, screens, pass: issues.length === 0 };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n=== RESULTADO: ${report.pass ? 'PASS' : 'FAIL'} — ${checks.length} checagens, ${issues.length} problemas ===`);
process.exit(report.pass ? 0 : 1);