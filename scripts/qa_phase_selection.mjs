// Browser integration smoke for the live phase selector; does not start a patient.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(new URL('..', import.meta.url).pathname);
let targetUrl = process.argv[2];
let vite = null;
let viteStderr = '';
let browser = null;
let context = null;
if (!targetUrl) {
  const probe = createServer();
  await new Promise((ok, fail) => {
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', ok);
  });
  const port = probe.address().port;
  await new Promise((ok, fail) => probe.close((error) => error ? fail(error) : ok()));
  targetUrl = `http://127.0.0.1:${port}/`;
  vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  vite.stderr.setEncoding('utf8').on('data', (chunk) => { viteStderr += chunk; });
}

try {
  if (vite) {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (vite.exitCode !== null) throw new Error(`Vite exited early (${vite.exitCode}): ${viteStderr}`);
      try {
        const response = await fetch(targetUrl);
        if (response.status === 200) { ready = true; break; }
      } catch { /* Vite is starting. */ }
      await new Promise((ok) => setTimeout(ok, 50));
    }
    assert.equal(ready, true, `isolated Vite server starts: ${viteStderr}`);
  }

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('farmacheck:progress', JSON.stringify({ pontos: 120 }));
    localStorage.setItem('farmacheck:sfx-volume', '0');
    // This smoke tests phase selection only; real frame/arrival behavior is gated elsewhere.
    window.requestAnimationFrame = () => 0;
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null,
    { timeout: 30000, polling: 100 });
  await page.click('#capa-iniciar');
  await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1'
    && window.__farmacheck?.game, null, { timeout: 90000, polling: 100 });

  const before = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('#phase-select .phase-card')].map((card) => ({
      disabled: card.disabled,
      pressed: card.getAttribute('aria-pressed'),
    })),
    unlocked: window.__farmacheck.game.progress.unlockLevel(),
  }));
  assert.equal(before.cards.length, 5, 'five phase cards render');
  assert.equal(before.cards.filter((card) => card.disabled).length, 0, '120-point save unlocks all phases');

  const expected = await page.evaluate(() => {
    const game = window.__farmacheck.game;
    const phase = game.phases[3];
    return {
      id: phase.id,
      cases: phase.casos ? [...phase.casos] : game.cases.map((patient) => patient.id),
    };
  });
  await page.locator('#phase-select .phase-card').nth(3).click();
  const after = await page.evaluate(() => ({
    index: window.__farmacheck.game.phaseIdx,
    id: window.__farmacheck.game.phaseDef().id,
    order: window.__farmacheck.game.caseOrder,
    pressed: [...document.querySelectorAll('#phase-select .phase-card')]
      .map((card) => card.getAttribute('aria-pressed')),
  }));
  assert.equal(after.index, 3, 'Game owns and updates the selected phase index');
  assert.equal(after.id, expected.id, 'selected phase definition matches the clicked card');
  assert.deepEqual(after.order, expected.cases, 'case order follows selected phase');
  assert.deepEqual(after.pressed, ['false', 'false', 'false', 'true', 'false'], 'aria-pressed tracks selection');
  assert.deepEqual(errors, [], 'page has no uncaught errors');

  console.log(`✔ phase selector browser QA: ${before.cards.length} cards, unlock level ${before.unlocked}, selected ${after.id}`);
} finally {
  await context?.close();
  await browser?.close();
  if (vite && vite.exitCode === null) {
    vite.kill('SIGTERM');
    await new Promise((ok) => vite.once('exit', ok));
  }
}
