import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// QA de fluxo do relatório técnico de melhorias (relatorio_melhorias_farmacheck.docx):
// 1. pergunta livre sem loop e sem puxar antibiótico;
// 2. DSF com campo descritivo (avaliação clínica) salva no estado da partida;
// 3. item CRÍTICO — a DSF emitida pontua 30/30 no relatório final (bug da nota zerada);
// 4. reiniciar na tela final e no preview da DSF limpa rascunho e estado.
const output = resolve(process.env.QA_ARTIFACT_DIR || '.planning/2026-10-12-melhoria-integral/implementation/20261024_report_improvements');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
try {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.locator('#capa-iniciar').click();
  await page.locator('#btn-iniciar').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 90000 });
  console.log('game ready');
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
  await page.locator('#btn-iniciar').click();
  console.log('start requested');
  try {
    await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE', null, { timeout: 60000, polling: 100 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      state: window.__farmacheck?.game?.state,
      caseId: window.__farmacheck?.game?.case?.id,
      buttonDisabled: document.getElementById('btn-iniciar')?.disabled,
      ready: document.documentElement.dataset.jogoPronto,
      avatarEnter: String(window.__farmacheck?.game?.avatar?.enter),
      pageText: document.body.innerText.slice(-500),
    }));
    writeFileSync(resolve(output, 'encounter-boot-failure.json'), JSON.stringify({ debug, errors }, null, 2));
    throw error;
  }
  console.log('anamnesis ready');
  const initialCase = await page.evaluate(() => window.__farmacheck.game.case.id);
  const ask = async (question) => {
    const before = await page.evaluate(() => window.__farmacheck.game.history.length);
    await page.locator('#chat-input').fill(question);
    await page.locator('#btn-send').click();
    await page.waitForFunction((count) => {
      const history = window.__farmacheck?.game?.history || [];
      return history.length > count && history.at(-1)?.role === 'assistant';
    }, before, { timeout: 20000 });
    return page.evaluate(() => window.__farmacheck.game.history.at(-1).content);
  };

  // 1. pergunta livre fora do script
  const reply = await ask('Você já fez teste de influenza?');
  const workReply = await ask('Onde você trabalha?');
  const foodReply = await ask('Mudou a alimentação ou comeu algo estragado?');
  const symptomReply = await ask('Teve náusea ou diarreia?');
  const weightReply = await ask('Quanto você pesa?');
  const alarmReply = await ask('Teve sangramento?');

  // 2. DSF com campo descritivo
  await page.locator('#btn-hud-dsf').click();
  await page.locator('#dsf').waitFor({ state: 'visible' });
  const dsfRestartVisible = await page.locator('#btn-dsf-reiniciar').isVisible();
  const referralBlankAtOpen = await page.locator('#dsf-encaminhamento').inputValue() === '';
  const versionBeforeDsfRestart = await page.evaluate(() => window.__farmacheck.game.interactionVersion);
  await page.locator('#dsf-hipotese').fill('Quadro febril com suspeita de dengue a esclarecer.');
  await page.locator('#dsf-conduta').fill('Febre, mialgia e manchas no pescoço após dipirona. Recusei o Sonrisal por conter AAS; orientei hidratação e sinais de alarme e encaminhei para avaliação clínica.');
  await page.locator('#btn-dsf-reiniciar').click();
  await page.waitForFunction((version) => window.__farmacheck?.game?.state === 'ANAMNESE'
    && window.__farmacheck.game.interactionVersion > version
    && window.__farmacheck.game.dsf === null, versionBeforeDsfRestart, { timeout: 60000 });
  await page.locator('#btn-hud-dsf').click();
  await page.locator('#dsf').waitFor({ state: 'visible' });
  const dsfPanelRestartCleared = await page.locator('#dsf-hipotese').inputValue() === ''
    && await page.locator('#dsf-conduta').inputValue() === '';
  console.log(`DSF restart clears draft: ${dsfPanelRestartCleared}`);
  await page.locator('#dsf-hipotese').fill('Quadro febril com suspeita de dengue a esclarecer.');
  await page.locator('#dsf-conduta').fill('Febre, mialgia e manchas no pescoço após dipirona. Recusei o Sonrisal por conter AAS; orientei hidratação e sinais de alarme e encaminhei para avaliação clínica.');
  await page.locator('#dsf-encaminhamento').fill('UBS para avaliação clínica; urgência se surgirem sinais de alarme.');
  await page.locator('#btn-dsf-emitir').click();
  await page.locator('#dsf-preview').waitFor({ state: 'visible' });
  const previewRestartVisible = await page.locator('#btn-dsf-preview-reiniciar').isVisible();
  await page.screenshot({ path: resolve(output, 'dsf-preview.png'), animations: 'disabled' });
  const registered = await page.evaluate(() => ({
    dsf: window.__farmacheck.game.dsf,
    patient: document.getElementById('dsf-doc-corpo').textContent.includes('Geovana de Souza Troian (Mariana)'),
    hypothesisVisible: document.getElementById('dsf-doc-corpo').textContent.includes('Quadro febril com suspeita de dengue a esclarecer.'),
  }));
  await page.keyboard.press('Escape'); // fecha o preview da DSF
  await page.locator('#dsf-preview').waitFor({ state: 'hidden' });

  // 3. decide a conduta correta e confere a rubrica do relatório final
  await page.locator('#btn-decisao').click();
  await page.locator('#decision').waitFor({ state: 'visible' });
  await page.locator('#conduta-cards [data-conduta="encaminhar"]').click();
  await page.locator('#btn-confirmar').click();
  await page.waitForFunction(() => window.__farmacheck?.game?.state === 'DEBRIEFING', null, { timeout: 60000 });
  await page.locator('#debrief').waitFor({ state: 'visible' });
  const score = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#debrief-breakdown .scorebar')];
    const dsfRow = rows.find((row) => /dsf/i.test(row.textContent));
    return {
      total: document.getElementById('debrief-pontos').textContent.trim(),
      dsf: dsfRow ? dsfRow.textContent.replace(/\s+/g, ' ').trim() : null,
      details: document.getElementById('debrief-detalhes').textContent.replace(/\s+/g, ' ').trim().slice(0, 300),
    };
  });
  await page.screenshot({ path: resolve(output, 'debrief.png'), animations: 'disabled' });

  // 4. reiniciar pela tela final e conferir limpeza do rascunho
  await page.locator('#btn-repetir').click();
  console.log('practice restart requested');
  await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE'
    && window.__farmacheck.game.dsf === null, null, { timeout: 120000 });
  await page.locator('#btn-hud-dsf').click();
  const draftCleared = await page.locator('#dsf-hipotese').inputValue() === ''
    && await page.locator('#dsf-conduta').inputValue() === '';
  await page.locator('#btn-dsf-fechar').click();

  const result = {
    initialCase, reply, workReply, foodReply, symptomReply, weightReply, alarmReply, registered, score,
    dsfPanelRestartCleared, draftCleared, referralBlankAtOpen, errors,
    dsfRestartVisible, previewRestartVisible,
    pass: /resultado de exame/i.test(reply) && !/amoxicilina|antibiótico/i.test(reply)
      && /hospital|técnica/i.test(workReply) && /marmita|comida em casa/i.test(foodReply)
      && /náusea|diarreia/i.test(symptomReply)
      && /62 quilos/i.test(weightReply) && /não consigo confirmar/i.test(alarmReply)
      && Boolean(registered.dsf) && registered.patient && registered.hypothesisVisible && dsfPanelRestartCleared && draftCleared
      && referralBlankAtOpen
      && /\+?30/.test(score.dsf || '') && dsfRestartVisible && previewRestartVisible
      && errors.length === 0,
  };
  writeFileSync(resolve(output, 'encounter-qa.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  await browser.close();
}
