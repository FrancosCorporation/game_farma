import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});
const info = await page.evaluate(() => {
  // acha elementos com background-image
  const bg = [...document.querySelectorAll('*')].filter(e=>{ const b=getComputedStyle(e).backgroundImage; return b && b!=='none' && /url\(/.test(b); })
    .map(e=>{ const r=e.getBoundingClientRect(); return { cls:(e.className||'').toString().slice(0,50), bg:getComputedStyle(e).backgroundImage.slice(0,90), x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height), vis:r.width>0 }; }).filter(x=>x.vis && x.w>100);
  // box de upload
  const boxes = [...document.querySelectorAll('*')].filter(e=>/上传图片|Sugestões de upload|uploadBox|upload-box/i.test(e.innerText||'') && e.children.length<6)
    .map(e=>({cls:(e.className||'').toString().slice(0,60), t:(e.innerText||'').replace(/\s+/g,' ').slice(0,60)}));
  return { bg, boxes };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path:'/tmp/opencode/tencent_after_upload.png' });
console.log('shot saved');
await browser.close();
