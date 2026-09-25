import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const glbs=[];
page.on('request', r=>{ const u=r.url(); if(/\.glb(\?|$)/i.test(u)) glbs.push(u); });

// lista candidatos
const cands = await page.evaluate(()=>[...document.querySelectorAll('button,a,div[role=button],[class*=download],[class*=Download]')].filter(e=>e.offsetParent!==null && /下载|Baixar|Download|导出|Exportar/i.test(e.innerText||'')).map(e=>{const r=e.getBoundingClientRect();return {t:(e.innerText||'').trim().replace(/\s+/g,' ').slice(0,30), cls:(e.className||'').toString().slice(0,50), x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)};}));
console.log('CANDIDATES:', JSON.stringify(cands, null, 1));

// tenta cada um (o de download)
for (const c of cands) {
  await page.mouse.click(c.x + Math.round(c.w/2), c.y + 10).catch(()=>{});
  await page.waitForTimeout(3000);
  if (glbs.length) break;
}
console.log('GLB REQUESTS:', [...new Set(glbs)].join('\n') || '(none)');
// tambem procura link no DOM apos clique
const links = await page.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/\.glb|download|cos\./i.test(h)));
console.log('LINKS:', JSON.stringify(links));
await browser.close();
