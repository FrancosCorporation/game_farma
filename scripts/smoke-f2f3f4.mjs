// Smoke F2/F3/F4 — navegação por pontos de interesse, TLAC completo na Carla e DSF emitida.
// Uso: node scripts/smoke-f2f3f4.mjs  (requer o jogo servido — `npm run preview` na 4173 ou SMOKE_URL)
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:4173/';
const SKIP_INITIAL_ARRIVAL = process.env.SMOKE_SKIP_ARRIVAL === '1';
const SMOKE_LANG = process.env.SMOKE_LANG || 'pt';
if (!['pt', 'en'].includes(SMOKE_LANG)) throw new Error('SMOKE_LANG precisa ser pt ou en');
const SMOKE_WIDTH = Number(process.env.SMOKE_WIDTH || 1280);
const SMOKE_HEIGHT = Number(process.env.SMOKE_HEIGHT || 800);
if (!Number.isInteger(SMOKE_WIDTH) || SMOKE_WIDTH < 320 || SMOKE_WIDTH > 4096) {
  throw new Error('SMOKE_WIDTH precisa ser um inteiro entre 320 e 4096');
}
if (!Number.isInteger(SMOKE_HEIGHT) || SMOKE_HEIGHT < 480 || SMOKE_HEIGHT > 4096) {
  throw new Error('SMOKE_HEIGHT precisa ser um inteiro entre 480 e 4096');
}
const falhas = [];
const ok = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) falhas.push(msg);
};

async function stubAvatarArrival(page) {
  await page.evaluate(() => {
    const { game } = window.__farmacheck;
    const skipCosmeticArrival = (model) => {
      if (model && typeof model.enter === 'function') model.enter = async () => {};
      return model;
    };
    let current = skipCosmeticArrival(game.avatar);
    Object.defineProperty(game, 'avatar', {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (model) => { current = skipCosmeticArrival(model); },
    });
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SMOKE_WIDTH, height: SMOKE_HEIGHT } });
page.on('pageerror', (e) => falhas.push('pageerror: ' + e.message));

try {
  await page.addInitScript((lang) => localStorage.setItem('farmacheck:lang', lang), SMOKE_LANG);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction((lang) => document.documentElement.lang === (lang === 'en' ? 'en' : 'pt-BR'), SMOKE_LANG);
  ok(true, `idioma ${SMOKE_LANG} aplicado em ${SMOKE_WIDTH}×${SMOKE_HEIGHT}`);

  // F0 intacta: capa → menu
  await page.click('#capa-iniciar');
  await page.waitForSelector('#menu:not([hidden])');
  ok(true, 'F0 intacta — capa abre o menu');

  await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1'
    && document.getElementById('btn-iniciar')?.disabled === false, null, { timeout: 90000, polling: 100 });
  if (SKIP_INITIAL_ARRIVAL) {
    await stubAvatarArrival(page);
    ok(true, 'walk-in omitido neste smoke; cobertura real pertence ao qa:boot');
  }
  await page.click('#btn-iniciar');
  await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE', null, {
    timeout: 180000,
    polling: 200,
  });
  await page.waitForSelector('#acoes:not([hidden])', { timeout: 15000 });
  ok(true, 'atendimento iniciado — barra de ações (HUD) visível');

  // Força o caso da Carla (arbovirose) via hook de QA
  if (!SKIP_INITIAL_ARRIVAL) await stubAvatarArrival(page);
  await page.evaluate(() => {
    const { game } = window.__farmacheck;
    window.__smokeCaseError = null;
    window.__smokeCasePromise = game.startCase(game.cases.find((c) => c.id === 'carla_dengue'))
      .catch((error) => { window.__smokeCaseError = error.message; });
  });
  await page.waitForFunction(
    () => window.__smokeCaseError
      || (window.__farmacheck.game.state === 'ANAMNESE'
        && document.getElementById('acoes').hidden === false
        && window.__farmacheck.game.case?.id === 'carla_dengue'),
    null, { timeout: 30000, polling: 100 },
  );
  const caseError = await page.evaluate(() => window.__smokeCaseError);
  if (caseError) throw new Error(`falha ao trocar fixture para Carla: ${caseError}`);
  ok(true, 'caso Carla (dengue) carregado');
  await page.fill('#chat-input', 'Teve vômitos persistentes?');
  await page.locator('#chat-form').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => window.__farmacheck.game.knowledge.revealed.has('vomitos_persistentes_neg')
    && !window.__farmacheck.game.busy, null, { timeout: 30000 });

  // F2 — botão "Consultar Computador" → zona computador + bulário
  await page.click('#btn-hud-pc');
  await page.waitForSelector('#bulario:not([hidden])');
  let zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'computador', `câmera vai à zona computador (obtido: ${zona})`);
  ok((await page.textContent('#bulario-corpo')).includes('Sonrisal'), 'bulário exibe o pedido/alerta de contraindicação');
  ok((await page.evaluate(() => window.__farmacheck.game.consultaBulario)) === true, '+10: consulta ao bulário registrada');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#bulario', { state: 'hidden' });
  zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'paciente', 'Escape volta à zona do paciente');

  // F3 — TLAC completo (4 passos + temporizador ~5s)
  if (process.env.SMOKE_RESULT_OVERRIDE) {
    await page.evaluate((result) => { window.__farmacheck.game.case.testeRapido.resultado = result; }, process.env.SMOKE_RESULT_OVERRIDE);
  }
  await page.click('#btn-hud-tlac');
  await page.waitForSelector('#tlac:not([hidden])');
  zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'mesa', `câmera vai à zona mesa/TLAC (obtido: ${zona})`);
  for (let i = 0; i < 4; i++) await page.click('#tlac-passos button[data-passo]');
  await page.waitForSelector('#tlac-resultado:not([hidden])', { timeout: 10000 });
  const res = await page.textContent('#tlac-resultado');
  const expectedResult = await page.evaluate(() => window.__farmacheck.game.case.testeRapido.resultado);
  ok(expectedResult == null
    ? /teste rápido realizado|rapid test performed/i.test(res) && !/positivo|negativo|inconclusivo/i.test(res)
    : res.toLowerCase().includes(String(expectedResult).toLowerCase()),
    `estado do teste exibido após execução: ${res.trim().split('\n')[0].slice(0, 50)}`);
  const testRecorded = await page.evaluate(() => {
    const test = window.__farmacheck.game.testeRapido;
    return Boolean(test?.executado && test.resultado === window.__farmacheck.game.case.testeRapido.resultado);
  });
  ok(testRecorded, '+20: teste executado e registrado no atendimento');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#tlac', { state: 'hidden' });

  // F4 — DSF pré-preenchida, chip de encaminhamento destacado, salva no jogo
  await page.click('#btn-hud-dsf');
  await page.waitForSelector('#dsf:not([hidden])');
  ok((await page.inputValue('#dsf-paciente')).trim().length > 0, 'DSF: paciente pré-preenchido');
  ok((await page.inputValue('#dsf-queixa')).trim().length > 0, 'DSF: queixa/pedido pré-preenchido');
  ok((await page.locator('.dsf-chip-destaque').count()) >= 1, 'DSF: encaminhamento ao PS destacado (arbovirose)');
  await page.click('.dsf-chip-destaque'); // recusa + encaminhamento urgente
  await page.locator('#dsf-rapidas .dsf-chip:not(.dsf-chip-destaque)').nth(1).click(); // hidratação/orientações
  await page.click('#btn-dsf-emitir');
  await page.waitForSelector('#dsf-preview:not([hidden])');
  ok((await page.textContent('#dsf-doc-corpo')).trim().length > 0, 'DSF: preview do documento gerado');
  await page.click('#btn-dsf-salvar');
  ok(await page.evaluate(() => {
    const entries = JSON.parse(localStorage.getItem('farmacheck:dsf:v1') || '[]');
    return entries.length === 1 && entries[0].caseId === window.__farmacheck.game.case.id;
  }), 'DSF: salva dentro do jogo');
  ok((await page.evaluate(() => Boolean(window.__farmacheck.game.dsf))), 'DSF registrada no atendimento');
  await page.keyboard.press('Escape');
  zona = await page.evaluate(() => window.__farmacheck.pov.zonaAtual());
  ok(zona === 'paciente', 'fluxo encerra de volta ao paciente');
  await page.click('#btn-decisao');
  await page.waitForSelector('#decision:not([hidden])');
  const warningOption = page.locator('#redflag-list label[data-tag="vomitos_persistentes_neg"]');
  const warningLabel = await warningOption.textContent();
  ok(!/negad|denied|ruled out/i.test(warningLabel), 'opção de sinal de alarme não antecipa a resposta');
  await warningOption.locator('input').check(); // escolha deliberadamente incorreta para validar o feedback final
  await page.click('#conduta-cards [data-conduta="encaminhar"]');
  await page.click('#btn-confirmar');
  await page.waitForSelector('#debrief:not([hidden])');
  const dsfPoints = await page.locator('#debrief-breakdown .scorebar')
    .filter({ hasText: /DSF|statement/i }).locator('span').last().textContent();
  ok(dsfPoints?.trim() === '+10', `DSF emitida com decisão correta pontua parcialmente: ${dsfPoints}`);
  ok(/vômitos persistentes: negados|persistent vomiting: denied/i.test(await page.textContent('#debrief-detalhes')),
    'relatório final explica a marcação incorreta');
} finally {
  await browser.close();
}

if (falhas.length) {
  console.error(`\nSMOKE FALHOU — ${falhas.length} verificação(ões):`);
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('\nSMOKE F2/F3/F4: TODAS AS VERIFICAÇÕES OK');
