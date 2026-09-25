import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.waitForTimeout(1000);
const info = await page.evaluate(() => {
  // procura elementos com numero (credito) no topo
  const top = [...document.querySelectorAll('header *, [class*=header] *, [class*=nav] *, [class*=credit] *, [class*=Credit] *')]
    .filter(e=>e.children.length===0 && /^\d+$/.test((e.innerText||'').trim()))
    .map(e=>({t:e.innerText.trim(), cls:(e.parentElement.className||'').toString().slice(0,60)}));
  // botoes "立即开始" e seus cards
  const starts = [...document.querySelectorAll('button, a, div[role=button]')].filter(e=>/立即开始|开始/.test(e.innerText||'')).
    map(e=>({t:(e.innerText||'').replace(/\s+/g,' ').trim().slice(0,20), cls:(e.className||'').toString().slice(0,50), rect: (()=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)}})()}));
  // cards de feature com titulo
  const cards = [...document.querySelectorAll('*')].filter(e=>e.children.length===0 && /图\/文生3D|3D世界模型|高模生成/.test(e.innerText||'')).map(e=>({t:e.innerText.trim(), cls:(e.parentElement.className||'').toString().slice(0,50)}));
  return { topNums: top, starts, cards };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
