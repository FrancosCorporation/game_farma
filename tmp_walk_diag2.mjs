// tmp_walk_diag2.mjs — diagnóstico do clip Walk com DETECÇÃO DE EIXOS (não assume
// referencial): mede hips→ankle (detecta unidade), classifica vertical/sagital/lateral
// pela amplitude, e reporta passada, straddle, excursão e extensão da perna.
// Uso: node tmp_walk_diag2.mjs [arquivo.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Matrix4, Quaternion, Vector3 } from 'three';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const FILE = process.argv[2] || 'public/models/ana_coriza.glb';
const doc = await io.read(FILE);
const root = doc.getRoot();
const nodes = root.listNodes();
const byName = new Map(nodes.map((n) => [n.getName(), n]));
const parent = new Map();
for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);
const order = []; const seen = new Set();
const visit = (n) => { if (seen.has(n)) return; seen.add(n); order.push(n); for (const c of n.listChildren()) visit(c); };
for (const s of root.listScenes()) for (const c of s.listChildren()) visit(c);
for (const n of nodes) visit(n);

const anim = root.listAnimations().find((a) => /walk/i.test(a.getName())) || root.listAnimations()[0];
const chanOf = new Map();
for (const ch of anim.listChannels()) {
  const t = ch.getTargetNode(); if (!t) continue;
  const e = chanOf.get(t) || {};
  e[ch.getTargetPath()] = {
    times: Float32Array.from(ch.getSampler().getInput().getArray()),
    values: Float32Array.from(ch.getSampler().getOutput().getArray()),
  };
  chanOf.set(t, e);
}
let dur = 0;
for (const e of chanOf.values()) for (const c of Object.values(e)) dur = Math.max(dur, c.times[c.times.length - 1]);

const _q0 = new Quaternion(), _q1 = new Quaternion(), _qo = new Quaternion();
const sampleInto = (ch, t, out) => {
  const T = ch.times, V = ch.values, n = T.length;
  const tc = Math.min(T[n - 1], Math.max(T[0], t));
  let j = 0; while (j < n - 2 && T[j + 1] <= tc) j++;
  const f = (tc - T[j]) / Math.max(1e-9, T[j + 1] - T[j]);
  if (out.length === 4) {
    _q0.set(V[j * 4], V[j * 4 + 1], V[j * 4 + 2], V[j * 4 + 3]);
    _q1.set(V[(j + 1) * 4], V[(j + 1) * 4 + 1], V[(j + 1) * 4 + 2], V[(j + 1) * 4 + 3]);
    _qo.copy(_q0).slerp(_q1, f);
    out[0] = _qo.x; out[1] = _qo.y; out[2] = _qo.z; out[3] = _qo.w;
  } else for (let k = 0; k < out.length; k++) out[k] = V[j * out.length + k] * (1 - f) + V[(j + 1) * out.length + k] * f;
};
const _p = new Vector3(), _s = new Vector3(), _q = new Quaternion(), _m = new Matrix4();
const worldAt = (t) => {
  const world = new Map();
  const trs = [new Array(3), new Array(4), new Array(3)];
  for (const n of order) {
    const e = chanOf.get(n);
    if (e?.translation) { sampleInto(e.translation, t, trs[0]); _p.fromArray(trs[0]); } else _p.fromArray(n.getTranslation());
    if (e?.rotation) { sampleInto(e.rotation, t, trs[1]); _q.fromArray(trs[1]); } else _q.fromArray(n.getRotation());
    if (e?.scale) { sampleInto(e.scale, t, trs[2]); _s.fromArray(trs[2]); } else _s.fromArray(n.getScale());
    _m.compose(_p, _q, _s);
    const pm = parent.get(n) ? world.get(parent.get(n)) : null;
    world.set(n, pm ? pm.clone().multiply(_m) : _m.clone());
  }
  return world;
};
const posOf = (w, name) => {
  const n = byName.get(name); const m = n && w.get(n);
  return m ? new Vector3().setFromMatrixPosition(m) : null;
};

// ---------- amostragem ----------
const N = 181;
const S = [];
for (let i = 0; i < N; i++) {
  const t = (i / (N - 1)) * dur;
  const w = worldAt(t);
  S.push({
    t, w,
    hips: posOf(w, 'mixamorig:Hips'),
    L: posOf(w, 'mixamorig:LeftFoot'), R: posOf(w, 'mixamorig:RightFoot'),
    TL: posOf(w, 'mixamorig:LeftToeBase'), TR: posOf(w, 'mixamorig:RightToeBase'),
    kL: posOf(w, 'mixamorig:LeftLeg'), kR: posOf(w, 'mixamorig:RightLeg'),
    head: posOf(w, 'mixamorig:HeadTop_End'),
  });
}
const get = (f) => S.map(f);
const rng = (v) => ({ min: Math.min(...v), max: Math.max(...v), range: Math.max(...v) - Math.min(...v) });
const AX = ['x', 'y', 'z'];
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

const legLen = mean(get((s) => s.hips.distanceTo(s.L)));
const toM = legLen > 10 ? 0.01 : 1;
console.log(`\n=== ${FILE} · clip "${anim.getName()}" dur=${dur.toFixed(3)}s`);
console.log(`unidade: hips→ankle=${legLen.toFixed(2)}${legLen > 10 ? 'cm' : 'm'} (${(legLen * toM).toFixed(3)} m; humano ~0,90)`);
const hipsY = mean(get((s) => s.hips.y)) * toM;
console.log(`quadril: y=${hipsY.toFixed(3)} m; Δ=[${AX.map((a) => (rng(get((s) => s.hips[a])).range * toM * 100).toFixed(1) + 'cm').join(', ')}]`);

// eixo vertical = direção Hips→HeadTop_End (robusto); horizontais = os outros 2
const upDirs = AX.map((a) => Math.abs(mean(get((s) => s.head[a] - s.hips[a]))));
const vAx = AX[upDirs.indexOf(Math.max(...upDirs))];
const rel = { L: {}, R: {} };
for (const a of AX) { rel.L[a] = rng(get((s) => s.L[a] - s.hips[a])); rel.R[a] = rng(get((s) => s.R[a] - s.hips[a])); }
const horizAx = AX.filter((a) => a !== vAx);
const sAx = horizAx.reduce((a, b) => (Math.max(rel.L[a].range, rel.R[a].range) >= Math.max(rel.L[b].range, rel.R[b].range) ? a : b));
const lAx = horizAx.find((a) => a !== sAx);
console.log(`eixos: vertical=${vAx} sagital=${sAx} lateral=${lAx} (ranges dos pés=[${AX.map((a) => (Math.max(rel.L[a].range, rel.R[a].range) * toM * 100).toFixed(1) + 'cm').join(', ')}])`);

const stride = get((s) => Math.abs(s.L[sAx] - s.R[sAx]));
const straddle = get((s) => Math.abs(s.L[lAx] - s.R[lAx]));
const gapV = get((s) => Math.abs(s.L[vAx] - s.R[vAx]));
const lowV = Math.min(...get((s) => s.L[vAx]).concat(get((s) => s.R[vAx])));
console.log('── passada (metros)');
console.log(`stride máx entre pés (frente-trás) = ${(Math.max(...stride) * toM).toFixed(3)} m  [humano 0,6–0,75]`);
console.log(`straddle máx entre pés (lateral)  = ${(Math.max(...straddle) * toM).toFixed(3)} m  [humano 0,10–0,20]`);
console.log(`excursão frente-trás do pé L=${(rel.L[sAx].range * toM * 100).toFixed(1)} cm R=${(rel.R[sAx].range * toM * 100).toFixed(1)} cm (step length)`);
console.log(`excursão vertical do pé  L=${(rel.L[vAx].range * toM * 100).toFixed(1)} cm R=${(rel.R[vAx].range * toM * 100).toFixed(1)} cm [swing humano ~15–25]`);
console.log(`pé mais baixo=${(lowV * toM).toFixed(3)} m; Δvertical entre pés máx=${(Math.max(...gapV) * toM * 100).toFixed(1)} cm`);
console.log(`joelho mais baixo=${(Math.min(...get((s) => s.kL[vAx]).concat(get((s) => s.kR[vAx]))) * toM).toFixed(3)} m (humano ~0,45–0,50)`);

// avanço implicado (pé plantado recuando no frame do quadril)
const tol = 0.5; // tolerância de contato (cm se rig em cm, m se em m)
let advL = 0, advR = 0;
for (const f of ['L', 'R']) {
  const vs = get((s) => s[f][vAx]);
  const minY = Math.min(...vs);
  let travel = 0, prev = null;
  for (const s of S) {
    const planted = s[f][vAx] < minY + tol;
    const z = s[f][sAx] - s.hips[sAx];
    if (planted && prev != null) travel += Math.max(0, prev - z);
    prev = planted ? z : null;
  }
  if (f === 'L') advL = travel; else advR = travel;
}
const adv = Math.max(advL, advR);
const asset = root.getAsset();
const ex = (typeof asset.getExtras === 'function' ? asset.getExtras() : asset.extras) || {};
console.log('── avanço / extras');
console.log(`implicado pelo clip: L=${(advL * toM).toFixed(3)} m R=${(advR * toM).toFixed(3)} m → ${(adv * toM).toFixed(3)} m/ciclo`);
console.log(`extras.walkAdvance=${ex.walkAdvance} walkSpeed=${ex.walkSpeed} → v_extras=${ex.walkAdvance ? (ex.walkAdvance / dur).toFixed(2) : '?'} m/s  v_implicada=${((adv * toM) / dur).toFixed(2)} m/s`);
if (ex.walkAdvance > 0) console.log(`RATIO implicado/extras=${((adv * toM) / ex.walkAdvance).toFixed(2)} (1,0 = pé plantado sem deslizar)`);
console.log(`stride/altura-quadril=${(Math.max(...stride) * toM / hipsY).toFixed(2)} [mocap natural ≈ 0,8–1,1]`);
console.log(`passos/ciclo implícitos: ${(2 * ((adv * toM) / dur) / 1).toFixed(2)} m por passo (avanço/2=${((adv * toM) / 2).toFixed(3)} m)`);
