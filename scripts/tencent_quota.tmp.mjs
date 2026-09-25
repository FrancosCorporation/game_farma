import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const snap = () => page.evaluate(() => {
  const kw = /上限|次数|额度|剩余|积分|credit|quota|验证|拖动|滑块|安全|登录|购买|升级|会员|立即生成|generation/i;
  const seen = new Set();
  const hits = [];
  document.querySelectorAll('body *').forEach(e => {
    if (e.children.length > 3) return;
    const t = (e.innerText || '').trim();
    if (t && t.length < 200 && kw.test(t)) {
      const r = e.getBoundingClientRect();
      const key = t.replace(/\s+/g,' ').slice(0,80);
      if (!seen.has(key)) { seen.add(key); hits.push({ t: key, x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height), vis: r.width>0&&r.height>0 }); }
    }
  });
  return hits;
});

const before = await snap();
console.log('BEFORE hits:', JSON.stringify(before, null, 1));

await page.locator('button', { hasText: /立即生成|Gerar imediatamente/ }).first().click({ timeout: 5000 }).catch(e=>console.log('CF',e.message));
await page.waitForTimeout(4000);
const after = await snap();
const beforeKeys = new Set(before.map(h=>h.t));
const news = after.filter(h => !beforeKeys.has(h.t));
console.log('NEW hits after click:', JSON.stringify(news, null, 1));

// lista dialogos/modais antd visiveis
const modals = await page.evaluate(() => [...document.querySelectorAll('.t-dialog,.t-dialog__wrap,.t-modal,[role=dialog],.tcaptcha-transform')].map(e=>{
  const r=e.getBoundingClientRect(); return { cls:(e.className||'').toString().slice(0,60), x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height), txt:(e.innerText||'').replace(/\s+/g,' ').slice(0,200) };
}));
console.log('MODALS:', JSON.stringify(modals, null, 1));
await browser.close();
