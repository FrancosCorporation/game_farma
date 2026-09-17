import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0,200)));
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#capa-iniciar').click());
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('#btn-iniciar').click());
// monitora o estado ao longo do tempo
for (const delay of [1000, 2000, 4000, 8000]) {
  await page.waitForTimeout(delay);
  const st = await page.evaluate(() => {
    const g = window.__farmacheck?.game;
    return {
      state: g?.state,
      fase: g?.el['hud-fase']?.textContent,
      paciente: g?.el['hud-paciente']?.textContent,
      chatNome: g?.el['chat-nome']?.textContent,
      caseId: g?.case?.id,
      turn: g?.turn,
      busy: g?.busy,
    };
  });
  console.log(`t+${delay}ms:`, JSON.stringify(st));
}
await browser.close();
