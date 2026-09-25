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
    await page.evaluate(() => {
      window.__tInicio = performance.now();
      document.querySelector('#btn-iniciar').click();
    });
    // Aguarda o jogo chegar à ANAMNESE. Prazo generoso de propósito: em headless o
    // WebGL é SwiftShader (~1 fps) e o walk-in do paciente só avança por frames
    // renderizados — um limite de 10 s aqui só media a lentidão do software rasterizer.
    // O tempo que interessa (com GPU) sai no log abaixo.
    const anamnese = await page.waitForFunction(
      () => window.__farmacheck?.game?.state === 'ANAMNESE',
      null, { timeout: 90000, polling: 100 },
    ).then(() => true).catch(() => false);
    const msAteAnamnese = await page.evaluate(() => Math.round(performance.now() - (window.__tInicio || performance.now())));
    await shot(page, '01_iniciado');
    const paciente = await grab(page, '#hud-paciente');
    const fase = await grab(page, '#hud-fase');
    const chatNome = await grab(page, '#chat-nome');
    check('iniciou e mostrou paciente', !!paciente && !/encerrado/i.test(paciente || ''), `hud-paciente="${paciente}"`);
    check('fase setada (Anamnese)', anamnese && !!fase && fase !== '—',
      `fase="${fase}" state=${anamnese} em ${msAteAnamnese} ms (headless/software)`);
    check('chat com nome do paciente', !!chatNome && !/aguardando/i.test(chatNome || ''), `chat-nome="${chatNome}"`);
    console.log('PACIENTE:', paciente, '| FASE:', fase, '| CHAT:', chatNome, '| até digitar:', msAteAnamnese + 'ms');
  } else {
    check('botão iniciar encontrado', false, 'sem #btn-iniciar');
  }

  // ---- 3. Chat de anamnese (pergunta guiada + chips do caso) ----
  await page.waitForTimeout(1500);
  const chatLogBefore = await page.$eval('#chat-log', (el) => el.childElementCount).catch(() => 0);
  await page.fill('#chat-input', 'Olá! O que está sentindo?');
  await page.click('#btn-send');
  await page.waitForTimeout(2500);
  const chatLogAfter = await page.$eval('#chat-log', (el) => el.childElementCount).catch(() => 0);
  check('chat envia mensagem', chatLogAfter > chatLogBefore, `bolhas ${chatLogBefore} → ${chatLogAfter}`);
  await shot(page, '02_chat');

  // Os chips são as perguntas guiadas do caso: sem percorrê-los, nenhum sinal de alarme
  // é revelado e a lista de red flags fica (corretamente) vazia. Percorrer chips é o
  // caminho que o jogador faz — e é o que dá sentido à checagem da etapa 6.
  // Re-consulta a cada volta: renderChips() recria os botões a cada resposta, e um
  // handle capturado antes fica órfão (clicar nele não faz nada).
  let clicados = 0;
  for (let i = 0; i < 8; i++) {
    const chip = await page.$('#chat-chips button[data-q]');
    if (!chip || !(await chip.isVisible().catch(() => false))) break;
    await chip.click({ force: true }).catch(() => {});
    clicados++;
    await page.waitForTimeout(1200);
  }
  const estado = await page.evaluate(() => ({
    revelados: window.__farmacheck?.game?.knowledge?.revealed?.size ?? 0,
    chips: document.querySelectorAll('#chat-chips button[data-q]').length,
  }));
  check('chips revelam fatos do caso', estado.revelados > 0,
    `${clicados} chips clicados, ${estado.revelados} fatos revelados, ${estado.chips} chips restantes`);

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
  // O caso sorteado é aleatório: alguns (jose_gripe, marina_amoxicilina) são
  // "emergência silenciosa" (temRedFlag: false) — zero red flags é o COMPORTAMENTO
  // CORRETO neles. Então a checagem se adapta ao caso: caso com red flag → lista
  // preenchida; caso silencioso → lista vazia e painel funcional mesmo assim.
  const btnDecisao = await page.$('#btn-decisao');
  if (btnDecisao && await btnDecisao.isVisible().catch(() => false)) {
    const casoTemRedFlag = await page.evaluate(
      () => Boolean(window.__farmacheck?.game?.case?.temRedFlag),
    );
    await page.evaluate(() => document.querySelector('#btn-decisao').click());
    await page.waitForTimeout(1000);
    await shot(page, '05_decisao');
    const condutas = await page.$$('.conduta');
    check('painel de decisão com condutas', condutas.length >= 3, `${condutas.length} condutas`);
    const redflags = await page.$eval('#redflag-list', (el) => el.childElementCount).catch(() => 0);
    if (casoTemRedFlag) {
      check('red flags listadas', redflags > 0, `${redflags} red flags (caso tem sinal de alarme)`);
    } else {
      check('sem red flags em caso de emergência silenciosa', redflags === 0,
        `${redflags} red flags (esperado: caso ${'temRedFlag:false'})`);
    }
    const condutaCards = await page.$eval('#conduta-cards', (el) => el.childElementCount).catch(() => 0);
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

  // FPS: em headless sem GPU o WebGL cai para SwiftShader (render por software) — 1 fps
  // ali não diz nada sobre o jogo. Medimos, reportamos, e só falhamos se estiver
  // realmente travado (<1 fps) ou se houver GPU de verdade (aí o piso de 20 fps vale).
  const gpu = await page.evaluate(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'desconhecida';
    } catch { return 'desconhecida'; }
  });
  const software = /swiftshader|llvmpipe|software/i.test(gpu);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else res(Math.round(n / 1.5)); };
    requestAnimationFrame(loop);
  }));
  if (software) {
    check('FPS renderização (software/SwiftShader — informativo)', fps >= 1, `${fps} fps · GPU="${gpu}"`);
  } else {
    check('FPS renderização', fps >= 20, `${fps} fps · GPU="${gpu}"`);
  }

} catch (e) {
  check('execução do QA', false, e.message.slice(0, 250));
}

await browser.close();

const report = { ts: new Date().toISOString(), url: URL, checks, issues, errors, screens, pass: issues.length === 0 };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n=== RESULTADO: ${report.pass ? 'PASS' : 'FAIL'} — ${checks.length} checagens, ${issues.length} problemas ===`);
process.exit(report.pass ? 0 : 1);