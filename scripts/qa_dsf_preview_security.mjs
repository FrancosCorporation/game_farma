// Exercise the real DSF module in Chromium with markup supplied through every
// free-text field. The expected result is literal text and zero created elements.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const portProbe = createServer();
await new Promise((ok, fail) => {
  portProbe.once('error', fail);
  portProbe.listen(0, '127.0.0.1', ok);
});
const port = portProbe.address().port;
await new Promise((ok, fail) => portProbe.close((error) => error ? fail(error) : ok()));

const vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
vite.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* server is still starting */ }
    await wait(50);
  }
  assert.equal(ready, true, 'Vite starts for the isolated browser fixture');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('farmacheck:sfx-volume', '0'));
  await page.route('**/src/main.js', (route) => route.abort());
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.setContent(`<!doctype html><html lang="pt-BR"><head>
    <link rel="stylesheet" href="/src/styles.css">
  </head><body><main id="ui">
    <section id="menu">Other interface surface</section>
    <section id="dsf" hidden><input id="dsf-paciente"><input id="dsf-data" type="date">
      <input id="dsf-queixa"><div id="dsf-rapidas"></div><textarea id="dsf-conduta"></textarea>
      <div id="dsf-orient"></div><input id="dsf-encaminhamento">
      <button id="btn-dsf-emitir"></button><button id="btn-dsf-fechar"></button></section>
    <section id="dsf-preview" hidden><article class="dsf-doc">
      <header class="dsf-head"><h3 data-i18n="dsf.doc.title"></h3><p class="dsf-sub" data-i18n="dsf.doc.sub"></p></header>
      <div id="dsf-doc-corpo"></div><footer class="dsf-foot"><div class="dsf-assinatura"></div>
      <p id="dsf-doc-stamp" class="dsf-stamp"></p></footer>
      <div class="no-print"><p id="dsf-print-error" hidden role="status" aria-live="polite" data-i18n="dsf.print.error"></p>
      <button id="btn-dsf-imprimir" data-i18n="dsf.imprimir"></button>
      <button id="btn-dsf-voltar" data-i18n="dsf.voltar"></button></div>
    </article></section>
  </main></body></html>`);
  await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes('/src/styles.css')));

  const result = await page.evaluate(async () => {
    const { initDsf } = await import('/src/ui/dsf.js');
    const { setLang, applyI18n } = await import('/src/ui/i18n.js');
    const payload = '<img id="dsf-injected" src="/not-found" onerror="window.__dsfExecuted=(window.__dsfExecuted||0)+1">';
    const game = {
      case: {
        id: 'security-fixture',
        persona: { nome: payload, idade: 42 },
        pedido: payload,
        orientacoes: [{ nome: payload }],
        dsf: { encaminhamento: payload },
      },
      registrarDSF() {},
    };
    const controller = initDsf({ game });
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
    setLang('pt');
    applyI18n(document);
    controller.abrir();
    document.getElementById('dsf-conduta').value = payload;
    document.getElementById('dsf-conduta').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('dsf-encaminhamento').value = payload;
    document.querySelector('#dsf-orient input').checked = true;
    document.getElementById('btn-dsf-emitir').click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const body = document.getElementById('dsf-doc-corpo');
    const portuguese = {
      executed: window.__dsfExecuted || 0,
      injectedElements: body.querySelectorAll('img,svg,script').length,
      textContainsPayload: body.textContent.includes(payload),
      paragraphCount: body.querySelectorAll('p.dsf-linha').length,
      title: document.querySelector('#dsf-preview h3').textContent,
      stamp: document.getElementById('dsf-doc-stamp').textContent,
    };
    document.getElementById('btn-dsf-imprimir').click();
    const printCallsPt = window.__printCalls;
    window.print = () => { throw new Error('blocked-print-dialog'); };
    document.getElementById('btn-dsf-imprimir').click();
    const printFailurePt = {
      visible: !document.getElementById('dsf-print-error').hidden,
      text: document.getElementById('dsf-print-error').textContent,
      previewVisible: !document.getElementById('dsf-preview').hidden,
    };
    window.print = () => { window.__printCalls += 1; };
    document.getElementById('btn-dsf-imprimir').click();
    const printRecoveryPt = {
      hidden: document.getElementById('dsf-print-error').hidden,
      printCalls: window.__printCalls,
    };

    setLang('en');
    applyI18n(document);
    controller.abrir();
    document.getElementById('dsf-conduta').value = 'Counsel the patient and document the plan.';
    document.getElementById('dsf-conduta').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('dsf-encaminhamento').value = 'Return if symptoms worsen.';
    document.querySelector('#dsf-orient input').checked = true;
    document.getElementById('btn-dsf-emitir').click();
    document.getElementById('btn-dsf-imprimir').click();
    window.print = undefined;
    document.getElementById('btn-dsf-imprimir').click();
    const printFailureEn = {
      visible: !document.getElementById('dsf-print-error').hidden,
      text: document.getElementById('dsf-print-error').textContent,
    };
    window.print = () => { window.__printCalls += 1; };
    document.getElementById('btn-dsf-imprimir').click();
    const english = {
      title: document.querySelector('#dsf-preview h3').textContent,
      stamp: document.getElementById('dsf-doc-stamp').textContent,
      body: document.getElementById('dsf-doc-corpo').textContent,
      printCalls: window.__printCalls,
      printErrorHiddenAfterRetry: document.getElementById('dsf-print-error').hidden,
    };

    await new Promise((resolve) => {
      const link = document.querySelector('link[rel="stylesheet"]');
      if (link.sheet) resolve();
      else link.addEventListener('load', resolve, { once: true });
    });
    window.__testPrintStyles = true;
    return { portuguese, english, printCallsPt, printFailurePt, printRecoveryPt, printFailureEn };
  });

  assert.equal(result.portuguese.executed, 0, 'event handler payload did not execute');
  assert.equal(result.portuguese.injectedElements, 0, 'untrusted fields created no HTML elements');
  assert.equal(result.portuguese.textContainsPayload, true, 'the statement retains literal input text');
  assert.equal(result.portuguese.paragraphCount, 6, 'patient/date/complaint/conduct/guidance/referral are rendered');
  assert.match(result.portuguese.title, /DECLARAÇÃO/);
  assert.match(result.portuguese.stamp, /conteúdo 100% fictício/);
  assert.equal(result.printCallsPt, 1, 'Portuguese print action invokes window.print once');
  assert.equal(result.printFailurePt.visible, true, 'a thrown print failure is announced in the preview');
  assert.match(result.printFailurePt.text, /impressão neste navegador/i, 'Portuguese failure guidance is visible');
  assert.equal(result.printFailurePt.previewVisible, true, 'preview remains available after a print failure');
  assert.deepEqual(result.printRecoveryPt, { hidden: true, printCalls: 2 }, 'retry clears the error and invokes print');
  assert.match(result.english.title, /PHARMACEUTICAL SERVICES STATEMENT/);
  assert.match(result.english.stamp, /100% fictional and educational/);
  assert.match(result.english.body, /Pharmaceutical conduct/);
  assert.match(result.english.body, /Return if symptoms worsen/);
  assert.equal(result.printFailureEn.visible, true, 'a missing print API is announced');
  assert.match(result.printFailureEn.text, /Printing isn't available/i, 'English failure guidance is translated');
  assert.equal(result.english.printErrorHiddenAfterRetry, true, 'successful retry clears the English error');
  assert.equal(result.english.printCalls, 4, 'successful PT/EN print attempts invoke window.print');
  assert.deepEqual(pageErrors, [], 'print failures are handled without uncaught page errors');

  await page.emulateMedia({ media: 'print' });
  const printLayout = await page.evaluate(() => ({
    previewDisplay: getComputedStyle(document.getElementById('dsf-preview')).display,
    previewPosition: getComputedStyle(document.getElementById('dsf-preview')).position,
    menuDisplay: getComputedStyle(document.getElementById('menu')).display,
    panelDisplay: getComputedStyle(document.getElementById('dsf')).display,
    controlsDisplay: getComputedStyle(document.querySelector('#dsf-preview .no-print')).display,
    documentMaxWidth: getComputedStyle(document.querySelector('#dsf-preview .dsf-doc')).maxWidth,
  }));
  assert.notEqual(printLayout.previewDisplay, 'none', 'print media keeps the DSF preview visible');
  assert.equal(printLayout.previewPosition, 'static', 'print media removes overlay positioning');
  assert.equal(printLayout.menuDisplay, 'none', 'print media hides the rest of the interface');
  assert.equal(printLayout.panelDisplay, 'none', 'print media hides the DSF editor');
  assert.equal(printLayout.controlsDisplay, 'none', 'print media hides edit/print controls');
  assert.equal(printLayout.documentMaxWidth, 'none', 'print media lets the document use page width');
  console.log('✅ DSF QA: safe text, PT/EN content, print action and print-media layout PASS');
} finally {
  await browser?.close();
  if (vite.exitCode === null) vite.kill('SIGTERM');
  if (vite.exitCode === null) await new Promise((ok) => vite.once('close', ok));
}
