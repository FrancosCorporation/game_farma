import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
if (!page) { console.log('NO TAB'); process.exit(1); }
await page.bringToFront().catch(()=>{});

const before = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /Gerar imediatamente/i.test(b.innerText));
  const imgs = [...document.querySelectorAll('img')].map(i => ({src:(i.src||'').slice(0,80), w:i.naturalWidth, h:i.naturalHeight, vis:i.offsetParent!==null}))
    .filter(i=>i.vis && i.w>0);
  const canvases = [...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,vis:c.offsetParent!==null}));
  return {
    btn: btn ? {dis: btn.disabled, cls: btn.className, aria: btn.getAttribute('aria-disabled'), rect: btn.getBoundingClientRect().toJSON()} : null,
    imgs, canvases,
    uploadHint: (document.body.innerText.match(/Carregando|upload|Upload|arraste|Arraste/gi)||[]),
  };
});
console.log('BEFORE:', JSON.stringify(before, null, 1));

const logs = [];
page.on('console', m => logs.push('CONSOLE ' + m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
page.on('request', r => { const u=r.url(); if(/generate|task|job|submit|hunyuan|3d/i.test(u) && !/\.(png|jpg|jpeg|webp|js|css|woff)/i.test(u)) logs.push('REQ ' + r.method() + ' ' + u.slice(0,140)); });
page.on('response', async r => { const u=r.url(); if(/generate|submit|task|job/i.test(u)) logs.push('RESP ' + r.status() + ' ' + u.slice(0,120)); });
page.on('dialog', async d => { logs.push('DIALOG: ' + d.message()); await d.dismiss().catch(()=>{}); });

const btn = page.locator('button', { hasText: /Gerar imediatamente/i }).first();
await btn.click({ timeout: 5000 }).catch(e => logs.push('CLICK FAIL: ' + e.message));
console.log('clicked, waiting 20s...');
await page.waitForTimeout(20000);

const after = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>({t:(b.innerText||'').trim().slice(0,40), dis:b.disabled}));
  const toasts = [...document.querySelectorAll('[class*=toast],[class*=message],[class*=Message],[class*=notice],[role=alert],[class*=Toast]')].map(e=>e.innerText).filter(Boolean);
  return { btns, toasts: [...new Set(toasts)].slice(0,15), body: (document.body.innerText||'').replace(/\n{2,}/g,'\n').slice(0,900) };
});
console.log('AFTER BTNS:', JSON.stringify(after.btns));
console.log('AFTER TOASTS:', JSON.stringify(after.toasts, null, 1));
console.log('AFTER BODY:\n' + after.body);
console.log('=== LOGS ===');
console.log(logs.slice(-60).join('\n'));

await browser.close();
