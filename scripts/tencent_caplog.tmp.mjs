import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

await page.evaluate(() => {
  window.__capLog = [];
  window.__watch = setInterval(() => {
    const t = document.querySelector('.tcaptcha-transform');
    if (!t) return;
    const r = t.getBoundingClientRect();
    const last = window.__capLog[window.__capLog.length-1];
    const cur = { x: Math.round(r.x), y: Math.round(r.y), op: getComputedStyle(t).opacity };
    if (!last || last.x !== cur.x || last.y !== cur.y || last.op !== cur.op) window.__capLog.push({ ...cur, t: Date.now() });
  }, 200);
  // inventariar tudo que pareça slider/verify
  window.__els = [...document.querySelectorAll('*')].filter(e => {
    const s = ((e.className||'') + ' ' + (e.id||'')).toString().toLowerCase();
    return /captcha|slider|drag|verify|nc_|tcap/.test(s);
  }).map(e => ({ tag:e.tagName, cls:(e.className||'').toString().slice(0,70), id:e.id, vis:e.offsetParent!==null }));
});

const els = await page.evaluate(() => window.__els);
console.log('ELEMENTS captcha/slider:', JSON.stringify(els, null, 1));

// clique real
await page.locator('button', { hasText: /Gerar imediatamente/i }).first().click({ timeout: 5000 }).catch(e=>console.log('CF',e.message));

for (let i=0;i<8;i++) {
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => {
    const t = document.querySelector('.tcaptcha-transform');
    const r = t ? t.getBoundingClientRect() : null;
    const txt = [...document.querySelectorAll('*')].filter(e=>e.offsetParent!==null && /安全验证|拖动|滑块|请完成|drag/i.test(e.innerText||'') && (e.innerText||'').length<60).map(e=>e.innerText.trim());
    return { x: r?Math.round(r.x):null, y: r?Math.round(r.y):null, op: t?getComputedStyle(t).opacity:null, hint: [...new Set(txt)].slice(0,5) };
  });
  console.log(`t=${(i+1)*2}s captcha:`, JSON.stringify(st));
  if (st.x !== null && st.x > -5000) { console.log('>>> CAPTCHA VISIVEL NA TELA'); break; }
}
const log = await page.evaluate(() => { clearInterval(window.__watch); return window.__capLog; });
console.log('CAPTCHA MOVES:', JSON.stringify(log));
await browser.close();
