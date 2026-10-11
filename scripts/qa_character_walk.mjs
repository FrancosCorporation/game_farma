// Isolated in-game walk QA; an optional GLB path intercepts ana_clasica for candidate-only testing.
import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:4180/';
const candidatePath = process.argv[3] ? resolve(process.argv[3]) : null;
if (candidatePath && !statSync(candidatePath).isFile()) throw new Error(`candidato GLB inválido: ${candidatePath}`);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const logs = [];
let candidateServed = false;
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
if (candidatePath) {
  await page.route('**/models/ana_clasica.glb*', async (route) => {
    candidateServed = true;
    await route.fulfill({ path: candidatePath, contentType: 'model/gltf-binary', headers: { 'cache-control': 'no-store' } });
  });
}
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForFunction(() => document.documentElement.dataset.capaPronta === '1', null, { timeout: 30000, polling: 200 });
await page.evaluate(() => document.getElementById('capa-iniciar').click());
await page.waitForFunction(() => document.documentElement.dataset.jogoPronto === '1', null, { timeout: 120000, polling: 300 });
await page.waitForFunction(() => typeof window.__farmacheck?.game?.avatar?.walk === 'function', null, { timeout: 120000, polling: 300 });
if (candidatePath && !candidateServed) throw new Error('o runtime não solicitou a rota do GLB candidato');
await page.evaluate(() => {
  const av = window.__farmacheck.game.avatar;
  window.__walkTrace = [];
  const walk = av.walk;
  av.walk = function (from, to, dur, faceEnd) {
    const record = { from: from.toArray(), to: to.toArray(), dur, faceEnd, positions: [], completed: false };
    window.__walkTrace.push(record);
    const p = walk.call(this, from, to, dur, faceEnd);
    Promise.resolve(p).finally(() => {
      record.completed = true;
      record.endPosition = this.root.position.toArray();
    });
    return p;
  };
  const update = av.update;
  av.update = function (dt, t) {
    update.call(this, dt, t);
    const record = window.__walkTrace.at(-1);
    if (record && !record.completed) record.positions.push(this.root.position.toArray());
  };
});
await page.click('#btn-iniciar');
await page.waitForFunction(() => (window.__walkTrace?.[0]?.positions?.length || 0) > 10, null, { timeout: 15000, polling: 100 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'ntr_entry_walk.png' });
await page.waitForFunction(() => window.__farmacheck.game.state === 'ANAMNESE', null, { timeout: 300000, polling: 500 });
await page.screenshot({ path: 'ntr_idle.png' });
const data = await page.evaluate(async () => {
  const g = window.__farmacheck.game; const av = g.avatar; const V = av.root.position.constructor;
  const bones = {}; av.getModel().traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const names = Object.keys(bones);
  const pick = (re) => names.find((n) => re.test(n));
  const Hips = bones[pick(/hips/i)], Head = bones[pick(/head$/i)];
  const FL = bones[pick(/leftfoot$/i)], FR = bones[pick(/rightfoot$/i)];
  const read = (b) => { const v = new V(); b.getWorldPosition(v); return [v.x, v.y, v.z]; };
  const readLocal = (b) => { const v = new V(); b.getWorldPosition(v); av.root.updateMatrixWorld(true); av.root.worldToLocal(v); return [v.x, v.y, v.z]; };
  const DT = 1/60; const idle = [];
  for (let i = 0; i < 240; i++) { av.update(DT); if (i % 8 === 0) idle.push({ h: read(Hips), hd: read(Head) }); }
  const range = (k, j) => Math.max(...idle.map((s) => s[k][j])) - Math.min(...idle.map((s) => s[k][j]));
  const idleHips = [range('h',0), range('h',1), range('h',2)].map((x) => +x.toFixed(4));
  const idleHeadY = +(range('hd',1)).toFixed(4);
  const W = [];
  const start = new V(-1.7, 0, 0.55), target = new V(1.7, 0, 0.55);
  const p = av.walk(start, target);
  for (let i = 0; i < 900; i++) { av.update(DT); if (i % 3 === 0) W.push({ t:(i+1)*DT, fl: readLocal(FL), fr: readLocal(FR) }); }
  await p.catch(() => {});
  const fRange = (f, j) => +(Math.max(...W.map((s) => s[f][j])) - Math.min(...W.map((s) => s[f][j]))).toFixed(3);
  const stride = +Math.max(...W.map((s) => Math.abs(s.fl[2] - s.fr[2]))).toFixed(3);
  const rootEnd = av.root.position.distanceTo(target);
  const r = window.__walkTrace?.[0];
  const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
  const startPoint = r?.positions[0] || r?.from;
  const endPoint = r?.endPosition || r?.positions.at(-1);
  const delta = r ? r.to.map((v, i) => v - r.from[i]) : [0, 0, 0];
  const lengthSq = delta.reduce((sum, v) => sum + v * v, 0) || 1;
  const progress = r ? r.positions.map((p) => p.reduce((sum, v, i) => sum + (v - r.from[i]) * delta[i], 0) / lengthSq) : [];
  const crossTrack = r ? r.positions.map((p, j) => dist(p, r.from.map((v, i) => v + delta[i] * progress[j]))) : [];
  const entry = r ? { from:r.from, to:r.to, faceEnd:r.faceEnd, completed:r.completed,
    samples:r.positions.length, distance:Math.sqrt(lengthSq), startError:dist(startPoint,r.from),
    endError:endPoint ? dist(endPoint,r.to) : null,
    progressStart:+Math.min(...progress).toFixed(3), progressEnd:+Math.max(...progress).toFixed(3),
    crossTrackMax:+Math.max(0,...crossTrack).toFixed(4),
    monotonic:progress.every((v,i)=>i===0||v>=progress[i-1]-0.01) } : null;
  return { bones: names.length, idleHips, idleHeadY,
    entry,
    walk: { footL_y: fRange('fl',1), footR_y: fRange('fr',1), footL_x: fRange('fl',0), footR_x: fRange('fr',0),
      strideMax: stride, samples: W.length,
      footL_z: fRange('fl',2), footR_z: fRange('fr',2), rootEndError: +rootEnd.toFixed(4),
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
const failures = [];
if (!data.entry?.completed || data.entry.endError > 0.02) failures.push('entrada não concluiu no destino previsto');
if (!data.entry || data.entry.samples < 20 || data.entry.progressEnd < 0.98 || !data.entry.monotonic || data.entry.crossTrackMax > 0.04) failures.push('trajeto de entrada ausente, não monotônico ou fora do corredor');
if (data.walk.rootEndError > 0.02) failures.push('walk de teste não terminou no alvo');
if (data.walk.footL_z < 0.25 || data.walk.footR_z < 0.25 || data.walk.strideMax < 0.2) failures.push('pés sem passada alternada detectável');
if (data.idleHips.some((v) => v > 0.05)) failures.push('Idle move o Hips mais que 0,05 m no runtime');
console.log(failures.length ? `\n❌ walk QA: ${failures.join('; ')}` : '\n✅ walk QA: entrada, destino, passada e Idle OK');
process.exitCode = failures.length ? 1 : 0;
