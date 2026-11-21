// Remove explicitly identified deforming faces from a separate animated GLB candidate.
// Only the selected skinned primitive's index list changes; vertex data, skin, bind,
// clips, materials and textures are checked after serialization.
// Usage: node scripts/remove_character_walk_triangles.mjs input.glb output.glb faceId[,faceId...]
import { createHash } from 'node:crypto';
import { access, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, faceArgument] = process.argv.slice(2);
if (!input || !output || !faceArgument || input === '--help' || resolve(input) === resolve(output)) {
  throw new Error('Usage: node scripts/remove_character_walk_triangles.mjs input.glb output.glb faceId[,faceId...]');
}
try { await access(output); throw new Error(`Output already exists: ${output}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
const faceIds = [...new Set(faceArgument.split(',').map(Number))];
if (!faceIds.length || faceIds.some(id => !Number.isSafeInteger(id) || id < 0)) throw new Error('Face IDs must be nonnegative integers');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const root = document.getRoot();
const skinnedNode = root.listNodes().find(node => node.getSkin() && node.getMesh());
if (!skinnedNode || root.listNodes().filter(node => node.getSkin() && node.getMesh()).length !== 1) throw new Error('Expected exactly one skinned mesh node');
const mesh = skinnedNode.getMesh();
const primitive = mesh.listPrimitives()[0];
if (!primitive || primitive.getMode() !== Primitive.Mode.TRIANGLES || primitive.listTargets().length) throw new Error('Expected an indexed triangle primitive without morph targets');
const indices = primitive.getIndices()?.getArray();
const position = primitive.getAttribute('POSITION');
if (!indices || !position || indices.length % 3) throw new Error('Expected indexed POSITION triangles');
const triangleCount = indices.length / 3;
if (faceIds.some(id => id >= triangleCount)) throw new Error(`Face ID outside [0, ${triangleCount - 1}]`);
const triangleMultiset = (values, excluded = new Set()) => {
  const counts = new Map();
  for (let face = 0; face < values.length / 3; face++) {
    if (excluded.has(face)) continue;
    const key = Array.from(values.slice(face * 3, face * 3 + 3)).sort((a, b) => a - b).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};
const expectedTriangles = triangleMultiset(indices, new Set(faceIds));

const hash = value => createHash('sha256').update(Buffer.from(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength ?? value.length)).digest('hex');
const signature = doc => {
  const r = doc.getRoot();
  return JSON.stringify({
    nodes: r.listNodes().map(node => [node.getName(), node.getTranslation(), node.getRotation(), node.getScale(), node.listChildren().map(child => child.getName()), node.getMesh()?.getName() ?? null, node.getSkin()?.getName() ?? null]),
    skins: r.listSkins().map(skin => [skin.getName(), skin.listJoints().map(joint => joint.getName()), hash(skin.getInverseBindMatrices().getArray())]),
    clips: r.listAnimations().map(animation => [animation.getName(), animation.listChannels().map(channel => [channel.getTargetNode().getName(), channel.getTargetPath(), channel.getSampler().getInterpolation(), hash(channel.getSampler().getInput().getArray()), hash(channel.getSampler().getOutput().getArray())])]),
    meshes: r.listMeshes().map(gltfMesh => [gltfMesh.getName(), gltfMesh.listPrimitives().map(item => [item.getMode(), item.listSemantics().filter(name => name !== 'INDICES').sort().map(name => [name, hash(item.getAttribute(name).getArray())]), item.getMaterial()?.getName() ?? null])]),
    materials: r.listMaterials().map(material => [material.getName(), material.getBaseColorFactor(), material.getMetallicFactor(), material.getRoughnessFactor(), material.getAlphaMode(), material.getDoubleSided()]),
    textures: r.listTextures().map(texture => [texture.getName(), texture.getMimeType(), hash(texture.getImage())]),
  });
};
const beforeSignature = signature(document);
const removed = faceIds.map(face => ({ face, vertices: Array.from(indices.slice(face * 3, face * 3 + 3)) }));
const removeSet = new Set(faceIds);
const kept = [];
for (let face = 0; face < triangleCount; face++) {
  if (removeSet.has(face)) continue;
  kept.push(indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]);
}
primitive.getIndices().setArray(new indices.constructor(kept));

const staging = `${output}.staging.glb`;
try { await access(staging); throw new Error(`Staging file already exists: ${staging}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
try {
  await io.write(staging, document);
  const check = await io.read(staging);
  if (signature(check) !== beforeSignature) throw new Error('Vertex attributes, rig, clips, materials or textures changed unexpectedly');
  const checkPrimitive = check.getRoot().listNodes().find(node => node.getSkin() && node.getMesh()).getMesh().listPrimitives()[0];
  const checkIndices = checkPrimitive.getIndices().getArray();
  const actualTriangles = triangleMultiset(checkIndices);
  if (actualTriangles.size !== expectedTriangles.size || [...expectedTriangles].some(([key, count]) => actualTriangles.get(key) !== count)) throw new Error('Serialized topology differs beyond the explicitly removed triangles');
  await rename(staging, output);
} catch (error) {
  await rm(staging, { force: true });
  throw error;
}
const report = {
  input,
  output,
  sourceSha256: hash(await readFile(input)),
  outputSha256: hash(await readFile(output)),
  removed,
  trianglesBefore: triangleCount,
  trianglesAfter: kept.length / 3,
  vertexAccessorsRigBindClipsMaterialsTexturesUnchanged: true,
  outputBytes: (await stat(output)).size,
};
await writeFile(output.replace(/\.glb$/i, '.face-removal.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
