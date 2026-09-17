import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/opencode/capa_shots';
const URL = process.argv[3] || 'http://127.0.0.1:4174/';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
const bad = [];
p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().split('/').pop()}`); });

const fresh = async () => {
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.__farmacheck === 'object', { timeout: 20000 });
  await p.waitForTimeout(500);
};
async function center(sel) {
  return await p.$eval(sel, (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
  });
}
async function press(sel, name, after = 0) {
  const c = await center(sel);
  await p.mouse.move(c.x, c.y);
  await p.mouse.down();
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.mouse.up();
  await p.waitForTimeout(after);
  return c;
}

await fresh();
await p.screenshot({ path: `${OUT}/01_rest.png` });
const r1 = await press('#capa-iniciar', '02_press_iniciar', 0);

await fresh();
const r2 = await press('#capa-lang-en', '03_press_en', 700);
await p.screenshot({ path: `${OUT}/04_en_active.png` });

await fresh();
await p.screenshot({ path: `${OUT}/05_rest_again.png` });
const r3 = await press('#capa-refs', '06_press_refs', 0);

console.log('rects:', JSON.stringify({ iniciar: r1, chipEn: r2, refs: r3 }));
console.log('erros:', errs.length ? errs.join(' | ') : 'nenhum');
console.log('404s:', bad.length ? bad.join(', ') : 'nenhum');


// ---- teclado ----
await fresh();
const seq = [];
for (let i = 0; i < 8; i++) {
  await p.keyboard.press('Tab');
  seq.push(await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
  if (seq[seq.length - 1] === 'capa-lang-en') break;
}
console.log('kbd sequência:', seq.join(' → '));
await p.screenshot({ path: `${OUT}/07_focus.png` });
await p.keyboard.press('Space');
await p.waitForTimeout(500);
console.log('kbd: Space no último foco → lang=' + (await p.evaluate(() => document.documentElement.lang)));
// Enter no iniciar (via foco programático + teclado)
await fresh();
await p.evaluate(() => document.getElementById('capa-iniciar').focus());
await p.keyboard.press('Enter');
await p.waitForTimeout(800);
console.log('kbd: Enter no iniciar abriu menu=' + (await p.evaluate(() => !document.getElementById('menu').hidden)));
await p.screenshot({ path: `${OUT}/08_kbd_en.png` });
await b.close();
