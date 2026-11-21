import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = resolve(new URL('..', import.meta.url).pathname);
const evidencePath = resolve(process.env.QA_EVIDENCE_PATH
  || '.planning/2026-10-12-melhoria-integral/implementation/20261018_fc026_review/fc026_accessibility_panels_qa.json');
const evidenceFiles = [
  'scripts/qa_accessibility_panels.mjs',
  'package.json',
  'package-lock.json',
  'src/styles.css',
  'src/ui/tlac.js',
  'src/ui/dsf.js',
  'src/ui/i18n.js',
  'src/ui/focus.js',
  'src/ui/decisionPanel.js',
  'src/ui/decisionFlags.js',
  'src/ui/tlacResult.js',
  'src/audio/sfx.js',
];
const sha256 = async (path) => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const sourceManifest = await Promise.all(evidenceFiles.map(async (path) => ({ path, sha256: await sha256(path) })));
const startedAt = new Date();
const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];
const languages = ['pt', 'en'];
const scenarios = viewports.flatMap((viewport) => languages.map((language) => ({
  viewport: `${viewport.width}x${viewport.height}`,
  language,
  status: 'not_run',
  result: 'NOT_RUN',
  progress: { current: 'not started', completed: [] },
})));
let status = 'running';
let failure = null;
const probe = createServer();
await new Promise((ok, fail) => {
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', ok);
});
const port = probe.address().port;
await new Promise((ok, fail) => probe.close((error) => error ? fail(error) : ok()));
const base = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
vite.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
let browser;

const fixture = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="/src/styles.css"></head>
<body class="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-body"><main id="ui">
  <button id="btn-hud-tlac" type="button">Abrir teste rápido</button>
  <button id="btn-hud-dsf" type="button">Abrir declaração</button>
  <button id="btn-hud-decision" type="button">Abrir decisão</button>
  <section id="other-surface"><button type="button">Outro controle</button></section>
  <label for="chat-input">Pergunta ao paciente</label><input id="chat-input" aria-label="Pergunta ao paciente">
  <div id="chat-chips"><button type="button">Pergunta rápida</button></div>
  <button id="btn-decisao" type="button">Encerrar anamnese</button>
  <section id="decision" hidden role="region" aria-labelledby="decision-titulo" class="absolute left-0 top-10 bottom-0 w-full sm:w-[380px] flex flex-col overflow-y-auto bg-slate-900 text-slate-100">
    <header class="flex items-center justify-between p-4"><h2 id="decision-titulo" tabindex="-1" data-i18n="decision.title">Decisão clínica</h2><button id="btn-voltar" type="button" data-i18n="decision.voltar">Voltar à anamnese</button></header>
    <p class="px-4 text-slate-300" data-i18n="decision.keys">1 / 2 / 3 escolhem a conduta · Esc volta à anamnese</p>
    <fieldset class="m-4"><legend data-i18n="decision.redflags">Sinais de alerta investigados</legend><div id="redflag-list"></div></fieldset>
    <fieldset id="conduta-cards" class="m-4"><legend data-i18n="decision.condutaLegend">Conduta</legend>
      <button type="button" data-conduta="vender" aria-pressed="true"><span data-i18n="decision.vender.t">Vender o pedido</span></button>
      <button type="button" data-conduta="sugerir" aria-pressed="true"><span data-i18n="decision.sugerir.t">Sugerir outro MIP</span></button>
      <button type="button" data-conduta="encaminhar" aria-pressed="true"><span data-i18n="decision.encaminhar.t">Encaminhar à urgência</span></button>
    </fieldset>
    <section id="mip-box" hidden><div>MIPs</div><div id="mip-list"></div><div id="orient-list"></div></section>
    <button id="btn-confirmar" type="button" disabled>Confirmar conduta</button>
  </section>
  <div id="tlac" hidden class="absolute inset-0 grid place-items-center bg-slate-950/80 backdrop-blur pointer-events-auto overflow-y-auto">
    <div id="tlac-card" class="tlac-card pop-in" role="dialog" aria-modal="true" aria-labelledby="tlac-titulo">
      <header class="refs-header"><h2 id="tlac-titulo" class="refs-title">Teste rápido</h2><button id="btn-tlac-fechar" type="button">Fechar</button></header>
      <p id="tlac-tipo"></p><ol id="tlac-passos"></ol>
      <p id="tlac-scene-status" class="tlac-scene-status" role="status" aria-live="polite" hidden></p>
      <div id="tlac-timer" hidden role="timer" aria-live="off"><i id="tlac-timer-fill"></i><span id="tlac-timer-num">5s</span></div>
      <div id="tlac-resultado" hidden aria-live="polite"></div>
    </div>
  </div>
  <section id="dsf" hidden role="region" aria-labelledby="dsf-titulo">
    <h2 id="dsf-titulo" tabindex="-1">Declaração</h2><button id="btn-dsf-fechar" type="button">Fechar</button>
    <label>Paciente<input id="dsf-paciente" readonly></label><label>Data<input id="dsf-data" type="date"></label>
    <label>Queixa<input id="dsf-queixa" readonly></label><div id="dsf-rapidas"></div>
    <label>Conduta<textarea id="dsf-conduta" aria-label="Conduta farmacêutica"></textarea></label>
    <div id="dsf-orient"></div><label>Encaminhamento<input id="dsf-encaminhamento"></label>
    <button id="btn-dsf-emitir" type="button">Emitir DSF</button>
  </section>
  <div id="dsf-preview" hidden role="dialog" aria-modal="true" aria-labelledby="dsf-doc-title">
    <article class="dsf-doc mx-auto max-w-2xl my-8 p-8 rounded-2xl bg-slate-100 text-slate-900 shadow-2xl"><header class="dsf-head"><h3 id="dsf-doc-title">Declaração de serviços farmacêuticos</h3><p class="dsf-sub">Documento educacional</p></header>
      <div id="dsf-doc-corpo"></div><footer class="dsf-foot"><div class="dsf-assinatura"></div><p id="dsf-doc-stamp"></p></footer>
      <div class="no-print"><button id="btn-dsf-imprimir" type="button">Imprimir</button><button id="btn-dsf-voltar" type="button">Editar</button></div>
    </article>
  </div>
</main></body></html>`;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${stderr}`);
    try {
      const response = await fetch(`${base}/`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is starting */ }
    await wait(50);
  }
  assert.equal(ready, true, 'Vite starts for the isolated panel fixture');
  browser = await chromium.launch({
    headless: true,
    // This isolated DOM fixture stubs the Three.js bootstrap, so SwiftShader
    // adds CPU load without covering any WebGL behavior under test.
    args: process.env.QA_DISABLE_GPU === '1' ? ['--disable-gpu'] : [],
  });

  for (const viewport of viewports) {
    for (const lang of languages) {
      const scenario = scenarios.find((item) => item.viewport === `${viewport.width}x${viewport.height}` && item.language === lang);
      scenario.status = 'running';
      scenario.result = 'RUNNING';
      scenario.startedAt = new Date().toISOString();
      const scenarioStarted = Date.now();
      let context;
      let scenarioError;
      const markProgress = (phase) => { scenario.progress.current = phase; };
      const completeProgress = (phase) => {
        scenario.progress.current = phase;
        scenario.progress.completed.push(phase);
      };
      try {
      markProgress('create browser context and page');
      context = await browser.newContext({ viewport });
      await context.addInitScript(() => localStorage.setItem('farmacheck:sfx-volume', '0'));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      // This fixture tests isolated panels, not the Three.js app bootstrap.
      await page.route('**/src/main.js', (route) => route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: '',
      }));
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.setContent(fixture);
      await page.waitForFunction(() => [...document.styleSheets]
        .some((sheet) => sheet.href?.includes('/src/styles.css') && sheet.cssRules.length > 0));
      await page.evaluate(async (language) => {
        const [{ initTlac }, { initDsf }, { setLang, applyI18n, t }, { showAnamnesisPanel, showDecisionPanel }, { renderDecisionFlags }] = await Promise.all([
          import('/src/ui/tlac.js'), import('/src/ui/dsf.js'), import('/src/ui/i18n.js'),
          import('/src/ui/decisionPanel.js'), import('/src/ui/decisionFlags.js'),
        ]);
        const game = {
          case: {
            id: 'accessibility-fixture',
            persona: { nome: 'Pessoa de teste', idade: 30 },
            pedido: 'Queixa de teste',
            testeRapido: { indicado: true, tipo: 'Antigen', resultado: 'negativo' },
            orientacoes: [{ nome: 'Orientação de teste' }],
            dsf: { encaminhamento: 'Retorno se piorar' },
          },
          registrarTesteRapido() { window.__rapidTestRegistrations += 1; },
          registrarDSF() {},
        };
        window.__qaGame = game;
        window.__rapidTestRegistrations = 0;
        window.__tlac = initTlac({ game });
        window.__dsf = initDsf({ game });
        const chatInput = document.getElementById('chat-input');
        const chatChips = document.getElementById('chat-chips');
        const decisionButton = document.getElementById('btn-decisao');
        const decisionPanel = document.getElementById('decision');
        const decisionFacts = [
          { tag: 'alergia', rotulo: language === 'en' ? 'Confirmed allergy' : 'Alergia confirmada', valor: false, redFlag: true },
          { tag: 'oculto', rotulo: language === 'en' ? 'Hidden finding' : 'Achado ainda oculto', valor: true, redFlag: true },
        ];
        window.__decisionView = {
          abrir() {
            showDecisionPanel({
              chatInput, chatChips, decisionButton,
              redFlagList: document.getElementById('redflag-list'),
              mipBox: document.getElementById('mip-box'),
              confirmButton: document.getElementById('btn-confirmar'),
              panel: decisionPanel,
              facts: decisionFacts,
              revealed: new Set(['alergia']),
              renderFlags: renderDecisionFlags,
              translate: t,
            });
          },
          voltar() {
            showAnamnesisPanel({
              panel: decisionPanel, chatInput, decisionButton,
              renderChips() {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.textContent = language === 'en' ? 'Ask the patient' : 'Perguntar ao paciente';
                chatChips.replaceChildren(chip);
              },
            });
          },
        };
        document.getElementById('btn-hud-tlac').addEventListener('click', () => window.__tlac.abrir());
        document.getElementById('btn-hud-dsf').addEventListener('click', () => window.__dsf.abrir());
        document.getElementById('btn-hud-decision').addEventListener('click', () => window.__decisionView.abrir());
        document.getElementById('btn-voltar').addEventListener('click', () => window.__decisionView.voltar());
        setLang(language);
        applyI18n(document);
      }, lang);
      completeProgress('fixture, styles, and panel modules initialized');

      markProgress('TLAC focus, keyboard boundary, inert state, and axe checks');
      const tlacOpener = page.locator('#btn-hud-tlac');
      await tlacOpener.focus();
      await page.keyboard.press('Enter');
      const tlac = page.locator('#tlac');
      assert.equal(await tlac.isVisible(), true);
      assert.equal(await tlacOpener.evaluate((el) => el.inert), true, 'modal makes background controls inert');
      assert.equal(await page.evaluate(() => document.activeElement.matches('#tlac [data-passo="0"]')), true, 'TLAC moves focus to its first action');
      let axe = await new AxeBuilder({ page }).include('#tlac').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map((v) => v.id), [], `TLAC axe violations: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })))}`);
      await page.locator('#btn-tlac-fechar').focus();
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.matches('#tlac [data-passo="0"]')), true, 'Shift+Tab wraps inside TLAC');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-tlac-fechar', 'Tab wraps inside TLAC');
      await page.locator('#btn-tlac-fechar').click();
      assert.equal(await tlac.isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-hud-tlac', 'TLAC returns focus to its opener');
      assert.equal(await tlacOpener.evaluate((el) => el.inert), false, 'closing TLAC restores the background');

      await page.evaluate(() => { window.__qaGame.case.testeRapido = { indicado: false }; });
      await tlacOpener.focus();
      await page.keyboard.press('Enter');
      const noIndication = await page.evaluate(() => ({
        message: document.getElementById('tlac-resultado').textContent,
        live: document.getElementById('tlac-resultado').getAttribute('aria-live'),
        resultVisible: !document.getElementById('tlac-resultado').hidden,
        timerVisible: !document.getElementById('tlac-timer').hidden,
        stepCount: document.querySelectorAll('#tlac-passos [data-passo]').length,
        registrations: window.__rapidTestRegistrations,
      }));
      assert.equal(noIndication.resultVisible, true, 'non-indicated TLAC explains the state');
      assert.match(noIndication.message, lang === 'en' ? /No rapid test indicated/ : /Sem indicação de teste rápido/);
      assert.equal(noIndication.live, 'polite', 'non-indication message is announced to assistive technology');
      assert.equal(noIndication.timerVisible, false, 'non-indicated case does not start the timer');
      assert.equal(noIndication.stepCount, 0, 'non-indicated case has no executable steps');
      assert.equal(noIndication.registrations, 0, 'non-indicated case never registers a result');
      await page.locator('#btn-tlac-fechar').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-hud-tlac', 'non-indication branch returns focus');
      completeProgress('TLAC focus, keyboard boundary, inert state, and non-indication checks');

      markProgress('DSF editor and preview focus, keyboard, and axe checks');
      const dsfOpener = page.locator('#btn-hud-dsf');
      await dsfOpener.focus();
      await page.keyboard.press('Enter');
      const dsf = page.locator('#dsf');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'dsf-conduta', 'DSF moves focus to its editable field');
      assert.equal(await dsfOpener.evaluate((el) => el.inert), false, 'DSF editor is a non-modal region');
      axe = await new AxeBuilder({ page }).include('#dsf').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map((v) => v.id), [], `DSF editor axe violations: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })))}`);
      await page.locator('#dsf-conduta').fill('Conduta educacional registrada.');
      await page.locator('#btn-dsf-emitir').click();
      const preview = page.locator('#dsf-preview');
      assert.equal(await preview.getAttribute('role'), 'dialog');
      assert.equal(await preview.getAttribute('aria-modal'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-dsf-imprimir', 'DSF preview moves focus to its first action');
      assert.equal(await dsfOpener.evaluate((el) => el.inert), true, 'DSF preview makes background controls inert');
      axe = await new AxeBuilder({ page }).include('#dsf-preview').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map((v) => v.id), [], `DSF preview axe violations: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })))}`);
      await page.locator('#btn-dsf-voltar').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-dsf-imprimir', 'Tab wraps inside the DSF preview');
      await page.locator('#btn-dsf-voltar').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'dsf-conduta', 'editing returns focus to the conduct field');
      assert.equal(await dsfOpener.evaluate((el) => el.inert), false, 'editing restores the background');
      await page.locator('#btn-dsf-fechar').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-hud-dsf', 'DSF returns focus to its opener');
      completeProgress('DSF editor and preview focus, keyboard, and axe checks');

      markProgress('DSF Escape and focus restoration checks');
      await page.keyboard.press('Enter');
      await page.locator('#dsf-conduta').fill('Conduta educacional registrada.');
      await page.locator('#btn-dsf-emitir').click();
      await page.keyboard.press('Escape');
      assert.equal(await preview.isVisible(), false, 'Escape closes the DSF preview');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-hud-dsf', 'Escape restores focus to the DSF opener');
      completeProgress('DSF Escape and focus restoration checks');

      markProgress('decision panel focus, hidden-fact boundary, keyboard, and axe checks');
      const decisionOpener = page.locator('#btn-hud-decision');
      await decisionOpener.focus();
      await page.keyboard.press('Enter');
      const decision = page.locator('#decision');
      assert.equal(await decision.isVisible(), true, 'decision panel opens');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'decision-titulo', 'decision moves focus to its heading');
      assert.equal(await page.locator('#chat-input').isDisabled(), true, 'decision disables chat while open');
      assert.equal(await page.locator('#chat-chips button').count(), 0, 'decision clears question chips');
      assert.equal(await page.locator('#btn-decisao').isHidden(), true, 'decision hides the transition button');
      assert.deepEqual(await page.locator('#conduta-cards [data-conduta]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed'))), ['false', 'false', 'false'], 'decision resets pressed state');
      assert.equal(await page.locator('#btn-confirmar').isDisabled(), true, 'decision requires a new valid choice');
      const flagText = await page.locator('#redflag-list').innerText();
      assert.match(flagText, lang === 'en' ? /confirmed allergy/i : /alergia confirmada/i, 'decision shows the investigated alert');
      assert.doesNotMatch(flagText, lang === 'en' ? /hidden finding/i : /achado ainda oculto/i, 'decision does not disclose an unrevealed fact');
      axe = await new AxeBuilder({ page }).include('#decision').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map((v) => v.id), [], `decision axe violations: ${JSON.stringify(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })))}`);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-voltar', 'Tab moves from the heading to the return action');
      await page.keyboard.press('Enter');
      assert.equal(await decision.isVisible(), false, 'keyboard return closes the decision panel');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-input', 'return restores focus to chat');
      assert.equal(await page.locator('#chat-input').isDisabled(), false, 'return enables chat');
      assert.equal(await page.locator('#btn-decisao').isVisible(), true, 'return restores the decision button');
      assert.equal(await page.locator('#chat-chips button').count(), 1, 'return restores question chips');
      completeProgress('decision panel focus, hidden-fact boundary, keyboard, and axe checks');

      markProgress('uncaught page and console error check');
      assert.deepEqual(errors, [], `no uncaught browser errors: ${errors.join(' | ')}`);
      completeProgress('uncaught page and console error check');
      await context.close();
      context = null;
      scenario.status = 'passed';
      scenario.result = 'PASS';
      scenario.checks = [
        'TLAC focus and keyboard boundary',
        'DSF editor and preview focus/keyboard',
        'decision panel focus and hidden-fact boundary',
        'axe WCAG 2.1 A/AA',
        'zero uncaught page/console errors',
      ];
      scenario.durationMs = Date.now() - scenarioStarted;
      scenario.finishedAt = new Date().toISOString();
      console.log(`PASS ${viewport.width}x${viewport.height} ${lang}: TLAC/DSF/decision focus, boundary and axe`);
      } catch (error) {
        scenarioError = error;
        scenario.status = 'failed';
        scenario.result = 'FAIL';
        scenario.error = {
          name: error?.name || 'Error',
          message: String(error?.message || error),
          phase: scenario.progress.current,
        };
        scenario.durationMs = Date.now() - scenarioStarted;
        scenario.finishedAt = new Date().toISOString();
        throw error;
      } finally {
        if (context) {
          try {
            await context.close();
          } catch (error) {
            scenario.cleanupError = {
              name: error?.name || 'Error',
              message: String(error?.message || error),
            };
            if (!scenarioError) {
              scenario.status = 'failed';
              scenario.result = 'FAIL';
              scenario.error = {
                ...scenario.cleanupError,
                phase: 'close browser context',
              };
              throw error;
            }
          }
        }
        scenario.durationMs = Date.now() - scenarioStarted;
        scenario.finishedAt ||= new Date().toISOString();
      }
    }
  }
  status = 'passed';
} catch (error) {
  status = 'failed';
  failure = { name: error?.name || 'Error', message: String(error?.message || error) };
  throw error;
} finally {
  for (const scenario of scenarios) {
    if (scenario.status === 'not_run' && failure) {
      scenario.reason = 'Not run because the QA suite stopped after an earlier failure.';
    }
  }
  try {
    await browser?.close();
  } catch (error) {
    status = 'failed';
    failure ||= { name: error?.name || 'Error', message: `Chromium close: ${error?.message || error}` };
  }
  try {
    if (vite.exitCode === null) vite.kill('SIGTERM');
    if (vite.exitCode === null) await new Promise((ok) => vite.once('close', ok));
  } catch (error) {
    status = 'failed';
    failure ||= { name: error?.name || 'Error', message: `Vite cleanup: ${error?.message || error}` };
  }
  const evidence = {
    id: 'FC-026',
    title: 'Accessibility browser QA for TLAC, DSF, and decision panels',
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    command: process.env.QA_DISABLE_GPU === '1'
      ? 'QA_DISABLE_GPU=1 npm run qa:accessibility:panels'
      : 'npm run qa:accessibility:panels',
    gpuDisabled: process.env.QA_DISABLE_GPU === '1',
    fixture: 'Isolated UI fixture; Three.js bootstrap is intercepted and WebGL is outside this QA scope.',
    scenarios,
    sourceManifest,
    failure,
  };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify({ ...evidence, evidencePath: relative(root, evidencePath) }, null, 2)}\n`);
  console.log(`Evidence: ${relative(root, evidencePath)} (${status})`);
}
