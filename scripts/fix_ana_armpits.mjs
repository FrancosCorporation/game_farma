// fix_ana_armpits.mjs — corrige os pesos de skin da "axila que anda com o
// braço" (PO 25/09 noite: "pedaço do corpo que estava virando a axila estava
// andando junto com o braço — divisão braço/corpo mal definida").
// Diagnóstico (tmp_weights_diag): 6.460 vértices do TRONCO (osso dominante
// Spine/Hips) tinham influência total de braço ≥0,15 (4.358 deles entre
// 0,3–0,5!) → cada balanço de braço arrastava uma laje lateral do tronco.
// Fix: nesses vértices, influência total de braço CAPADA em 0,10 e a massa
// removida renormaliza sobre os pesos de tronco já existentes (a dobra da
// axila fica no lado do BRAÇO, que continua com blend suave — não mexemos
// em vértices dominantes de braço).
// Sem meshopt()/prune (findings §8). Uso: node scripts/fix_ana_armpits.mjs [glb]
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2] || 'public/models/ana_coriza.glb';
const BACKUP = '/tmp/opencode/ana_coriza_pre_armpitfix.glb';
const CAP = 0.10;

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(FILE);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = skin.listJoints().map((j) => j.getName());
const ARM = new Set(['mixamorig:LeftArm', 'mixamorig:RightArm',
  'mixamorig:LeftForeArm', 'mixamorig:RightForeArm', 'mixamorig:LeftShoulder', 'mixamorig:RightShoulder']);
const TORSO = new Set(['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2']);

const prim = root.listMeshes()[0].listPrimitives()[0];
const jArr = prim.getAttribute('JOINTS_0').getArray();
const wAcc = prim.getAttribute('WEIGHTS_0');
const wArr = Float32Array.from(wAcc.getArray());
const n = wAcc.getCount();

const isArm = (ji) => ARM.has(joints[ji]);
const isTorso = (ji) => TORSO.has(joints[ji]);

let tocados = 0, massaMovida = 0;
const novos = new Float32Array(wArr.length);
for (let i = 0; i < n; i++) {
  const w = [wArr[i * 4], wArr[i * 4 + 1], wArr[i * 4 + 2], wArr[i * 4 + 3]];
  let armW = 0;
  const armIdx = [];
  let domK = 0;
  for (let k = 1; k < 4; k++) if (w[k] > w[domK]) domK = k; // argmax do peso
  for (let k = 0; k < 4; k++) if (isArm(jArr[i * 4 + k])) { armW += w[k]; armIdx.push(k); }
  const domIsTorso = isTorso(jArr[i * 4 + domK]);
  if (domIsTorso && armW > CAP) {
    const r = CAP / armW;
    let armSum = 0, torsoSum = 0;
    const isArmK = [false, false, false, false];
    for (let k = 0; k < 4; k++) {
      isArmK[k] = isArm(jArr[i * 4 + k]);
      if (isArmK[k]) { w[k] *= r; armSum += w[k]; } else torsoSum += w[k];
    }
    const deficit = 1 - (armSum + torsoSum);
    if (torsoSum > 1e-6) {
      for (let k = 0; k < 4; k++) if (!isArmK[k]) w[k] += deficit * (w[k] / torsoSum);
    } else w[domK] += deficit; // sem influência de tronco (não ocorre no filtro; seguro)
    for (let k = 0; k < 4; k++) novos[i * 4 + k] = w[k];
    massaMovida += armW - armSum;
    tocados++;
  } else {
    for (let k = 0; k < 4; k++) novos[i * 4 + k] = w[k];
  }
}

// self-check: renormalizado (soma 1), dragged restantes, dominantes de braço intactos
let bad = 0, draggedRestantes = 0, domArmCount = 0;
for (let i = 0; i < n; i++) {
  let soma = 0, armW = 0, domK = 0;
  for (let k = 1; k < 4; k++) if (novos[i * 4 + k] > novos[i * 4 + domK]) domK = k;
  for (let k = 0; k < 4; k++) {
    soma += novos[i * 4 + k];
    if (isArm(jArr[i * 4 + k])) armW += novos[i * 4 + k];
  }
  if (Math.abs(soma - 1) > 0.002) bad++;
  if (isTorso(jArr[i * 4 + domK]) && armW > CAP + 0.001) draggedRestantes++;
  if (armW > 0.5) domArmCount++;
}
console.log(`[armpit-fix] vértices tronco-arrastados corrigidos: ${tocados} (massa de braço removida: ${(massaMovida).toFixed(1)})`);
console.log(`[armpit-fix] self-check: soma≠1=${bad} · arrastados>CAP restantes=${draggedRestantes} · vértices de braço (armW>0.5)=${domArmCount}`);
if (bad > 0 || draggedRestantes > 0) { console.error('[armpit-fix] ABORTANDO (self-check falhou)'); process.exit(1); }

const novo = doc.createAccessor().setType(Accessor.Type.VEC4).setArray(novos);
prim.setAttribute('WEIGHTS_0', novo);
wAcc.dispose();

if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
await io.write(FILE, doc);
console.log(`[armpit-fix] OK: ${FILE} (WEIGHTS_0 reescrito; braço/corpo com divisão definida)`);
