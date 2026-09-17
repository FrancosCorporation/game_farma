import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const before = await page.evaluate(() => ({ capa: document.querySelector('#capa').hidden, menu: document.querySelector('#menu').hidden }));
console.log('ANTES:', JSON.stringify(before));
// clique real
try {
  await page.click('#capa-iniciar', { timeout: 5000, position: { x: 200, y: 40 } });
  console.log('CLICK OK via page.click');
} catch (e) {
  console.log('CLICK FALHOU:', e.message.slice(0, 120));
}
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({ capa: document.querySelector('#capa').hidden, menu: document.querySelector('#menu').hidden }));
console.log('DEPOIS:', JSON.stringify(after));
await browser.close();
