import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
let page = pages.find(p => p.url().includes('3d.hunyuan.tencent.com'));
if (!page) { console.log('NO TENCENT TAB. pages:', pages.map(p=>p.url())); process.exit(1); }

await page.bringToFront().catch(()=>{});
console.log('URL:', page.url());
console.log('TITLE:', await page.title());

const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, a, div[role=button], [class*=btn]')]
    .map(el => {
      const r = el.getBoundingClientRect();
      const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g,' ');
      return { tag: el.tagName, txt: t.slice(0,40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: r.width>0 && r.height>0, dis: el.disabled||false };
    })
    .filter(b => b.vis && b.txt)
    .slice(0, 60);
  const bodyTxt = (document.body.innerText||'').replace(/\n{2,}/g,'\n').slice(0, 1500);
  return { btns, bodyTxt, toasts: [...document.querySelectorAll('[class*=toast],[class*=message],[class*=Message],[role=alert]')].map(e=>e.innerText).filter(Boolean).slice(0,10) };
});
console.log('=== BUTTONS ===');
for (const b of info.btns) console.log(`${b.dis?'[dis]':'     '} ${b.tag} (${b.x},${b.y} ${b.w}x${b.h}) :: ${b.txt}`);
console.log('=== TOASTS ==='); console.log(info.toasts.join(' | '));
console.log('=== BODY ==='); console.log(info.bodyTxt);

await browser.close();
