// Diagnóstico completo do char-preview em produção
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [], netfail = [], netreq = [];
page.on('pageerror', e => errs.push('ERR: ' + e.message.slice(0,300)));
page.on('console', m => { if (m.type()==='error') errs.push('console.err: '+m.text().slice(0,300)); });
page.on('response', r => { const st = r.status(); const u = r.url(); if (st >= 400) netfail.push(` ${st} ${u.split('/').slice(-1)[0]}`); if (u.includes('.glb')) netreq.push(`${st} ana.glb`); });
page.on('requestfailed', r => netfail.push('RQFAIL '+r.url().split('/').slice(-1)[0]));
const start = Date.now();
try {
  await page.goto('https://francoscorporation.ddns.net/game/ufggame/char-preview.html?m=ana', { waitUntil: 'load', timeout: 25000 });
  const ready = await page.waitForFunction(() => window.__ready === true, { timeout: 10000 }).then(()=>true).catch(()=>false);
  const hud = await page.evaluate(() => document.getElementById('hud')?.textContent);
  console.log('ready:', ready, '| hud:', hud, '| t:', Date.now()-start, 'ms');
  console.log('erros:', errs.slice(0,8).join(' || ') || 'nenhum');
  console.log('netfails:', netfail.slice(0,8).join(' || ') || 'nenhum');
  console.log('gltf reqs:', netreq.join(' || ') || 'nenhum');
} catch(e) { console.log('FALHA GOTO:', e.message); }
await browser.close();
