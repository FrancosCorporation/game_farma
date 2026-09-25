import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const snap = () => page.evaluate(() => {
  const arr = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walk.nextNode())) {
    const t = (n.textContent || '').trim();
    if (!t) continue;
    const p = n.parentElement;
    const r = p.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    arr.push({ t: t.slice(0,120), x:Math.round(r.x), y:Math.round(r.y) });
  }
  return arr;
});

const before = await snap();
const bset = new Set(before.map(x=>x.x+','+x.y+','+x.t));
console.log('BEFORE text count:', before.length);
console.log('BEFORE sample:', JSON.stringify(before.slice(0,40).map(x=>x.t)));

await page.locator('button', { hasText: /立即生成|Gerar imediatamente/ }).first().click({ timeout: 5000 }).catch(e=>console.log('CF',e.message));
await page.waitForTimeout(4500);
const after = await snap();
const news = after.filter(x => !bset.has(x.x+','+x.y+','+x.t));
console.log('NEW TEXT:', JSON.stringify(news, null, 1));
console.log('AFTER count:', after.length);
await browser.close();
