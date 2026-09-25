import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});
const found=[];
page.on('response', async r=>{ const u=r.url(); if(/\.glb(\?|$)/i.test(u) || /\/api\/3d\/resource\/download/i.test(u)) found.push(u); });
// re-scan recursos no DOM
const urls = await page.evaluate(()=>{
  const set=new Set();
  document.querySelectorAll('*').forEach(e=>{ const b=getComputedStyle(e).backgroundImage; const m=b&&b.match(/url\("([^"]+)"\)/); if(m&&/download|\.glb/i.test(m[1])) set.add(m[1]); });
  document.querySelectorAll('a[href]').forEach(a=>{ if(/download|\.glb/i.test(a.href)) set.add(a.href); });
  return [...set];
});
console.log('DOM URLS:', JSON.stringify(urls, null, 1));
// abre Ativos e coleta
await page.waitForTimeout(3000);
const urls2 = await page.evaluate(()=>{
  const set=new Set();
  document.querySelectorAll('img,video,a').forEach(e=>{ const s=e.src||e.href||''; if(/download|\.glb|resourceId/i.test(s)) set.add(s.slice(0,300)); });
  return [...set];
});
console.log('MEDIA URLS:', JSON.stringify(urls2, null, 1));
console.log('NET FOUND:', [...new Set(found)].slice(-10).join('\n'));
await browser.close();
