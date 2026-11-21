// Browser regression for the TLAC result renderer and untrusted case text.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(new URL('..', import.meta.url).pathname);
const externalBase = process.env.QA_BASE_URL?.replace(/\/$/, '');
let port = null;
let vite = null;
let stderr = '';
if (!externalBase) {
  const portProbe = createServer();
  await new Promise((ok, fail) => {
    portProbe.once('error', fail);
    portProbe.listen(0, '127.0.0.1', ok);
  });
  port = portProbe.address().port;
  await new Promise((ok, fail) => portProbe.close((error) => error ? fail(error) : ok()));
  vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  vite.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
}
const baseUrl = externalBase || `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
let browser;

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (vite && vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* Vite is starting */ }
    await wait(50);
  }
  assert.equal(ready, true, 'Vite or the configured dev server responds for TLAC browser regression');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => localStorage.setItem('farmacheck:sfx-volume', '0'));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, {
    timeout: 30000,
    polling: 100,
  });
  await page.locator('#capa-iniciar').click();
  await page.waitForFunction(() => document.getElementById('menu')?.hidden === false);
  await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1'
    && document.getElementById('btn-iniciar')?.disabled === false, null, {
    timeout: 90000,
    polling: 100,
  });
  await page.evaluate(() => {
    const { game } = window.__farmacheck;
    const skipCosmeticArrival = (model) => {
      if (model && typeof model.enter === 'function') model.enter = async function (appearance) {
        this.setStyle(appearance || {});
        this.setPose('idle');
        const root = this.getModel?.()?.parent;
        if (root) {
          root.position.set(0, 0, 0.55);
          root.rotation.set(0, 0, 0);
          root.visible = true;
        }
      };
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
  await page.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE', null, {
    timeout: 180000,
    polling: 200,
  });
  await page.evaluate(() => {
    const pov = window.__farmacheck.pov;
    const irParaOriginal = pov.irPara;
    window.__qaPovMoves = [];
    pov.irPara = (zone, options) => {
      const before = pov.zonaAtual();
      const result = irParaOriginal(zone, options);
      window.__qaPovMoves.push({ zone, before, after: pov.zonaAtual() });
      return result;
    };
  });

  const payload = '<img id="tlac-injected" src=x onerror="window.__tlacXss=1">';
  const expectedText = `POSITIVO ${payload}`.toUpperCase();
  await page.evaluate((value) => {
    window.__farmacheck.game.case.testeRapido = {
      indicado: true,
      tipo: 'browser QA',
      resultado: `POSITIVO ${value}`,
    };
  }, payload);
  await page.locator('#btn-hud-tlac').click();
  await page.waitForFunction(() => document.getElementById('tlac')?.hidden === false);
  for (let i = 0; i < 4; i++) await page.locator('#tlac-passos button[data-passo]').click();
  await page.waitForFunction(() => document.getElementById('tlac-resultado')?.hidden === false, null, {
    timeout: 10000,
    polling: 50,
  });

  const result = await page.evaluate(() => {
    const element = document.getElementById('tlac-resultado');
    return {
      className: element.className,
      text: element.textContent,
      injectedElement: Boolean(element.querySelector('#tlac-injected')),
      handlerExecuted: window.__tlacXss === 1,
      children: [...element.children].map((child) => child.tagName),
    };
  });
  assert.match(result.className, /tlac-positivo/);
  assert.ok(result.text.includes(expectedText), 'payload remains literal text after the existing uppercase presentation');
  assert.equal(result.injectedElement, false, 'case text does not create a DOM element');
  assert.equal(result.handlerExecuted, false, 'case text does not execute an event handler');
  assert.deepEqual(result.children, ['B', 'SPAN', 'SMALL'], 'result keeps its existing semantic layout');
  await page.locator('#btn-tlac-fechar').click();

  await page.evaluate(() => {
    window.__farmacheck.game.case.testeRapido = { indicado: true, tipo: 'Dengue NS1', resultado: null };
  });
  await page.locator('#btn-hud-tlac').click();
  await page.waitForFunction(() => document.getElementById('tlac-tipo')?.textContent.includes('Dengue NS1'));
  const beforeCollection = await page.evaluate(() => window.__farmacheck.pharmacy.getNs1FingerstickDiagnostics());
  await page.locator('#tlac-passos button[data-passo="0"]').click();
  const collectionStarted = await page.evaluate(() => ({
    diagnostics: window.__farmacheck.pharmacy.getNs1FingerstickDiagnostics(),
    pov: window.__farmacheck.pov.zonaAtual(),
    povMoves: window.__qaPovMoves,
    panelHidden: document.getElementById('tlac').hidden,
    status: document.getElementById('tlac-scene-status').textContent,
    stage: document.getElementById('tlac').classList.contains('tlac-cena-3d'),
  }));
  const artifactDir = process.env.QA_ARTIFACT_DIR;
  if (artifactDir) {
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, 'ns1-fingerstick-start.json'), JSON.stringify(collectionStarted, null, 2));
  }
  assert.match(collectionStarted.diagnostics.targetBone || '', /^mixamorig:?(?:Left|Right)HandIndex4$/,
    `animation must bind to the patient's index fingertip: ${JSON.stringify(collectionStarted)}`);
  assert.equal(collectionStarted.pov, 'coleta');
  assert.match(collectionStarted.status, /lancet|lanceta/i);
  assert.equal(collectionStarted.stage, true);
  assert.equal(collectionStarted.panelHidden, false, 'the TLAC stays open while its camera moves to the collection zone');
  assert.ok(collectionStarted.povMoves.some((move) => move.zone === 'coleta' && move.after === 'coleta'),
    `collection POV remains active while TLAC is open: ${JSON.stringify(collectionStarted.povMoves)}`);
  try {
    await page.waitForFunction((count) => window.__farmacheck.pharmacy.getNs1FingerstickDiagnostics().contactCount > count,
      beforeCollection.contactCount, { timeout: 45000, polling: 50 });
  } catch (error) {
    const state = await page.evaluate(() => window.__farmacheck.pharmacy.getNs1FingerstickDiagnostics());
    throw new Error(`NS1 finger-contact animation did not reach the finger: ${JSON.stringify(state)}; ${error.message}`);
  }
  if (artifactDir) await page.screenshot({ path: join(artifactDir, 'ns1-fingerstick-contact.png') });
  try {
    await page.waitForFunction(() => {
      const state = window.__farmacheck.pharmacy.getNs1FingerstickDiagnostics();
      return !state.running && !state.deviceVisible;
    }, null, { timeout: 15000, polling: 50 });
  } catch (error) {
    const state = await page.evaluate(() => window.__farmacheck.pharmacy.getNs1FingerstickDiagnostics());
    throw new Error(`NS1 fingerstick did not retract: ${JSON.stringify(state)}; ${error.message}`);
  }
  const collectionFinished = await page.evaluate(() => window.__farmacheck.pharmacy.getNs1FingerstickDiagnostics());
  assert.equal(collectionFinished.contactCount, beforeCollection.contactCount + 1);
  assert.equal(collectionFinished.deviceVisible, false, 'lancet hides after simulated contact and retraction');
  if (artifactDir) writeFileSync(join(artifactDir, 'ns1-fingerstick.json'), JSON.stringify({
    exam: 'Dengue NS1', beforeCollection, collectionStarted, collectionFinished,
  }, null, 2));
  await page.locator('#btn-tlac-fechar').click();
  assert.equal(await page.evaluate(() => window.__farmacheck.pov.zonaAtual()), 'paciente');

  await page.locator('#btn-hud-tlac').click();
  for (let i = 0; i < 4; i++) await page.locator('#tlac-passos button[data-passo]').click();
  await page.waitForFunction(() => document.getElementById('tlac-resultado')?.hidden === false, null, {
    timeout: 10000, polling: 50,
  });
  const undefinedResult = await page.evaluate(() => ({
    className: document.getElementById('tlac-resultado').className,
    text: document.getElementById('tlac-resultado').textContent,
    registered: window.__farmacheck.game.testeRapido,
  }));
  assert.match(undefinedResult.className, /tlac-neutro/);
  assert.match(undefinedResult.text, /não informado no roteiro clínico/i);
  assert.deepEqual(undefinedResult.registered, { executado: true, resultado: null });
  assert.deepEqual(pageErrors, [], `browser has no uncaught/console errors: ${pageErrors.join(' | ')}`);
  console.log('PASS TLAC browser regression: safe positive rendering and neutral result when the case gives none.');
  await context.close();
} finally {
  await browser?.close();
  if (vite && vite.exitCode === null) {
    vite.kill('SIGTERM');
    await new Promise((resolveExit) => vite.once('exit', resolveExit));
  }
}
