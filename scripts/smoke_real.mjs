import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
const errs = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[patient.glb]')) logs.push(t);
  if (m.type() === 'error') errs.push('CONSOLE-ERR: ' + t.slice(0, 200));
});
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).split('\n')[0]));

await page.addInitScript(() => {
  localStorage.setItem('farmacheck:real', '1');
});
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(5000);

// tenta entrar na capa e iniciar um caso
try { await page.click('#capa-iniciar', { timeout: 8000 }); } catch (e) { console.log('sem #capa-iniciar:', e.message.split('\n')[0]); }
await page.waitForTimeout(1500);
try { await page.click('#btn-iniciar', { timeout: 8000 }); } catch (e) { console.log('sem #btn-iniciar:', e.message.split('\n')[0]); }
await page.waitForTimeout(12000);

const hud = await page.evaluate(() => {
  const el = document.querySelector('#hud-paciente');
  return el ? el.textContent.slice(0, 120) : '(sem hud-paciente)';
});
console.log('HUD:', hud);
console.log('GLB LOGS:', logs.length ? logs : '(nenhum [patient.glb] — rever fluxo)');
console.log('ERROS:', errs.length ? errs.slice(0, 10) : 'NENHUM');
await page.screenshot({ path: '/tmp/opencode/smoke_real.png' });
await browser.close();