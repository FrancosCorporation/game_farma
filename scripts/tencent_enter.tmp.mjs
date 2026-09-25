import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});
// clica no card 图/文生3D
const card = page.locator('text=图/文生3D').first();
await card.click({ timeout: 6000 }).catch(e=>console.log('card click fail', e.message));
await page.waitForTimeout(5000);
console.log('URL:', page.url());
const st = await page.evaluate(() => {
  const remain = document.querySelector('.remain-count');
  const gen = document.querySelector('.sideBarLeft-generateBtn');
  const inputs = [...document.querySelectorAll('input')].map(i=>({type:i.type, accept:i.accept, cls:(i.className||'').slice(0,40)}));
  const body = (document.body.innerText||'').replace(/\n{2,}/g,'\n').slice(0,600);
  return { remain: remain?remain.innerText:null, hasGen: !!gen, genDisabled: gen?gen.disabled:null, inputs, body };
});
console.log('REMAIN:', st.remain, '| hasGenerate:', st.hasGen, '| disabled:', st.genDisabled);
console.log('INPUTS:', JSON.stringify(st.inputs));
console.log('BODY:\n'+st.body);
await browser.close();
