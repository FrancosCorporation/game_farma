// Remove only repeated-index or exactly zero-area triangles from an animated GLB.
// Vertex accessors, joint weights, bind matrices, materials and animation clips stay unchanged.
// Usage: node scripts/clean_animated_degenerate_faces.mjs input.glb separate-output.glb
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error('Usage: node scripts/clean_animated_degenerate_faces.mjs input.glb separate-output.glb');
try { await access(output); throw new Error(`Output already exists: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input), root = doc.getRoot();
const hash = value => createHash('sha256').update(Buffer.from(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength ?? value.length)).digest('hex');
const signature = document => {
  const documentRoot = document.getRoot();
  return JSON.stringify({
    nodes: documentRoot.listNodes().map(node => [node.getName(), node.getTranslation(), node.getRotation(), node.getScale(), node.listChildren().map(child => child.getName()), node.getMesh()?.getName() ?? null, node.getSkin()?.getName() ?? null]),
    skins: documentRoot.listSkins().map(skin => [skin.getName(), skin.listJoints().map(joint => joint.getName()), hash(skin.getInverseBindMatrices().getArray())]),
    animations: documentRoot.listAnimations().map(animation => [animation.getName(), animation.listChannels().map(channel => [channel.getTargetNode().getName(), channel.getTargetPath(), channel.getSampler().getInterpolation(), hash(channel.getSampler().getInput().getArray()), hash(channel.getSampler().getOutput().getArray())])]),
    meshes: documentRoot.listMeshes().map(mesh => [mesh.getName(), mesh.listPrimitives().map(primitive => [primitive.getMode(), primitive.listSemantics().filter(name => name !== 'INDICES').sort().map(name => [name, hash(primitive.getAttribute(name).getArray())]), primitive.getMaterial()?.getName() ?? null])]),
    materials: documentRoot.listMaterials().map(material => [material.getName(), material.getBaseColorFactor(), material.getEmissiveFactor(), material.getMetallicFactor(), material.getRoughnessFactor(), material.getAlphaMode(), material.getAlphaCutoff(), material.getDoubleSided(), [material.getBaseColorTexture(), material.getMetallicRoughnessTexture(), material.getNormalTexture(), material.getOcclusionTexture(), material.getEmissiveTexture()].map(texture => texture?.getName() ?? null)]),
    textures: documentRoot.listTextures().map(texture => [texture.getName(), texture.getMimeType(), hash(texture.getImage())]),
  });
};
const before = signature(doc), primitiveReports = [];
let removedTriangles = 0, trianglesBefore = 0, trianglesAfter = 0;

for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
  if (primitive.getMode() !== Primitive.Mode.TRIANGLES || primitive.listTargets().length) throw new Error(`Unsupported primitive: ${mesh.getName()}`);
  const position = primitive.getAttribute('POSITION'), indexAccessor = primitive.getIndices();
  if (!position || !indexAccessor) throw new Error(`Indexed POSITION required: ${mesh.getName()}`);
  const source = indexAccessor.getArray();
  if (source.length % 3) throw new Error(`Index count is not divisible by three: ${mesh.getName()}`);
  const kept = [], a = [], b = [], c = [];
  let repeatedIndex = 0, zeroArea = 0;
  for (let offset = 0; offset < source.length; offset += 3) {
    const ids = [source[offset], source[offset + 1], source[offset + 2]];
    if (ids.some(index => !Number.isInteger(index) || index < 0 || index >= position.getCount())) throw new Error(`Invalid index in ${mesh.getName()}`);
    if (new Set(ids).size < 3) { repeatedIndex++; continue; }
    position.getElement(ids[0], a); position.getElement(ids[1], b); position.getElement(ids[2], c);
    const u = b.map((value, axis) => value - a[axis]), v = c.map((value, axis) => value - a[axis]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (cross.every(value => value === 0)) { zeroArea++; continue; }
    kept.push(...ids);
  }
  const beforeCount = source.length / 3, removed = repeatedIndex + zeroArea;
  if (removed) indexAccessor.setArray(new source.constructor(kept));
  trianglesBefore += beforeCount; trianglesAfter += kept.length / 3; removedTriangles += removed;
  primitiveReports.push({ mesh: mesh.getName(), trianglesBefore: beforeCount, trianglesAfter: kept.length / 3, repeatedIndex, zeroArea });
}
if (!removedTriangles) throw new Error('No repeated-index or exactly zero-area triangles found');

const staging = `${output}.staging.glb`;
await io.write(staging, doc);
const reread = await io.read(staging);
if (signature(reread) !== before) throw new Error('Output changed vertex accessors, rig, clips, materials or textures');
const outputPrimitives = reread.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
if (outputPrimitives.reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0) !== trianglesAfter) throw new Error('Serialized triangle count mismatch');
await rename(staging, output);
const report = { input, output, sourceSha256: hash(await readFile(input)), outputSha256: hash(await readFile(output)), trianglesBefore, trianglesAfter, removedTriangles, primitiveReports, vertexAccessorsRigClipsMaterialsTexturesUnchanged: true };
await writeFile(output.replace(/\.glb$/i, '.cleanup.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
