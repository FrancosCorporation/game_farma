// Exercises the actual atendimento controller and bulário markup through a light fixture.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const [base = 'http://127.0.0.1:4181/ana_work/parallel_20261012/game/bulario-qa.html', output = '/tmp/farma-bulario-qa'] = process.argv.slice(2);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    for (const lang of ['pt', 'en']) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const url = new URL(base); url.searchParams.set('lang', lang);
      await page.goto(url.href);
      await page.waitForFunction(() => document.documentElement.dataset.qaReady === '1');
      const pc = page.locator('#btn-hud-pc'), panel = page.locator('#bulario');
      await pc.focus(); await page.keyboard.press('Enter');
      assert.equal(await panel.isVisible(), true);
      assert.equal(await panel.getAttribute('role'), 'region');
      assert.equal(await page.locator('#bulario-titulo').count(), 1);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-bulario-fechar');
      assert.equal(await page.evaluate(() => window.bularioQa.game.queries), 1);
      // This panel is not modal: Tab must be able to leave it.
      await page.keyboard.press('Tab');
      assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), false);
      await page.locator('#btn-bulario-fechar').focus();
      await page.keyboard.press('Escape');
      assert.equal(await panel.isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-hud-pc');
      assert.equal(await page.evaluate(() => window.bularioQa.pov.zonaAtual()), 'paciente');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.bularioQa.game.queries), 1);
      await pc.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.bularioQa.game.queries), 1);
      const axe = await new AxeBuilder({ page }).include('#bulario').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.map(v => v.id), []);
      await page.locator('#btn-bulario-fechar').click();
      assert.equal(await panel.isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-hud-pc');
      await page.evaluate(() => { window.bularioQa.game.case.id = 'qa-b'; });
      await pc.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.bularioQa.game.queries), 2);
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, []);
      writeFileSync(`${output}/${viewport.width}-${lang}.json`, JSON.stringify({ passed: true, errors, axeViolations: axe.violations.length }, null, 2));
      console.log(`PASS ${viewport.width}x${viewport.height} ${lang}: focus, free Tab, real Escape/POV, reopen/score, region axe`);
      await context.close();
    }
  }
} finally { await browser.close(); }
