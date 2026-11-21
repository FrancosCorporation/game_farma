import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { mkdirSync, copyFileSync } from 'node:fs';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
mkdirSync('ana_work/collection_v002/raw', { recursive: true });
for (const name of ['gondola', 'vitrine', 'mesa', 'pc', 'cpu']) {
  const path = `public/models/candidates/prop_${name}_v002.glb`;
  copyFileSync(path, `ana_work/collection_v002/raw/prop_${name}.glb`);
  const doc = await io.read(path);
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 14, quantizeTexcoord: 12 }));
  await io.write(path, doc);
  console.log('Prepared', name);
}
