import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4173/';
const viewports = [
  { name: 'desktop', width: 1280, height: 800, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 8000 });
    const trigger = page.locator('#capa-refs');
    const dialog = page.locator('#refs [role="dialog"]');
    const close = page.locator('#btn-refs-fechar');

    await trigger.focus();
    await page.keyboard.press('Enter');
    await assertModalContent(page, dialog, 'Referências', 'Fechar', 'Créditos', 'Bibliografia', 'Pendente validação da PO', 'gatilhos');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btn-refs-fechar', 'opening references moves focus to Close');
    assert.equal(await page.locator('#capa').evaluate((element) => element.inert), true, 'cover is inert while references are open');

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btn-refs-fechar', 'Tab stays inside the single-control dialog');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btn-refs-fechar', 'Shift+Tab stays inside the dialog');

    const axe = await new AxeBuilder({ page })
      .include('#refs [role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    assert.deepEqual(axe.violations.map((violation) => violation.id), [], `${viewport.name} references axe violations`);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('refs').hidden);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'capa-refs', 'Escape restores focus to the trigger');
    assert.equal(await page.locator('#capa').evaluate((element) => element.inert), false, 'closing references restores cover interaction');

    await page.getByRole('button', { name: 'English' }).click();
    await trigger.click();
    await assertModalContent(page, dialog, 'References', 'Close', 'Credits', 'Bibliography', 'Pending PO validation', 'triggers');
    assert.equal(await page.locator('.refs-stamp').count(), 3, 'all bibliography entries keep their pending review label');
    await close.click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'capa-refs', 'Close button restores focus to the trigger');
    assert.deepEqual(errors, [], `${viewport.name} page errors`);

    console.log(`PASS ${viewport.name} ${viewport.width}x${viewport.height}: content PT/EN, modal focus, Escape, close, axe`);
    await context.close();
  }
} finally {
  await browser.close();
}

async function assertModalContent(page, dialog, title, closeLabel, credits, bibliography, pendingLabel, expectedTerm) {
  await page.waitForFunction(() => document.getElementById('refs').hidden === false);
  assert.equal(await dialog.getAttribute('aria-modal'), 'true', 'references dialog remains modal');
  assert.equal(await dialog.getAttribute('aria-labelledby'), 'refs-titulo', 'dialog has a programmatic title');
  assert.equal(await page.locator('#refs-titulo').textContent(), title);
  assert.equal(await page.locator('#btn-refs-fechar').textContent(), closeLabel);
  assert.equal(await page.locator('#refs').getByRole('heading', { name: credits }).count(), 1);
  assert.equal(await page.locator('#refs').getByRole('heading', { name: bibliography }).count(), 1);
  assert.equal(await page.locator('#refs').getByText(pendingLabel, { exact: true }).count(), 3);
  assert.match(await page.locator('#refs').innerText(), /UFG|Federal University of Goiás/);
  assert.match(await page.locator('#refs').innerText(), new RegExp(expectedTerm, 'i'));
}
