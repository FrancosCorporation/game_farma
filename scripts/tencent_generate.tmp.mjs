import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});

const logs=[];
page.on('response', async r=>{ const u=r.url(); if(/generate|submit|task|job|create|3d\/api|credit/i.test(u)&&!/\.(js|css|woff|ttf)/i.test(u)) logs.push('RESP '+r.status()+' '+r.request().method()+' '+u.slice(0,120)); });

await page.evaluate(() => {
  window.__q=[]; if(window.__qi)clearInterval(window.__qi);
  window.__qi=setInterval(()=>{ document.querySelectorAll('body *').forEach(e=>{ if(e.children.length)return; const t=(e.innerText||'').trim(); if(!t||t.length>160)return; const r=e.getBoundingClientRect(); if(r.width===0||r.height===0)return; const cs=getComputedStyle(e); const z=+cs.zIndex||0; const c=(e.className||'').toString();
    if(z>50||/toast|message|notice|alert/i.test(c)||/上限|limite|atingid|spawn|sucesso|conclu|falh|erro/i.test(t)){ const k=t.replace(/\s+/g,' ').slice(0,130); if(!window.__q.find(x=>x.t===k)) window.__q.push({t:k,z,cls:c.slice(0,40)}); } }); },120);
});

const btn = page.locator('button').filter({ hasText: /立即生成|Gerar imediatamente/ }).first();
await btn.click({ timeout: 6000 }).catch(e=>console.log('CF',e.message));
console.log('clicked, waiting 25s for task...');
await page.waitForTimeout(25000);

const st = await page.evaluate(() => {
  const remain = document.querySelector('.remain-count');
  const body=(document.body.innerText||'').replace(/\n{2,}/g,'\n').slice(0,700);
  clearInterval(window.__qi);
  return { remain: remain?remain.innerText:null, toasts: window.__q, body };
});
console.log('REMAIN NOW:', st.remain);
console.log('TOASTS:', JSON.stringify(st.toasts, null, 1));
console.log('BODY:\n'+st.body);
console.log('NET:\n'+logs.slice(-30).join('\n'));
await page.screenshot({ path:'/tmp/opencode/tencent_generated.png' });
await browser.close();
