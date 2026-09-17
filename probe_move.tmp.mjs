import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:4174/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1376, height: 768 } });
await p.goto(URL, { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.__farmacheck === 'object', { timeout: 30000 });
await p.evaluate(() => document.getElementById('capa-iniciar').click());
await p.waitForTimeout(300);
await p.evaluate(() => document.getElementById('btn-iniciar').click());
// espera chegar em ANAMNESE (walk-in pode demorar no headless)
await p.waitForFunction(() => window.__farmacheck?.game?.state === 'ANAMNESE', { timeout: 90000 }).catch(() => {});
const inert = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('[inert]').forEach((el) => out.push(el.tagName + (el.id ? '#' + el.id : '')));
  return out;
});
console.log('inert restantes:', inert.length ? inert.join(', ') : 'nenhum ✓');
const st0 = await p.evaluate(() => ({ zona: window.__farmacheck.pov.zonaAtual?.(), cam: [...window.__farmacheck.game.avatar?.getModel?.()?.parent?.position || []] }));
// 1) tecla de zona
await p.keyboard.press('2');
await p.waitForTimeout(2500);
const zona2 = await p.evaluate(() => window.__farmacheck.pov.zonaAtual?.());
// 2) drag look no canvas
const yaw0 = await p.evaluate(() => { const c = document.querySelector('#scene3d'); return c ? 0 : 0; });
await p.mouse.move(688, 400);
await p.mouse.down();
await p.mouse.move(900, 400, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(300);
// 3) tecla 1 volta
await p.keyboard.press('1');
await p.waitForTimeout(2000);
const zona1 = await p.evaluate(() => window.__farmacheck.pov.zonaAtual?.());
console.log('zona inicial:', st0.zona, '| após tecla 2:', zona2, '| após tecla 1:', zona1);
await p.screenshot({ path: '/tmp/opencode/move_test.png' });
await b.close();
