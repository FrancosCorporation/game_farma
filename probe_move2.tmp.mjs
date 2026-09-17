import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1376, height: 768 } });
await p.goto('http://127.0.0.1:4174/', { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.__farmacheck === 'object', { timeout: 20000 });
await p.evaluate(() => { document.getElementById('capa-iniciar').click(); });
await p.waitForTimeout(300);
await p.evaluate(() => { document.getElementById('btn-iniciar').click(); });
await p.waitForTimeout(1500);
const pos = () => p.evaluate(() => { const c = window.__farmacheck.camera.position; return [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)]; });
const zona = () => p.evaluate(() => window.__farmacheck.pov.zonaAtual());
console.log('inicial:', JSON.stringify(await pos()), 'zona:', await zona());
// segura W por 1.2s
await p.keyboard.down('w');
await p.waitForTimeout(1200);
await p.keyboard.up('w');
await p.waitForTimeout(200);
console.log('após W :', JSON.stringify(await pos()), 'zona:', await zona());
// segura A por 0.8s
await p.keyboard.down('a');
await p.waitForTimeout(800);
await p.keyboard.up('a');
await p.waitForTimeout(200);
console.log('após A :', JSON.stringify(await pos()));
// zona 2 ainda funciona?
await p.keyboard.press('2');
await p.waitForTimeout(2500);
console.log('após 2 :', JSON.stringify(await pos()), 'zona:', await zona());
// digitando no chat não anda
await p.evaluate(() => document.getElementById('chat-input').focus());
await p.keyboard.type('w');
await p.waitForTimeout(600);
const inp = await p.evaluate(() => document.getElementById('chat-input').value);
console.log('digitou no chat:', JSON.stringify(inp), '| pos:', JSON.stringify(await pos()));
await p.screenshot({ path: '/tmp/opencode/move2.png' });
await b.close();
