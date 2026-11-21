// Compile Vite's cold module graph before qa_boot measures application startup.
// This uses a disposable browser context and does not relax the boot budgets.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4174/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 200));
});
page.addInitScript(() => localStorage.clear());

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.capaPronta === '1',
    null,
    { timeout: 60_000, polling: 100 },
  );
  await page.locator('#capa-iniciar').click();
  await page.waitForFunction(
    () => document.documentElement.dataset.jogoPronto === '1',
    null,
    { timeout: 60_000, polling: 100 },
  );
  if (errors.length) throw new Error(`browser errors during warmup: ${errors.slice(0, 3).join(' | ')}`);

  const timings = await page.evaluate(() => ({
    capaMs: Number(document.documentElement.dataset.capaProntaMs || 0),
    jogoMs: Number(document.documentElement.dataset.jogoProntoMs || 0),
  }));
  console.log(`PASS Vite warmup: capa=${timings.capaMs}ms, jogo=${timings.jogoMs}ms, browserErrors=0`);
} finally {
  await context.close();
  await browser.close();
}
