import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('3d.hunyuan.tencent.com'));
await page.bringToFront().catch(()=>{});
const urlRe=[]; 
page.on('response', async r=>{ const u=r.url(); if(/download|resource|\.glb|\.zip/i.test(u)&&r.status()===200) urlRe.push(u.slice(0,160)); });

for (let i=0;i<24;i++) {
  await page.waitForTimeout(10000);
  const st = await page.evaluate(() => {
    const remain=document.querySelector('.remain-count');
    const txt=(document.body.innerText||'');
    const prog = (txt.match(/mais (\d+) segundos|(\d+)%/g)||[]).slice(-3);
    const done = /conclu|complet|finaliz/i.test(txt) && !/deve levar|加载中|Carregando/i.test(txt);
    const dls=[...document.querySelectorAll('a[href*=download],button')].filter(e=>e.offsetParent!==null && /下载|baixar|download|导出|exportar|GLB/i.test(e.innerText||'')).map(e=>(e.innerText||'').trim().slice(0,30));
    return { remain: remain?remain.innerText:null, prog, done, dls, tail: txt.replace(/\n{2,}/g,'\n').slice(0,300) };
  });
  console.log(`t=${(i+1)*10}s remain=${st.remain} prog=${JSON.stringify(st.prog)} done=${st.done} dls=${JSON.stringify(st.dls)}`);
  if (i===0) console.log('TAIL:', st.tail.replace(/\n/g,' | '));
  if (st.done && st.dls.length) { console.log('DONE with download buttons'); }
  const stillGen = /deve levar|加载中|Carregando|gerando|geration|geometry|textur/i.test(st.tail) && st.prog.length>0;
  if (!stillGen && st.done) { console.log('=== POSSIVEL CONCLUSAO ==='); break; }
}
console.log('NET urls:', [...new Set(urlRe)].slice(-15).join('\n'));
await browser.close();
