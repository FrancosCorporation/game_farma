// Métricas robustas de um GLB: triângulos, altura (Y, glTF), bounds e extensões.
// Usa a API oficial @gltf-transform/core (lê quantização KHR_mesh_quantization corretamente).
// Uso: node scripts/comfy/glb_info.mjs <arquivo.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const path = process.argv[2];
if (!path) {
  console.error('uso: node scripts/comfy/glb_info.mjs <arquivo.glb>');
  process.exit(2);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(path);
const root = doc.getRoot();

let tris = 0;
let hasUV0 = true;
let hasUV1 = true;
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices();
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    tris += Math.floor((indices ? indices.getCount() : pos.getCount()) / 3);
    if (!prim.getAttribute('TEXCOORD_0')) hasUV0 = false;
    if (!prim.getAttribute('TEXCOORD_1')) hasUV1 = false;
  }
}

const scene = root.getDefaultScene() || root.listScenes()[0];
const b = getBounds(scene);
const f = (v) => Number(v.toFixed(4));

console.log(JSON.stringify({
  tris,
  height: f(b.max[1] - b.min[1]),
  min: b.min.map(f),
  max: b.max.map(f),
  uv0: hasUV0,
  uv1: hasUV1,
  extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
}));
