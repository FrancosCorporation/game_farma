import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const diag = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /Gerar imediatamente/i.test(b.innerText));
  const r = btn.getBoundingClientRect();
  const cx = r.x + r.width/2, cy = r.y + r.height/2;
  const top = document.elementFromPoint(cx, cy);
  const chain = [];
  let el = top;
  for (let i=0; el && i<6; i++) { chain.push(el.tagName + '.' + (el.className||'').toString().split(' ').slice(0,3).join('.')); el = el.parentElement; }
  // detectar modais/captcha
  const overlays = [...document.querySelectorAll('div,iframe')].filter(e => {
    const cs = getComputedStyle(e); const rr = e.getBoundingClientRect();
    return cs.position === 'fixed' && rr.width > 200 && rr.height > 200 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.zIndex > 100;
  }).map(e => ({ cls:(e.className||'').toString().slice(0,80), z:getComputedStyle(e).zIndex, txt:(e.innerText||'').trim().replace(/\s+/g,' ').slice(0,120) })).slice(0,10);
  const iframes = [...document.querySelectorAll('iframe')].map(f=>({src:(f.src||'').slice(0,120), w:f.getBoundingClientRect().width}));
  return { cx, cy, topChain: chain, overlays, iframes, btnText: btn.innerText.trim(), btnOuterHTML: btn.outerHTML.slice(0,300) };
});
console.log('DIAG:', JSON.stringify(diag, null, 1));

// capturar TUDO apos clique
const reqs = [];
page.on('request', r => reqs.push(r.method() + ' ' + r.url().slice(0,160)));
page.on('websocket', ws => {
  console.log('WS opened:', ws.url().slice(0,120));
  ws.on('framesent', f => { try { const s = f.payload.toString(); if (s.length < 400) console.log('WS>>', s.slice(0,300)); } catch(e){} });
});
const dialogs = [];
page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss().catch(()=>{}); });

await page.locator('button', { hasText: /Gerar imediatamente/i }).first().click({ timeout: 5000 }).catch(e=>console.log('CLICKFAIL', e.message));
await page.waitForTimeout(6000);
console.log('=== REQUESTS AFTER CLICK ===');
console.log(reqs.join('\n'));
console.log('=== DIALOGS ===', dialogs);
const toastNow = await page.evaluate(() => [...document.querySelectorAll('[class*=toast],[class*=Toast],[class*=message],[role=alert]')].map(e=>(e.innerText||'').replace(/\s+/g,' ')).filter(Boolean).slice(0,10));
console.log('=== TOASTS NOW ===', JSON.stringify(toastNow, null, 1));
await browser.close();
