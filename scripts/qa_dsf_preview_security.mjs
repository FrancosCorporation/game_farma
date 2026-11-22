// Browser QA for safe DSF rendering and in-game persistence.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const probe = createServer();
await new Promise((ok) => probe.listen(0, '127.0.0.1', ok));
const port = probe.address().port;
await new Promise((ok) => probe.close(ok));
const vite = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch { /* starting */ }
    if (ready) break;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/src/main.js', (route) => route.abort());
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.setContent(`<!doctype html><html><body><main id="ui">
    <section id="dsf" hidden>
      <input id="dsf-paciente"><input id="dsf-data" type="date"><input id="dsf-queixa">
      <textarea id="dsf-hipotese"></textarea><textarea id="dsf-conduta"></textarea>
      <div id="dsf-rapidas"></div><div id="dsf-orient"></div><input id="dsf-encaminhamento">
      <button id="btn-dsf-emitir"></button><div id="dsf-salvas"></div>
      <button id="btn-dsf-fechar"></button><button id="btn-dsf-reiniciar"></button>
    </section>
    <section id="dsf-preview" hidden><h3 data-i18n="dsf.doc.title"></h3>
      <div id="dsf-doc-corpo"></div><p id="dsf-doc-stamp"></p>
      <p id="dsf-save-status" hidden></p><button id="btn-dsf-salvar"></button>
      <button id="btn-dsf-voltar"></button><button id="btn-dsf-preview-reiniciar"></button>
    </section>
    <button id="btn-hud-dsf"></button></main></body></html>`);
  const payload = '<img id="injected" src=x onerror="window.__xss=1">';
  await page.evaluate(async (payload) => {
    const { initDsf } = await import('/src/ui/dsf.js');
    window.__game = {
      interactionVersion: 1,
      case: { id: 'carla_dengue', persona: { nome: payload, idade: 25 }, pedido: payload, orientacoes: [] },
      registrarDSF(text) { this.dsf = text; },
    };
    window.__dsf = initDsf({ game: window.__game });
    window.__dsf.abrir();
    const field = document.getElementById('dsf-conduta');
    field.value = payload;
    field.dispatchEvent(new Event('input'));
    document.getElementById('btn-dsf-emitir').click();
    document.getElementById('btn-dsf-salvar').click();
  }, payload);
  const first = await page.evaluate(() => ({
    body: document.getElementById('dsf-doc-corpo').textContent,
    injected: !!document.getElementById('dsf-doc-corpo').querySelector('#injected'),
    executed: window.__xss === 1,
    saved: JSON.parse(localStorage.getItem('farmacheck:dsf:v1') || '[]'),
  }));
  assert.equal(first.injected, false);
  assert.equal(first.executed, false);
  assert.ok(first.body.includes(payload));
  assert.equal(first.saved.length, 1);
  assert.equal(first.saved[0].conduct, payload);
  await page.locator('#btn-dsf-voltar').click();
  await page.locator('#dsf-salvas button').click();
  assert.ok((await page.locator('#dsf-doc-corpo').textContent()).includes(payload));
  await page.locator('#btn-dsf-voltar').click();
  await page.locator('#dsf-conduta').fill('Conduta revisada.');
  await page.locator('#btn-dsf-emitir').click();
  await page.locator('#btn-dsf-salvar').click();
  assert.deepEqual(await page.evaluate(() => {
    const entries = JSON.parse(localStorage.getItem('farmacheck:dsf:v1') || '[]');
    return [entries.length, entries[0]?.conduct];
  }), [1, 'Conduta revisada.']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('farmacheck:dsf:v1') || '[]').length), 1);
  assert.deepEqual(errors, []);
  console.log('PASS DSF: texto seguro, salva no jogo e permanece após recarregar');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
