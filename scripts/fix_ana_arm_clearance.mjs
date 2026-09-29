// fix_ana_arm_clearance.mjs — braço fora da coxa no idle (PO 26/09: "o braço
// esquerdo entra pra dentro da perna quando parada"): bake de 4° de abdução
// (delta LOCAL medido no navegador pelo tmp_arm_delta.tmp.mjs — cotovelos
// +3,1 cm p/ fora, simétrico) em TODAS as chaves dos canais LeftArm/RightArm
// do IDLE. Determinístico — nada de runtime. + walkSpeed=1,68 (cadência
// natural do clip: mata o "deslizar" — timeScale 1.0, passo-e-anda).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2] || 'public/models/ana_coriza.glb';
const BACKUP = '/tmp/opencode/ana_coriza_pre_armclearance.glb';
const DELTAS = {
  // 6,5° (PO 26/09: "a mão esquerda ainda tá pouco dentro da coxa") —
  // medidos a 4° no probe e escalados ×1,625 (pequeno ângulo ≈ linear)
  'mixamorig:LeftArm': [-0.05454, 0.01193, -0.01002, 0.99838],
  'mixamorig:RightArm': [-0.05536, -0.00873, 0.00865, 0.99838],
};

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(FILE);
const root = doc.getRoot();
const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
if (!idle) throw new Error('Idle ausente');

const qmul = (a, b) => {
  const n = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
  return n([
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]);
};

for (const [bone, conv] of Object.entries(DELTAS)) {
  const c = idle.listChannels().find((x) => x.getTargetPath() === 'rotation' && x.getTargetNode()?.getName() === bone);
  if (!c) throw new Error('canal ausente: ' + bone);
  const arr = c.getSampler().getOutput().getArray();
  const n = arr.length / 4;
  for (let k = 0; k < n; k++) {
    const q = [arr[k * 4], arr[k * 4 + 1], arr[k * 4 + 2], arr[k * 4 + 3]];
    const nq = qmul(conv, q); // premultiply: conv ⊗ q (igual ao probe)
    for (let j = 0; j < 4; j++) arr[k * 4 + j] = nq[j];
  }
  console.log(`[arm-fix] Idle ${bone.replace('mixamorig:', '')}: ${n} chaves com abdução local (+3,1 cm no cotovelo)`);
}

// walkSpeed = velocidade NATURAL do clip (advance/duração) → timeScale 1.0
const asset = root.getAsset();
const ex = { ...((typeof asset.getExtras === 'function' ? asset.getExtras() : asset.extras) || {}) };
ex.walkSpeed = Number((ex.walkAdvance / 1.0333).toFixed(3));
if (typeof asset.setExtras === 'function') asset.setExtras(ex); else asset.extras = ex;
console.log(`[arm-fix] walkSpeed=${ex.walkSpeed} (natural; timeScale será 1.0 — sem deslizar)`);

if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
await io.write(FILE, doc);
console.log(`[arm-fix] OK: ${FILE}`);
