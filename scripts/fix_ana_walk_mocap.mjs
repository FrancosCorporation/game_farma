// fix_ana_walk_mocap.mjs — restaura o clip Walk do ana_coriza.glb a partir do
// mocap cru do Mixamo (ana_merged.glb), preservando os fixes aprovados:
//   - Hips: transform M derivado do clip atual (embutia Rx(+90°) Y-up +
//     recentramento de yaw), translação pinada (in-place), yaw pélvico
//     damped a 40% (±8°).
//   - Cabeça/tronco (Spine* Neck Head HeadTop_End): canais do clip atual
//     (zerados — PO: "a testa não pode mexer").
//   - Pernas/braços/mãos/dedos: rotação MOVRADA do mocap cru (o pipeline v12b
//     havia ressintetizado quadris ±20° e amputado joelhos 27°/47°
//     assimétricos → manqueira; braços amortecidos → "travado").
//   - extras.walkAdvance regravado = deslocamento real do root no clip cru
//     (medido ANTES do pino), walkSpeed preservado.
//
// Estratégia (à prova do dispose-contaminante): (1) snapshot de TODOS os
// canais do Walk público em arrays JS puros; (2) dispose ÚNICO da animação
// Walk inteira; (3) reconstrução de canais novos a partir dos snapshots +
// mocap cru. Nada é criado antes do dispose.
//
// Uso: node scripts/fix_ana_walk_mocap.mjs [raw.glb] [pub.glb]
// Defaults: /tmp/opencode/ana_merged.glb public/models/ana_coriza.glb
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync } from 'node:fs';

const RAW_FILE = process.argv[2] || '/tmp/opencode/ana_merged.glb';
const PUB_FILE = process.argv[3] || 'public/models/ana_coriza.glb';
const BACKUP = '/tmp/opencode/ana_coriza_pre_walkfix.glb';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// ---------- quat utils ----------
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
const qslerp = (a, b, t) => {
  let d = qdot(a, b);
  let bb = b;
  if (d < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) {
    return qn([a[0] + t * (bb[0] - a[0]), a[1] + t * (bb[1] - a[1]), a[2] + t * (bb[2] - a[2]), a[3] + t * (bb[3] - a[3])]);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return qn([wa * a[0] + wb * bb[0], wa * a[1] + wb * bb[1], wa * a[2] + wb * bb[2], wa * a[3] + wb * bb[3]]);
};
const qmean = (qs) => { // média de Karcher
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
const qheading = (q) => {
  const [x, y, z, w] = q;
  const vx = 2 * (x * z + y * w);
  const vz = 1 - 2 * (x * x + y * y);
  return Math.atan2(vx, vz);
};
const qrotY = (rad) => { const h = rad / 2; return [0, Math.sin(h), 0, Math.cos(h)]; };

// ---------- docs ----------
const rawDoc = await io.read(RAW_FILE);
const pubDoc = await io.read(PUB_FILE);
const raw = rawDoc.getRoot(), pub = pubDoc.getRoot();

const rawWalk = raw.listAnimations().find((a) => a.getName() === 'Walk');
const pubWalk = pub.listAnimations().find((a) => a.getName() === 'Walk');
if (!rawWalk || !pubWalk) throw new Error('clip Walk ausente');

const ZERO_SET = new Set(['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:HeadTop_End']);
const HIPS = 'mixamorig:Hips';

const chOf = (anim, bone, path) => anim.listChannels().find((c) => c.getTargetPath() === path && c.getTargetNode()?.getName() === bone);
const timesOf = (ch) => Array.from(ch.getSampler().getInput().getArray());
const valsOf = (ch) => Array.from(ch.getSampler().getOutput().getArray());
const quatsOf = (ch) => {
  const a = valsOf(ch);
  const n = a.length / 4;
  const out = [];
  for (let i = 0; i < n; i++) out.push([a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]]);
  return out;
};

// ---------- 1. snapshot do Walk público (antes de qualquer dispose) ----------
const pubSnap = []; // {bone, path, interp, times, vals}
for (const c of pubWalk.listChannels()) {
  const bone = c.getTargetNode()?.getName();
  if (!bone) continue;
  pubSnap.push({
    bone, path: c.getTargetPath(),
    interp: c.getSampler().getInterpolation(),
    times: timesOf(c), vals: valsOf(c),
  });
}
console.log(`[fix] snapshot do Walk público: ${pubSnap.length} canais`);

// dados cru
const rawHipsRot = chOf(rawWalk, HIPS, 'rotation');
const rawHipsTra = chOf(rawWalk, HIPS, 'translation');
const T = timesOf(rawHipsRot);
const rawDur = T[T.length - 1];
const rawQ = quatsOf(rawHipsRot);

// advance = deslocamento REAL do root (eixo de maior variação) antes do pino
let advance = 0;
{
  const a = valsOf(rawHipsTra);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.length / 3; i++) for (let k = 0; k < 3; k++) {
    const v = a[i * 3 + k];
    if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
  }
  const ranges = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const axis = ranges.indexOf(Math.max(...ranges));
  advance = ranges[axis] / 100; // cru em cm → metros
  console.log(`[fix] root motion cru: eixo=${'xyz'[axis]} Δ=${ranges[axis].toFixed(1)}cm → walkAdvance=${advance.toFixed(4)} m/loop`);
}

// ---------- 2. M = transform cru→público (embutia Rx(+90°) + recentre) ----------
// Deriva do clip público (rot do Hips) × cru nas mesmas fases (fase 0% já confirmada).
{
  const snap = pubSnap.find((s) => s.bone === HIPS && s.path === 'rotation');
  const pT = snap.times, pQ = quatsOf({ getSampler: () => ({ getOutput: () => ({ getArray: () => Float32Array.from(snap.vals) }) }) });
  const pubDur = pT[pT.length - 1];
  const sampleRaw = (u) => {
    const t = u * rawDur;
    let j = 0;
    while (j < T.length - 2 && T[j + 1] <= t) j++;
    const f = (t - T[j]) / Math.max(1e-9, T[j + 1] - T[j]);
    return qslerp(rawQ[j], rawQ[j + 1], Math.min(1, Math.max(0, f)));
  };
  const Ms = pT.map((t, j) => qmul(pQ[j], qinv(sampleRaw(t / pubDur))));
  globalThis._M = qmean(Ms);
  const mDev = Math.max(...Ms.map((m) => qang(m, globalThis._M)));
  console.log(`[fix] M (cru→público) derivado de ${Ms.length} chaves; desvio máx das M_j=${mDev.toFixed(1)}° (esperado < ~15°)`);
  if (mDev > 25) { console.error('[fix] ABORTANDO: frames não batem — M instável'); process.exit(1); }
}

// ---------- 3. novo Hips: M·q_raw → recentre → yaw damp 40% ±8° ----------
let hipsNew = rawQ.map((q) => qmul(globalThis._M, q));
const meanH = qmean(hipsNew);
hipsNew = hipsNew.map((q) => qmul(qinv(meanH), q));
{
  const heads = hipsNew.map(qheading);
  let sx = 0, sz = 0;
  for (const h of heads) { sx += Math.sin(h); sz += Math.cos(h); }
  const meanYaw = Math.atan2(sx, sz);
  const LIM = (8 * Math.PI) / 180;
  hipsNew = hipsNew.map((q, i) => {
    let d = heads[i] - meanYaw;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const damped = meanYaw + Math.max(-LIM, Math.min(LIM, 0.4 * d));
    return qmul(qrotY(damped - heads[i]), q);
  });
  console.log(`[fix] Hips: recentrado (Δmédia ${qang(meanH, [0, 0, 0, 1]).toFixed(1)}° corrigida) + yaw pélvico damped 40% ±8°`);
}

// ---------- 4. dispose ÚNICO do Walk público inteiro ----------
pubWalk.dispose();
console.log('[fix] Walk público antigo (synthetic v12b) descartado inteiro');

// ---------- 5. reconstrói o Walk a partir do mocap + snapshots ----------
const newWalk = pubDoc.createAnimation('Walk');
const pubNode = new Map(pub.listNodes().map((n) => [n.getName(), n]));
const nComp = pubSnap[0].vals.length / pubSnap[0].times.length;
const mkAcc = (arr, type) => pubDoc.createAccessor().setType(type).setArray(Float32Array.from(arr));
const addCh = (bone, path, interp, times, vals) => {
  const node = pubNode.get(bone);
  if (!node) { console.warn(`[fix] node ausente: ${bone}`); return; }
  const size = { rotation: 4, translation: 3, scale: 3 }[path];
  if (vals.length / size !== times.length) throw new Error(`keys divergem em ${bone}.${path}: ${vals.length / size} vs ${times.length}`);
  const inp = mkAcc(times, Accessor.Type.SCALAR);
  const out = mkAcc(vals, size === 4 ? Accessor.Type.VEC4 : Accessor.Type.VEC3);
  const sampler = pubDoc.createAnimationSampler(`${bone}.${path}.sampler`)
    .setInput(inp).setOutput(out).setInterpolation(interp);
  newWalk.addSampler(sampler); // sampler pertence à Animation (serialização)
  const channel = pubDoc.createAnimationChannel(`${bone}.${path}`)
    .setTargetPath(path).setTargetNode(node).setSampler(sampler);
  newWalk.addChannel(channel);
};

// 5a. rotações: mocap cru (transplante) — exceto Hips (especial) e zero-set
let nMocap = 0;
for (const chR of rawWalk.listChannels()) {
  if (chR.getTargetPath() !== 'rotation') continue;
  const bone = chR.getTargetNode()?.getName();
  if (!bone || ZERO_SET.has(bone) || bone === HIPS) continue;
  addCh(bone, 'rotation', chR.getSampler().getInterpolation(), timesOf(chR), valsOf(chR));
  nMocap++;
}
// 5b. rotação do Hips (com M + recentre + damp)
addCh(HIPS, 'rotation', 'LINEAR', T, hipsNew.flat());
// 5c. zero-set: preserva os canais zerados do snapshot, RETIMADOS para a
//     duração do mocap (sem isso o clip fica 1.208s e cria zona morta de
//     ~0.17s/loop = stutter periódico no andar)
const pubDurSnap = Math.max(...pubSnap.map((s) => s.times[s.times.length - 1]));
const tScale = rawDur / pubDurSnap;
let nZero = 0;
for (const s of pubSnap) {
  if (s.path === 'rotation' && ZERO_SET.has(s.bone)) { addCh(s.bone, 'rotation', s.interp, s.times.map((t) => t * tScale), s.vals); nZero++; }
}
// 5d. translação + escala de TODOS os bones: snapshot do público, retimado
//     para a duração do mocap (a duração da animação = max input; tem que
//     casar com o timeline do mocap p/ o runtime calcular cadência certa)
let nTS = 0;
for (const s of pubSnap) {
  if (s.path === 'rotation') continue;
  const times = s.times.map((t) => t * tScale);
  addCh(s.bone, s.path, s.interp, times, s.vals);
  nTS++;
}
console.log(`[fix] Walk reconstruído: ${nMocap} rotações mocap + Hips especial + ${nZero} zero-set + ${nTS} trans/scale; total=${newWalk.listChannels().length}`);

// ---------- 6. extras ----------
const asset = pub.getAsset();
const ex = { ...((typeof asset.getExtras === 'function' ? asset.getExtras() : asset.extras) || {}) };
ex.walkAdvance = Number(advance.toFixed(4));
if (typeof asset.setExtras === 'function') asset.setExtras(ex);
else asset.extras = ex;
console.log(`[fix] extras: walkAdvance=${ex.walkAdvance} walkSpeed=${ex.walkSpeed} (preservado)`);

// ---------- 7. self-check ----------
const ampOf = (bone) => {
  const c = chOf(newWalk, bone, 'rotation');
  if (!c) return NaN;
  const qs = quatsOf(c);
  const m = qmean(qs);
  return Math.max(...qs.map((q) => qang(m, q)));
};
console.log('[fix] amplitudes finais (deviação de quat vs média):');
let firstNaN = false;
for (const b of ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm']) {
  const a = ampOf('mixamorig:' + b);
  if (!Number.isFinite(a)) firstNaN = true;
  console.log(`  ${b.padEnd(10)} ${a.toFixed(1)}°`);
}
if (firstNaN) { console.error('[fix] ABORTANDO: canal sem dados no self-check'); process.exit(1); }
const aL = ampOf('mixamorig:LeftLeg'), aR = ampOf('mixamorig:RightLeg');
const uL = ampOf('mixamorig:LeftUpLeg'), uR = ampOf('mixamorig:RightUpLeg');
if (Math.abs(aL - aR) > 4 || Math.abs(uL - uR) > 4) {
  console.error(`[fix] ABORTANDO: assimetria pós-transplant (joelhos Δ${Math.abs(aL - aR).toFixed(1)}° quadris Δ${Math.abs(uL - uR).toFixed(1)}°)`);
  process.exit(1);
}

// ---------- 8. backup + write ----------
// SEM meshopt()/prune: o transform dequantiza o POSITION quantizado
// (KHR_mesh_quantization + escala no node) com convenção errada para este
// asset (bind pose ia de ±0,186 para ±6088 = ×32767) e o prune derrubava a
// skin. io.write preserva a compressão EXT_meshopt_compression original dos
// accessors; os canais novos ficam flat (<100 KB — irrelevante).
if (!existsSync(BACKUP)) { copyFileSync(PUB_FILE, BACKUP); console.log(`[fix] backup criado: ${BACKUP}`); }
await io.write(PUB_FILE, pubDoc);
console.log(`[fix] OK: ${PUB_FILE} reescrito (Walk = mocap natural + fixes preservados)`);
