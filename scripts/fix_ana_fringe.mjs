// fix_ana_fringe.mjs — "testa caída sobre o rosto" (PO 26/09): a franja/
// cabelo frontal (3.166 vértices) tinham 32% do peso em Spine2 + 3% ombros —
// na marcha o Spine2 balança com o quadril e ARRASTA a franja sobre os olhos.
// Fix: vértices da caixa da cabeça (bind z>0,70, y>−0,04, |x|<0,15) → 100%
// mixamorig:Head. Padrão comprovado do fix_ana_armpits (accessor novo + set).
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2] || 'public/models/ana_coriza.glb';
const BACKUP = '/tmp/opencode/ana_coriza_pre_fringefix.glb';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(FILE);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = skin.listJoints().map((j) => j.getName());
const headIdx = joints.indexOf('mixamorig:Head');
if (headIdx < 0) throw new Error('mixamorig:Head não está nos joints');
const prim = root.listMeshes()[0].listPrimitives()[0];
const jAcc = prim.getAttribute('JOINTS_0');
const wAcc = prim.getAttribute('WEIGHTS_0');
const jArr = jAcc.getArray();
const wArr = Float32Array.from(wAcc.getArray());
const pos = prim.getAttribute('POSITION').getArray();
const n = wAcc.getCount();

let tocados = 0;
for (let i = 0; i < n; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  // caixa da cabeça: franja + laterais até a linha da orelha
  if (!(z > 0.70 && y > -0.04 && Math.abs(x) < 0.15)) continue;
  let maxW = 0, maxK = 0;
  for (let k = 0; k < 4; k++) if (wArr[i * 4 + k] > maxW) { maxW = wArr[i * 4 + k]; maxK = k; }
  const curBest = joints[jArr[i * 4 + maxK]];
  if (curBest === 'mixamorig:Head' && maxW > 0.995) continue; // já é Head puro
  wArr[i * 4] = 0; wArr[i * 4 + 1] = 0; wArr[i * 4 + 2] = 0; wArr[i * 4 + 3] = 0;
  // ocupa o slot 0 (joint do Head), peso 1
  jArr[i * 4] = headIdx;
  wArr[i * 4] = 1;
  tocados++;
}
console.log(`[fringe-fix] vértices reweightados p/ Head 100%: ${tocados}`);

// JOINTS_0 pode precisar de novo accessor também (mutamos jArr — verificação)
const jNovo = doc.createAccessor().setType(Accessor.Type.VEC4).setArray(Uint16Array.from(jArr));
prim.setAttribute('JOINTS_0', jNovo);
jAcc.dispose();
const wNovo = doc.createAccessor().setType(Accessor.Type.VEC4).setArray(wArr);
prim.setAttribute('WEIGHTS_0', wNovo);
wAcc.dispose();

// self-check: massa por osso na caixa pós-fix
const jArr2 = prim.getAttribute('JOINTS_0').getArray();
const wArr2 = prim.getAttribute('WEIGHTS_0').getArray();
const tally = {};
let cnt = 0;
for (let i = 0; i < n; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  if (!(z > 0.70 && y > -0.04 && Math.abs(x) < 0.15)) continue;
  cnt++;
  for (let k = 0; k < 4; k++) {
    const w = wArr2[i * 4 + k];
    if (w > 0.001) tally[joints[jArr2[i * 4 + k]]] = (tally[joints[jArr2[i * 4 + k]]] || 0) + w;
  }
}
const tot = Object.values(tally).reduce((s, v) => s + v, 0);
console.log('[fringe-fix] pós-fix, massa na caixa da cabeça:');
for (const [b, w] of Object.entries(tally).sort((a, c) => c[1] - a[1]).slice(0, 4)) {
  console.log(`  ${b.padEnd(24)} ${(100 * w / tot).toFixed(1)}%`);
}
if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
await io.write(FILE, doc);
console.log(`[fringe-fix] OK: ${FILE}`);
