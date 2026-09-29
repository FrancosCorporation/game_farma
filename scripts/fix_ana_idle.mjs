// fix_ana_idle.mjs — corrige o clip IDLE do ana_coriza.glb (PO 25/09 noite):
//   1. POSTURA ERETA: a cadeia Spine tinha média de roll ~+6° acumulado
//      ("ela para e fica pendurada p/ um lado") → recentra Spine/Spine1/Spine2
//      pela média de Karcher (remove o tilt estático, mantém a oscilação de
//      respiração).
//   2. CABEÇA LENTA (PO: "a cabeça por completo mexendo seria bom, mas bem
//      devagar" — o incômodo era o tremido RÁPIDO na testa/couro cabeludo):
//      substitui o wobble rápido do mocap (~0,8° @ ~1-2 Hz) por um balanço
//      lento sintetizado: yaw ±3° com período = 1 ciclo por DURAÇÃO do clip,
//      pitch ±1,5° @ dur/2, roll ±1° @ dur/3 — períodos que DIVIDEM a duração
//      → loop sem salto. Neck carrega 35% do mesmo balanço (movimento
//      "inteiro", não só no pivô do crânio); HeadTop_End herda pela hierarquia.
// Padrão seguro (findings §8): snapshot de TODOS os canais → dispose único do
// Idle → reconstrução. SEM meshopt()/prune (dequantiza errado este asset).
// Uso: node scripts/fix_ana_idle.mjs [glb]
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2] || 'public/models/ana_coriza.glb';
const BACKUP = '/tmp/opencode/ana_coriza_pre_idlefix.glb';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// ---------- quat utils (mesmas do fix_ana_walk_mocap) ----------
const qn = (q) => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
const qmul = (a, b) => qn([
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]);
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const qang = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(qdot(a, b)))) * 180) / Math.PI;
const qmean = (qs) => {
  const n = qs.length;
  let s = [0, 0, 0, 0];
  for (const q of qs) for (let k = 0; k < 4; k++) s[k] += q[k];
  let m = qn(s.map((v) => v / n));
  for (let it = 0; it < 8; it++) {
    s = [0, 0, 0, 0];
    for (const q of qs) {
      const sg = qdot(q, m) >= 0 ? 1 : -1;
      for (let k = 0; k < 4; k++) s[k] += sg * q[k];
    }
    m = qn(s.map((v) => v / n));
  }
  return m;
};
const eulerYXZ = (q) => {
  const [x, y, z, w] = q;
  const yaw = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
  const roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return { yaw: yaw * 180 / Math.PI, pitch: pitch * 180 / Math.PI, roll: roll * 180 / Math.PI };
};

const doc = await io.read(FILE);
const root = doc.getRoot();
const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
if (!idle) throw new Error('clip Idle ausente');

const RECENTER = ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'];
// Neck com 0 (PO 26/09: cabelo abaixo da orelha direita entrava no rosto —
// hair pesado no Neck acompanhava o sway e atravessava a bochecha; o
// "cabeça inteira devagar" continua pelo Head, que carrega 100%)
const SWAY = { 'mixamorig:Neck': 0, 'mixamorig:Head': 1.0 }; // bone → fração do balanço
const FREEZE = ['mixamorig:HeadTop_End']; // herda o balanço pela hierarquia

// ---------- 1. snapshot ----------
const snap = [];
for (const c of idle.listChannels()) {
  const bone = c.getTargetNode()?.getName();
  if (!bone) continue;
  snap.push({
    bone, path: c.getTargetPath(),
    interp: c.getSampler().getInterpolation(),
    times: Array.from(c.getSampler().getInput().getArray()),
    vals: Array.from(c.getSampler().getOutput().getArray()),
  });
}
console.log(`[idle-fix] snapshot: ${snap.length} canais`);

// ---------- 2. transforma os alvos ----------
const quatsOf = (vals) => {
  const out = [];
  for (let i = 0; i < vals.length / 4; i++) out.push([vals[i * 4], vals[i * 4 + 1], vals[i * 4 + 2], vals[i * 4 + 3]]);
  return out;
};
for (const s of snap) {
  if (s.path !== 'rotation') continue;
  if (RECENTER.includes(s.bone)) {
    const qs = quatsOf(s.vals);
    const m = qmean(qs);
    const e = eulerYXZ(m);
    const nq = qs.map((q) => qmul(qinv(m), q));
    for (let i = 0; i < nq.length; i++) for (let k = 0; k < 4; k++) s.vals[i * 4 + k] = nq[i][k];
    console.log(`[idle-fix] ${s.bone.replace('mixamorig:', '')}: recentrado (tira média yaw ${e.yaw.toFixed(1)}° pitch ${e.pitch.toFixed(1)}° roll ${e.roll.toFixed(1)}°)`);
  } else if (s.bone in SWAY) {
    const k = SWAY[s.bone];
    const qs = quatsOf(s.vals);
    const rest = qmean(qs); // repouso: curva constante = ela mesma; já com sway = a média (idempotente)
    const dur = s.times[s.times.length - 1] - s.times[0];
    const DEG = Math.PI / 180;
    const qaxis = (ax, rad) => {
      const h = rad / 2, sn = Math.sin(h), cs = Math.cos(h);
      return ax === 'x' ? [sn, 0, 0, cs] : ax === 'y' ? [0, sn, 0, cs] : [0, 0, sn, cs];
    };
    for (let i = 0; i < qs.length; i++) {
      const ph = (s.times[i] - s.times[0]) / dur; // fase ∈ [0,1] → loop sem salto
      const yaw = 1.5 * k * DEG * Math.sin(2 * Math.PI * ph);            // 1 ciclo/duração
      const pitch = 0.5 * k * DEG * Math.sin(2 * Math.PI * 2 * ph + 1.1); // dur/2
      const roll = 0.5 * k * DEG * Math.sin(2 * Math.PI * 3 * ph + 2.3);  // dur/3
      const qsw = qmul(qmul(qaxis('x', pitch), qaxis('y', yaw)), qaxis('z', roll));
      const nw = qmul(rest, qsw);
      for (let kk = 0; kk < 4; kk++) s.vals[i * 4 + kk] = nw[kk];
    }
    console.log(`[idle-fix] ${s.bone.replace('mixamorig:', '')}: balanço lento inteiro (yaw ±${(3 * k).toFixed(1)}° @ ${dur.toFixed(1)}s · pitch ±${(1.5 * k).toFixed(1)}° @ ${(dur / 2).toFixed(1)}s · roll ±${(k).toFixed(1)}° @ ${(dur / 3).toFixed(1)}s)`);
  } else if (FREEZE.includes(s.bone)) {
    const amp0 = (() => {
      const qs = quatsOf(s.vals);
      const m = qmean(qs);
      return Math.max(...qs.map((q) => qang(m, q)));
    })();
    for (let i = 4; i < s.vals.length; i++) s.vals[i] = s.vals[i % 4]; // constante na 1ª chave
    console.log(`[idle-fix] ${s.bone.replace('mixamorig:', '')}: congelado (era ${amp0.toFixed(2)}° de oscilação)`);
  }
}

// ---------- 3. dispose + reconstrói ----------
idle.dispose();
const newIdle = doc.createAnimation('Idle');
const nodeOf = new Map(root.listNodes().map((n) => [n.getName(), n]));
const mkAcc = (arr, type) => doc.createAccessor().setType(type).setArray(Float32Array.from(arr));
for (const s of snap) {
  const node = nodeOf.get(s.bone);
  if (!node) continue;
  const size = { rotation: 4, translation: 3, scale: 3 }[s.path];
  const inp = mkAcc(s.times, Accessor.Type.SCALAR);
  const out = mkAcc(s.vals, size === 4 ? Accessor.Type.VEC4 : Accessor.Type.VEC3);
  const sampler = doc.createAnimationSampler(`${s.bone}.${s.path}.sampler`)
    .setInput(inp).setOutput(out).setInterpolation(s.interp);
  newIdle.addSampler(sampler); // sampler pertence à Animation (findings §8)
  const channel = doc.createAnimationChannel(`${s.bone}.${s.path}`)
    .setTargetPath(s.path).setTargetNode(node).setSampler(sampler);
  newIdle.addChannel(channel);
}
console.log(`[idle-fix] Idle reconstruído: ${newIdle.listChannels().length} canais`);

// ---------- 4. self-check ----------
const ampOf = (anim, bone) => {
  const c = anim.listChannels().find((x) => x.getTargetPath() === 'rotation' && x.getTargetNode()?.getName() === bone);
  if (!c) return NaN;
  const qs = quatsOf(Array.from(c.getSampler().getOutput().getArray()));
  const m = qmean(qs);
  return Math.max(...qs.map((q) => qang(m, q)));
};
const stepOf = (anim, bone) => { // passo angular máx por key (lentidão)
  const c = anim.listChannels().find((x) => x.getTargetPath() === 'rotation' && x.getTargetNode()?.getName() === bone);
  const qs = quatsOf(Array.from(c.getSampler().getOutput().getArray()));
  let st = 0;
  for (let i = 1; i < qs.length; i++) st = Math.max(st, qang(qs[i - 1], qs[i]));
  return st;
};
let bad = false;
for (const [b, faixa] of Object.entries(SWAY).map(([b, k]) => [b, b === 'mixamorig:Head' ? [0.5, 3] : [0, 0.05]])) {
  const a = ampOf(newIdle, b), st = stepOf(newIdle, b);
  if (a < faixa[0] || a > faixa[1] || st > 0.2) { console.error(`  FAIL ${b}: amp ${a.toFixed(2)}° (faixa ${faixa}) passo ${st.toFixed(3)}°/key (tol 0.2)`); bad = true; }
  else console.log(`  ok ${b.replace('mixamorig:', '')}: amp ${a.toFixed(2)}° · passo máx ${st.toFixed(3)}°/key (lento)`);
}
for (const b of FREEZE) {
  const a = ampOf(newIdle, b);
  if (a > 0.01) { console.error(`  FAIL ${b}: ${a.toFixed(3)}° (esperado 0)`); bad = true; }
}
for (const b of RECENTER) {
  const c = newIdle.listChannels().find((x) => x.getTargetPath() === 'rotation' && x.getTargetNode()?.getName() === b);
  const qs = quatsOf(Array.from(c.getSampler().getOutput().getArray()));
  const e = eulerYXZ(qmean(qs));
  if (Math.abs(e.roll) > 0.5 || Math.abs(e.pitch) > 0.5) { console.error(`  FAIL ${b}: média residual yaw/pitch/roll ${e.yaw.toFixed(1)}/${e.pitch.toFixed(1)}/${e.roll.toFixed(1)}°`); bad = true; }
  else console.log(`  ok ${b.replace('mixamorig:', '')}: média residual roll ${e.roll.toFixed(2)}°`);
}
if (bad) { console.error('[idle-fix] ABORTANDO (self-check)'); process.exit(1); }

// ---------- 5. backup + write ----------
if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
await io.write(FILE, doc);
console.log(`[idle-fix] OK: ${FILE} (Idle: postura ereta + cabeça parada)`);
