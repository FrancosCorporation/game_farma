import { chromium } from 'file:///home/servidor/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e.message).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0,150)); });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(6000);
await page.click('#capa-iniciar');
await page.waitForTimeout(1000);
await page.click('#btn-iniciar');
await page.waitForTimeout(12000);
const st = await page.evaluate(() => ({
  hud: document.getElementById('hud-paciente').textContent,
  pix: (() => {
    const c = document.getElementById('scene3d');
    const g = document.createElement('canvas'); g.width = 32; g.height = 18;
    const x = g.getContext('2d'); x.drawImage(c, 0, 0, 32, 18);
    const d = x.getImageData(0, 0, 32, 18).data;
    let lum = 0, n = 0, brancos = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i]+d[i+1]+d[i+2])/3; lum += l; n++; if (l > 245) brancos++; }
    return { lumMedia: Math.round(lum/n), pctBranco: Math.round(brancos/n*100) };
  })(),
}));
console.log('ESTADO:', JSON.stringify(st));
await page.screenshot({ path: '/tmp/fix_atendimento.png' });
console.log('ERROS:', errs.length ? errs.slice(0,8) : 'NENHUM');
await browser.close();
