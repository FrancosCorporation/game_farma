// Smoke F2/F3/F4 — navegação por pontos de interesse, TLAC completo na Carla e DSF emitida.
// Uso: node scripts/smoke-f2f3f4.mjs  (requer o jogo servido — `npm run preview` na 4173 ou SMOKE_URL)
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173/';
const falhas = [];
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) falhas.push(msg);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => falhas.push('pageerror: ' + e.message));

try {
  await page.goto(BASE, { waitUntil: 'load' });

  // F0 intacta: capa → menu
  await page.click('#capa-iniciar');
  await page.waitForSelector('#menu:not([hidden])');
  ok(true, 'F0 intacta — capa abre o menu');

  await page.click('#btn-iniciar');
  await page.waitForSelector('#acoes:not([hidden])', { timeout: 30000 });
  ok(true, 'atendimento iniciado — barra de ações (HUD) visível');

  // Força o caso da Carla (arbovirose) via hook de QA
  await page.evaluate(() => {
    const { game } = window.__farmacheck;
    game.startCase(game.cases.find((c) => c.id === 'carla_dengue'));
  });
  await page.waitForFunction(
    () => document.getElementById('acoes').hidden === false
      && window.__farmacheck.game.case?.id === 'carla_dengue',
    null, { timeout: 30000 },
  );
  ok(true, 'caso Carla (dengue) carregado');

  // F2 — botão "Consultar Computador" → zona computador + bulário
  await page.click('#btn-hud-pc');
  await page.waitForSelector('#bulario:not([hidden])');
  let zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'computador', `câmera vai à zona computador (obtido: ${zona})`);
  ok((await page.textContent('#bulario-corpo')).includes('Sonrisal'), 'bulário exibe o pedido/alerta de contraindicação');
  ok((await page.textContent('#chat-log')).includes('Bulário/diretrizes consultados'), '+10: consulta ao bulário registrada');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#bulario', { state: 'hidden' });
  zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'paciente', 'Escape volta à zona do paciente');

  // F3 — TLAC completo (4 passos + temporizador ~5s)
  await page.click('#btn-hud-tlac');
  await page.waitForSelector('#tlac:not([hidden])');
  zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'mesa', `câmera vai à zona mesa/TLAC (obtido: ${zona})`);
  for (let i = 0; i < 4; i++) await page.click('#tlac-passos button[data-passo]');
  await page.waitForSelector('#tlac-resultado:not([hidden])', { timeout: 10000 });
  const res = await page.textContent('#tlac-resultado');
  ok(/positivo/i.test(res), `resultado do TLAC exibido: ${res.trim().split('\n')[0].slice(0, 50)}`);
  ok((await page.textContent('#chat-log')).match(/resultado POSITIVO/i) !== null, '+20: resultado registrado no atendimento');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#tlac', { state: 'hidden' });

  // F4 — DSF pré-preenchida, chip de encaminhamento destacado, preview imprimível
  await page.click('#btn-hud-dsf');
  await page.waitForSelector('#dsf:not([hidden])');
  ok((await page.inputValue('#dsf-paciente')).includes('Carla'), 'DSF: paciente pré-preenchido');
  ok((await page.inputValue('#dsf-queixa')).includes('Sonrisal'), 'DSF: queixa/pedido pré-preenchido');
  ok((await page.locator('.dsf-chip-destaque').count()) >= 1, 'DSF: encaminhamento ao PS destacado (arbovirose)');
  await page.click('.dsf-chip-destaque'); // recusa + encaminhamento urgente
  await page.locator('#dsf-rapidas .dsf-chip:not(.dsf-chip-destaque)').nth(1).click(); // hidratação/orientações
  await page.click('#btn-dsf-emitir');
  await page.waitForSelector('#dsf-preview:not([hidden])');
  ok((await page.textContent('#dsf-doc-corpo')).includes('pronto-socorro'), 'DSF: preview do documento gerado');
  await page.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
  await page.click('#btn-dsf-imprimir');
  ok((await page.evaluate(() => window.__prints)) === 1, 'DSF: window.print acionado');
  ok((await page.textContent('#chat-log')).match(/DSF emitida/i) !== null, '+30: DSF registrada no atendimento');
  await page.keyboard.press('Escape');
  zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'paciente', 'fluxo encerra de volta ao paciente');
} finally {
  await browser.close();
}

if (falhas.length) {
  console.error(`\nSMOKE FALHOU — ${falhas.length} verificação(ões):`);
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('\nSMOKE F2/F3/F4: TODAS AS VERIFICAÇÕES OK');
