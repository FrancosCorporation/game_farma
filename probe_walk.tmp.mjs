import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1376, height: 768 } });
await p.goto('http://127.0.0.1:4174/', { waitUntil: 'load' });
await p.waitForFunction(() => typeof window.__farmacheck === 'object', { timeout: 20000 });
await p.evaluate(() => document.getElementById('capa-iniciar').click());
await p.waitForTimeout(400);
await p.evaluate(() => document.getElementById('btn-iniciar').click());
const samples = [];
for (let i = 0; i < 32; i++) {
  await p.waitForTimeout(300);
  const s = await p.evaluate(() => {
    try {
      const av = window.__farmacheck?.game?.avatar;
      const root = av?.getModel?.()?.parent;
      const st = window.__farmacheck?.game?.state;
      return root ? { x: +root.position.x.toFixed(2), z: +root.position.z.toFixed(2), st } : { x: null, st };
    } catch { return { x: null }; }
  });
  samples.push(s);
}
console.log(samples.map(s => `${s.x},${s.z}`).join(' | '));
console.log('estado final:', samples[samples.length-1].st);
await b.close();
