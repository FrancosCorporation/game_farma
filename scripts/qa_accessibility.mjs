import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4181/';
const output = process.argv[3] || '/tmp/farma-accessibility-final';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => localStorage.setItem('farmacheck:quality', 'low'));
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1');
    for (const lang of ['pt', 'en']) {
      await page.locator(`#capa-lang-${lang}`).focus();
      await page.keyboard.press('Enter');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const name = `${viewport.width}x${viewport.height}-capa-${lang}`;
      writeFileSync(join(output, `${name}.json`), JSON.stringify(results, null, 2));
      assert.deepEqual(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], name);
      console.log(`PASS ${name}: auditoria automática e idioma por teclado`);
    }
    await page.locator('#capa-iniciar').focus();
    await page.keyboard.press('Enter');
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1');
    await page.locator('#btn-iniciar').waitFor();
    assert.equal(await page.locator('#btn-iniciar').isEnabled(), true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const name = `${viewport.width}x${viewport.height}-menu-en`;
    writeFileSync(join(output, `${name}.json`), JSON.stringify(results, null, 2));
    assert.deepEqual(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], name);
    await page.screenshot({ path: join(output, `${name}.png`) });
    console.log(`PASS ${name}: auditoria automática e abertura por teclado`);
    const achievements = page.locator('#menu .meta-badges');
    await achievements.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await achievements.locator('.medalhas').isVisible(), true);
    const firstBadge = achievements.locator('.medalha').first();
    assert.match(await firstBadge.getAttribute('aria-label') || '', /First shift — Locked\./);
    assert.equal(await firstBadge.evaluate((el) => getComputedStyle(el).color), 'rgb(148, 163, 184)');
    const badgeResults = await new AxeBuilder({ page }).include('#menu-meta')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(badgeResults.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [],
      `${viewport.width}x${viewport.height}-menu-meta-open`);
    await page.keyboard.press('Enter');
    assert.equal(await achievements.locator('.medalhas').isVisible(), false);
    console.log(`PASS ${viewport.width}x${viewport.height}: conquistas por teclado, nome/estado acessíveis, contraste e axe`);
    await context.close();
  }
} finally {
  await browser.close();
}
