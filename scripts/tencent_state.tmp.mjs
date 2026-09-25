import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.waitForTimeout(2000);
const st = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>({t:(b.innerText||'').replace(/\s+/g,' ').trim().slice(0,30), dis:b.disabled}));
  const hasGen = !!document.querySelector('.sideBarLeft-generateBtn');
  const body = (document.body.innerText||'').replace(/\n{2,}/g,'\n').slice(0,700);
  return { btns, hasGen, body };
});
console.log('HAS GENERATE BTN:', st.hasGen);
console.log('BUTTONS:', JSON.stringify(st.btns));
console.log('BODY:\n'+st.body);
await browser.close();
