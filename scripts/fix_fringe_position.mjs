// fix_fringe_position.mjs — SÓ MUDA POSIÇÃO dos vértices da franja (y>0.06 no
// head box) para y≈0.02 (atrás da linha da testa). SEM tocar em pesos, SEM
// Blender, SEM re-derivar o rig. A fórmula de skinning fica intacta.
// Uso: node scripts/fix_fringe_position.mjs [glb]
import { NodeIO, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, existsSync } from 'node:fs';

const FILE = process.argv[2] || 'public/models/ana_coriza.glb';
const BACKUP = '/media/servidor/nvme_data/scratch/ana_pre_fringe_pos.glb';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(FILE);
const root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0];
const posAcc = prim.getAttribute('POSITION');
const arr = Float32Array.from(posAcc.getArray());
const n = posAcc.getCount();

// frame de bind: z=altura (0.34-0.85), y=frente-trás (±0.165), x=lado (±0.177)
// franja: z>0.74 (altura da cabeça), y>0.055 (à frente da testa), |x|<0.14
// pele da testa: y≈0.02-0.04; a franja deve assentar em y≈0.02-0.03
let moved = 0;
for (let i = 0; i < n; i++) {
  const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
  if (z > 0.74 && y > 0.055 && Math.abs(x) < 0.14) {
    // empurra a franja pra trás (y = frente): achatada p/ 0.025 (atrás da testa)
    arr[i * 3 + 1] = Math.min(y, 0.025);
    moved++;
  }
}

// substitui o accessor de POSITION
const novo = doc.createAccessor().setType(Accessor.Type.VEC3).setArray(arr);
prim.setAttribute('POSITION', novo);
posAcc.dispose();

console.log(`[fringe-pos] ${moved} vértices movidos (y achatado para 0.025)`);
if (!existsSync(BACKUP)) copyFileSync(FILE, BACKUP);
await io.write(FILE, doc);
console.log(`[fringe-pos] OK: ${FILE} — SEM tocar em pesos (rig intacto)`);
