import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
// capa -> menu
await page.click('#capa-iniciar', { timeout: 4000 }).catch(e => console.log('click capa fail:', e.message.slice(0,80)));
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const m = document.querySelector('#menu');
  const c = document.querySelector('#capa');
  const b = document.querySelector('#btn-iniciar');
  const cb = document.querySelector('#capa-iniciar');
  const rect = b.getBoundingClientRect();
  const topEl = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
  return {
    menuHidden: m.hidden,
    capaHidden: c.hidden,
    capaPointer: getComputedStyle(c).pointerEvents,
    btnRect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    topAtBtn: topEl ? topEl.id || topEl.tagName : 'none',
    btnOnClick: typeof b.onclick,
    btnHasListener: b.getEventListeners ? 'n/a' : 'n/a',
    capaDisplay: getComputedStyle(c).display,
    menuZ: getComputedStyle(m).zIndex,
    capaZ: getComputedStyle(c).zIndex,
  };
});
console.log(JSON.stringify(info, null, 2));
// tenta clique via JS direto
const clicked = await page.evaluate(() => {
  const b = document.querySelector('#btn-iniciar');
  let fired = false;
  b.addEventListener('click', () => { fired = true; });
  b.click();
  return new Promise(r => setTimeout(() => r(fired), 100));
});
console.log('JS .click() disparou?', clicked);
await browser.close();
