import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const failures = [];
const bad = [];
page.on('requestfailed', r => failures.push(r.method() + ' ' + r.url().slice(0,150) + ' :: ' + (r.failure()?.errorText || '?')));
page.on('response', async r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0,150)); });

// limpar e clicar
await page.waitForTimeout(500);
failures.length = 0; bad.length = 0;
await page.locator('button', { hasText: /Gerar imediatamente/i }).first().click({ timeout: 5000 }).catch(e=>console.log('CF',e.message));
await page.waitForTimeout(8000);

console.log('=== FAILED ==='); console.log([...new Set(failures)].join('\n') || '(none)');
console.log('=== HTTP>=400 ==='); console.log([...new Set(bad)].join('\n') || '(none)');

// tambem: o que o botao tem de handlers? procurar react props / listeners
const btnInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /Gerar imediatamente/i.test(b.innerText));
  const keys = Object.keys(btn).filter(k => k.startsWith('__react'));
  const out = { keys };
  for (const k of keys) {
    const v = btn[k];
    try {
      out[k] = v && v.memoizedProps ? JSON.stringify(v.memoizedProps).slice(0, 500) : String(v).slice(0,100);
    } catch(e) { out[k] = 'err'; }
  }
  // estado de quota no react/global
  out.globals = Object.keys(window).filter(k => /quota|remain|count|generate|user|login/i.test(k)).slice(0,30);
  return out;
});
console.log('=== BTN REACT ==='); console.log(JSON.stringify(btnInfo, null, 1));
await browser.close();
