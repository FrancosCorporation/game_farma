// Probe Option A: asset previous (visual novo + walk vivo) contra servidor local :4180
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:4180/';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000, polling: 200 });
await page.evaluate(() => document.getElementById('capa-iniciar').click());
await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 120000, polling: 300 });
await page.click('#btn-iniciar');
await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 300000, polling: 500 });
await page.screenshot({ path: 'ntr_idle.png' });
const data = await page.evaluate(async () => {
  const g = window.__farmacheck.game; const av = g.avatar; const V = av.root.position.constructor;
  const bones = {}; av.getModel().traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const names = Object.keys(bones);
  const pick = (re) => names.find((n) => re.test(n));
  const Hips = bones[pick(/hips/i)], Head = bones[pick(/head$/i)];
  const FL = bones[pick(/l.*foot/i)], FR = bones[pick(/r.*foot$/i)];
  const AL = bones[pick(/l.*arm(?!.*fore)/i) || /arml/i];
  const read = (b) => { const v = new V(); b.getWorldPosition(v); return [v.x, v.y, v.z]; };
  const DT = 1/60; const idle = [];
  for (let i = 0; i < 240; i++) { av.update(DT); if (i % 8 === 0) idle.push({ h: read(Hips), hd: read(Head) }); }
  const range = (k, j) => Math.max(...idle.map((s) => s[k][j])) - Math.min(...idle.map((s) => s[k][j]));
  const idleHips = [range('h',0), range('h',1), range('h',2)].map((x) => +x.toFixed(4));
  const idleHeadY = +(range('hd',1)).toFixed(4);
  const W = [];
  const p = av.walk(new V(-1.7, 0, 0.55), new V(1.7, 0, 0.55));
  for (let i = 0; i < 900; i++) { av.update(DT); if (i % 3 === 0) W.push({ t:(i+1)*DT, fl: read(FL), fr: read(FR) }); }
  await p.catch(() => {});
  const fRange = (f, j) => +(Math.max(...W.map((s) => s[f][j])) - Math.min(...W.map((s) => s[f][j]))).toFixed(3);
  const stride = +Math.max(...W.map((s) => Math.abs(s.fl[2] - s.fr[2]))).toFixed(3);
  return { bones: names.length, idleHips, idleHeadY,
    walk: { footL_y: fRange('fl',1), footR_y: fRange('fr',1), footL_x: fRange('fl',0), footR_x: fRange('fr',0),
      strideMax: stride, samples: W.length,
      footLminY: +Math.min(...W.map((s) => s.fl[1])).toFixed(3), footRminY: +Math.min(...W.map((s) => s.fr[1])).toFixed(3) } };
});
// walk em tempo real p/ screenshot no meio (via rAF do jogo)
await page.evaluate(() => { const V = window.__farmacheck.game.avatar.root.position.constructor; window.__farmacheck.game.avatar.walk(new V(1.7, 0, 0.55), new V(-1.7, 0, 0.55)); });
await page.waitForTimeout(1400);
await page.screenshot({ path: 'ntr_walk.png' });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'ntr_interacao.png' });
await browser.close();
console.log(JSON.stringify(data, null, 1));
console.log('--- logs ---');
console.log(logs.filter((l) => /\[patient\]|\[glbLoader\]|\[atendente\]|pageerror/i.test(l)).join('\n'));
