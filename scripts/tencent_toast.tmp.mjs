import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

await page.evaluate(() => {
  window.__q = [];
  window.__qi = setInterval(() => {
    document.querySelectorAll('body *').forEach(e => {
      if (e.children.length) return;
      const t = (e.innerText||'').trim();
      if (!t || t.length > 160) return;
      const r = e.getBoundingClientRect();
      if (r.width===0||r.height===0) return;
      const cs = getComputedStyle(e);
      const z = +cs.zIndex || 0;
      if (z > 100 || /toast|message|notice|alert|warning/i.test((e.className||'').toString()) || /上限|spawn|limite|atingid/i.test(t)) {
        const k = t.replace(/\s+/g,' ').slice(0,120);
        if (!window.__q.find(x=>x.t===k)) window.__q.push({ t:k, z, cls:(e.className||'').toString().slice(0,50), y:Math.round(r.y) });
      }
    });
  }, 150);
});

await page.locator('button', { hasText: /立即生成|Gerar imediatamente/ }).first().click({ timeout: 5000 }).catch(e=>console.log('CF',e.message));
await page.waitForTimeout(8000);
const q = await page.evaluate(() => { clearInterval(window.__qi); return window.__q; });
console.log('CAUGHT ELEMENTS:', JSON.stringify(q, null, 1));
await browser.close();
