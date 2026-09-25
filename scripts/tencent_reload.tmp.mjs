import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const watch = async () => page.evaluate(() => {
  window.__q = [];
  if (window.__qi) clearInterval(window.__qi);
  window.__qi = setInterval(() => {
    document.querySelectorAll('body *').forEach(e => {
      if (e.children.length) return;
      const t = (e.innerText||'').trim();
      if (!t || t.length > 160) return;
      const r = e.getBoundingClientRect();
      if (r.width===0||r.height===0) return;
      if (/上限|spawn|limite|atingid|credit/i.test(t)) {
        const k = t.replace(/\s+/g,' ').slice(0,120);
        if (!window.__q.find(x=>x.t===k)) window.__q.push({ t:k });
      }
    });
  }, 120);
});
const readWatch = () => page.evaluate(() => { clearInterval(window.__qi); return window.__q; });

console.log('RELOADING...');
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(9000);
console.log('URL after reload:', page.url());
const imgAfter = await page.evaluate(() => [...document.querySelectorAll('img')].filter(i=>i.offsetParent!==null && i.naturalWidth>300).map(i=>({w:i.naturalWidth,h:i.naturalHeight,src:(i.src||'').slice(0,70)})));
console.log('IMAGES after reload:', JSON.stringify(imgAfter));

await watch();
await page.locator('button', { hasText: /立即生成|Gerar imediatamente/ }).first().click({ timeout: 6000 }).catch(e=>console.log('CF',e.message));
await page.waitForTimeout(8000);
console.log('TOASTS after reload+click:', JSON.stringify(await readWatch(), null, 1));
await browser.close();
