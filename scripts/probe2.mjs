import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type()==='error' || m.type()==='warning') console.log('CONSOLE', m.type(), m.text().slice(0,150)); });
page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(0,80), r.failure()?.errorText));
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const stage = document.querySelector('.capa-stage');
  const btn = document.querySelector('#capa-iniciar');
  const sRect = stage.getBoundingClientRect();
  const bRect = btn.getBoundingClientRect();
  const bg = getComputedStyle(stage).backgroundImage;
  // testa se a imagem carrega
  return new Promise(r => {
    const img = new Image();
    img.onload = () => r({ stageRect: {x:sRect.x,y:sRect.y,w:sRect.width,h:sRect.height}, btnRect:{x:bRect.x,y:bRect.y,w:bRect.width,h:bRect.height}, bg, imgLoaded: true, imgW: img.width, imgH: img.height });
    img.onerror = () => r({ stageRect: {x:sRect.x,y:sRect.y,w:sRect.width,h:sRect.height}, btnRect:{x:bRect.x,y:bRect.y,w:bRect.width,h:bRect.height}, bg, imgLoaded: false });
    img.src = '/capa/inicio_game.webp';
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
