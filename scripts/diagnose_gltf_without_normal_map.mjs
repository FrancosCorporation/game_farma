#!/usr/bin/env node
// Diagnostic-only GLB copy with normal maps detached, to isolate shading artifacts.
// Geometry, UVs, base-color texture, skin, bind pose, and animations are preserved.
// Usage: node scripts/diagnose_gltf_without_normal_map.mjs <input.glb> <output.glb>
import { stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/diagnose_gltf_without_normal_map.mjs <input.glb> <output.glb>');
  process.exit(input ? 0 : 2);
}
await stat(input);
try {
  await stat(output);
  throw new Error(`saída já existe; escolha outro caminho: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const materials = doc.getRoot().listMaterials();
let removed = 0;
const report = materials.map((material) => {
  const texture = material.getNormalTexture();
  if (texture) { material.setNormalTexture(null); removed++; }
  return { name: material.getName(), normalMapDetached: Boolean(texture), normalScale: material.getNormalScale() };
});
if (!removed) throw new Error('nenhum material tinha normal map; cópia diagnóstica não foi escrita');
await io.write(output, doc);
console.log(JSON.stringify({ input, output, detachedNormalMaps: removed, materials: report }, null, 2));
