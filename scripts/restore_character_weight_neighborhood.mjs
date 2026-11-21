// Restores selected skin weights from a reference GLB across a small topology
// neighborhood, writing a separate candidate. Geometry/rig/clips stay fixed.
// Usage: node scripts/restore_character_weight_neighborhood.mjs candidate.glb reference.glb output.glb vertexIdsCsv [rings=1]
import { createHash } from 'node:crypto';
import { access, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [candidatePath, referencePath, outputPath, verticesCsv, ringsArg = '1'] = process.argv.slice(2);
if (!candidatePath || !referencePath || !outputPath || !verticesCsv || resolve(outputPath) === resolve(candidatePath) || resolve(outputPath) === resolve(referencePath)) {
  throw new Error('Usage: node scripts/restore_character_weight_neighborhood.mjs candidate.glb reference.glb output.glb vertexIdsCsv [rings=1]');
}
const seeds = [...new Set(verticesCsv.split(',').map(Number))];
const rings = Number(ringsArg);
if (!seeds.length || seeds.some((v) => !Number.isInteger(v) || v < 0) || !Number.isInteger(rings) || rings < 0 || rings > 8) {
  throw new Error('vertexIdsCsv/rings inválidos');
}
try { await access(outputPath); throw new Error(`Output exists: ${outputPath}`); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const candidate = await io.read(candidatePath);
const reference = await io.read(referencePath);
const getSinglePrimitive = (doc, label) => {
  const nodes = doc.getRoot().listNodes().filter((node) => node.getSkin() && node.getMesh());
  const primitives = nodes.flatMap((node) => node.getMesh().listPrimitives());
  if (nodes.length !== 1 || primitives.length !== 1 || doc.getRoot().listSkins().length !== 1) {
    throw new Error(`${label}: esperado um único skinned mesh, skin e primitive`);
  }
  return { node: nodes[0], primitive: primitives[0], skin: nodes[0].getSkin() };
};
const candidateParts = getSinglePrimitive(candidate, 'candidate');
const referenceParts = getSinglePrimitive(reference, 'reference');
const hash = (array) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const documentSignature = (doc) => JSON.stringify({
  nodes: doc.getRoot().listNodes().map((item) => [item.getName(), item.getTranslation(), item.getRotation(), item.getScale(), item.listChildren().map((child) => child.getName())]),
  skins: doc.getRoot().listSkins().map((skin) => [skin.listJoints().map((joint) => joint.getName()), hash(skin.getInverseBindMatrices().getArray())]),
  clips: doc.getRoot().listAnimations().map((animation) => [animation.getName(), animation.listChannels().map((channel) => [channel.getTargetNode().getName(), channel.getTargetPath(), channel.getSampler().getInterpolation(), hash(channel.getSampler().getInput().getArray()), hash(channel.getSampler().getOutput().getArray())])]),
  meshes: doc.getRoot().listMeshes().map((mesh) => mesh.listPrimitives().map((primitive) => [
    primitive.getMode(),
    primitive.getIndices() ? hash(primitive.getIndices().getArray()) : null,
    primitive.listSemantics().filter((semantic) => !['JOINTS_0', 'WEIGHTS_0'].includes(semantic)).map((semantic) => [semantic, hash(primitive.getAttribute(semantic).getArray())]),
  ])),
  materials: doc.getRoot().listMaterials().map((material) => [material.getName(), material.getBaseColorFactor(), material.getRoughnessFactor(), material.getMetallicFactor(), material.getDoubleSided()]),
  textures: doc.getRoot().listTextures().map((texture) => hash(texture.getImage())),
});

if (documentSignature(candidate) !== documentSignature(reference)) {
  throw new Error('candidate/reference diferem fora de JOINTS_0/WEIGHTS_0');
}
const cp = candidateParts.primitive, rp = referenceParts.primitive;
const cJoints = cp.getAttribute('JOINTS_0'), cWeights = cp.getAttribute('WEIGHTS_0');
const rJoints = rp.getAttribute('JOINTS_0'), rWeights = rp.getAttribute('WEIGHTS_0');
const position = cp.getAttribute('POSITION'), indices = cp.getIndices();
if (!cJoints || !cWeights || !rJoints || !rWeights || !position || !indices || cWeights.getCount() !== position.getCount() || rWeights.getCount() !== position.getCount()) {
  throw new Error('POSITION/JOINTS_0/WEIGHTS_0/indices incompatíveis');
}
const count = position.getCount();
if (seeds.some((id) => id >= count)) throw new Error(`seed fora da malha de ${count} vértices`);
const adjacency = Array.from({ length: count }, () => new Set());
const triangles = indices.getArray();
for (let offset = 0; offset + 2 < triangles.length; offset += 3) {
  const face = [triangles[offset], triangles[offset + 1], triangles[offset + 2]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) adjacency[face[i]].add(face[j]);
}
let region = new Set(seeds);
for (let layer = 0; layer < rings; layer++) {
  const expanded = new Set(region);
  for (const vertex of region) for (const neighbor of adjacency[vertex]) expanded.add(neighbor);
  region = expanded;
}

const oldJointArray = cJoints.getArray().slice();
const oldWeightArray = cWeights.getArray().slice();
const nextJoints = oldJointArray.slice();
const nextWeights = oldWeightArray.slice();
let restoredVertices = 0;
const restored = [];
for (const vertex of region) {
  let differs = false;
  for (let slot = 0; slot < 4; slot++) {
    const offset = vertex * 4 + slot;
    if (oldJointArray[offset] !== rJoints.getArray()[offset] || oldWeightArray[offset] !== rWeights.getArray()[offset]) differs = true;
    nextJoints[offset] = rJoints.getArray()[offset];
    nextWeights[offset] = rWeights.getArray()[offset];
  }
  if (differs) { restoredVertices++; restored.push(vertex); }
}
if (!restoredVertices) throw new Error('nenhum peso diferente na vizinhança selecionada');
cJoints.setArray(nextJoints);
cWeights.setArray(nextWeights);

const staging = `${outputPath}.staging.glb`;
await io.write(staging, candidate);
const reread = await io.read(staging);
const rereadPrimitive = getSinglePrimitive(reread, 'serialized candidate').primitive;
if (documentSignature(reread) !== documentSignature(await io.read(candidatePath)) || hash(rereadPrimitive.getAttribute('JOINTS_0').getArray()) !== hash(nextJoints) || hash(rereadPrimitive.getAttribute('WEIGHTS_0').getArray()) !== hash(nextWeights)) {
  throw new Error('candidate serializado falhou na verificação de invariantes');
}
await rename(staging, outputPath);
const report = {
  candidate: resolve(candidatePath),
  reference: resolve(referencePath),
  output: resolve(outputPath),
  seeds,
  topologyRings: rings,
  verticesInNeighborhood: region.size,
  restoredVertices,
  restoredVertexIndices: restored,
  meshBindClipsMaterialsAndTexturesUnchanged: true,
};
await (await import('node:fs/promises')).writeFile(`${outputPath}.audit.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
