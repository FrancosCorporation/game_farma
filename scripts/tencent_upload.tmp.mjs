import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const logs=[];
page.on('response', async r=>{ const u=r.url(); if(/upload|resource|generate|submit|task|job/i.test(u)&&!/\.(js|css|woff|ttf|png|jpg)/i.test(u)) logs.push('RESP '+r.status()+' '+u.slice(0,130)); });
page.on('request', r=>{ const u=r.url(); if(/generate|submit|task|job/i.test(u)) logs.push('REQ '+r.method()+' '+u.slice(0,130)); });

const fi = page.locator('input[type=file]').first();
await fi.setInputFiles('/home/servidor/Git/game_farma/scripts/comfy/refs/ana_coriza.png');
console.log('file set, waiting upload...');
await page.waitForTimeout(9000);

const st = await page.evaluate(() => {
  const remain = document.querySelector('.remain-count');
  const gen = document.querySelector('.sideBarLeft-generateBtn');
  const imgs = [...document.querySelectorAll('img')].filter(i=>i.offsetParent!==null && i.naturalWidth>200).map(i=>({w:i.naturalWidth,h:i.naturalHeight,src:(i.src||'').slice(0,60)}));
  const body = (document.body.innerText||'').replace(/\n{2,}/g,'\n').slice(0,500);
  return { remain: remain?remain.innerText:null, hasGen:!!gen, genDisabled: gen?gen.disabled:null, imgs, body };
});
console.log('REMAIN:', st.remain, '| hasGen:', st.hasGen, '| disabled:', st.genDisabled);
console.log('IMGS:', JSON.stringify(st.imgs));
console.log('BODY:\n'+st.body);
console.log('NET:\n'+logs.slice(-25).join('\n'));
await browser.close();
