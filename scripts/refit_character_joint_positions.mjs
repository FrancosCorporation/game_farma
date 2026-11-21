// Refit joint pivots measured on the character's own rest surface. The mesh,
// rotations and weights are preserved, and inverse binds preserve rest shape.
// Usage: node scripts/refit_character_joint_positions.mjs input.glb output.glb config.json
import { readFile, access, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Matrix4, Vector3, Quaternion, Box3 } from 'three';

const [input, output, configPath] = process.argv.slice(2);
if (!configPath || input === '--help') {
  console.log('Usage: node scripts/refit_character_joint_positions.mjs input.glb output.glb config.json');
  process.exit(input === '--help' ? 0 : 2);
}
if (resolve(input) === resolve(output)) throw new Error('Output must be a separate file');
try { await access(output); throw new Error('Output already exists'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const config = JSON.parse(await readFile(configPath, 'utf8'));
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input), root = doc.getRoot();
const meshNode = root.listNodes().find(n => n.getSkin() && n.getMesh());
if (root.listSkins().length !== 1 || !meshNode) throw new Error('Expected one skinned mesh');
const skin = meshNode.getSkin(), joints = skin.listJoints(), nodes = root.listNodes();
const oldWorld = new Map(nodes.map(n => [n, new Matrix4().fromArray(n.getWorldMatrix())]));
const oldLocal = new Map(nodes.map(n => [n, n.getTranslation().slice()]));
const parents = new Map();
for (const n of nodes) for (const child of n.listChildren()) parents.set(child, n);
const read = (a, i) => a.getElement(i, []);
const originalSkinMatrices = joints.map((n, i) => oldWorld.get(n).clone().multiply(new Matrix4().fromArray(read(skin.getInverseBindMatrices(), i))));
const hash = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const meshSignature = r => r.listMeshes().map(m => m.listPrimitives().map(p => ({
  indices: p.getIndices() && hash(p.getIndices().getArray()),
  attributes: p.listSemantics().map(s => [s, hash(p.getAttribute(s).getArray())]),
  targets: p.listTargets().map(t => t.listSemantics().map(s => [s, hash(t.getAttribute(s).getArray())])),
})));
const beforeMesh = JSON.stringify(meshSignature(root));
const rotationChannels = r => r.listAnimations().flatMap(a => a.listChannels().filter(c => c.getTargetPath() !== 'translation').map(c => [a.getName(), c.getTargetNode().getName(), c.getTargetPath(), hash(c.getSampler().getOutput().getArray())]));
const beforeRotations = JSON.stringify(rotationChannels(root));
const points = [], point = new Vector3(), v = new Vector3();
const box = new Box3();
for (const p of meshNode.getMesh().listPrimitives()) {
  const pos = p.getAttribute('POSITION'), js = p.getAttribute('JOINTS_0'), ws = p.getAttribute('WEIGHTS_0');
  for (let i = 0; i < pos.getCount(); i++) {
    const xyz = read(pos, i), indices = read(js, i), weights = read(ws, i);
    point.set(0, 0, 0);
    for (let k = 0; k < 4; k++) if (weights[k]) point.addScaledVector(v.fromArray(xyz).applyMatrix4(originalSkinMatrices[indices[k]]), weights[k]);
    points.push(point.clone()); box.expandByPoint(point);
  }
}
const size = box.getSize(new Vector3());
const orientation = new Matrix4();
if (size.z > size.y * 1.5) orientation.makeRotationX(-Math.PI / 2);
box.makeEmpty();
for (const p of points) box.expandByPoint(p.clone().applyMatrix4(orientation));
const scale = 1.72 / box.getSize(new Vector3()).y;
const center = box.getCenter(new Vector3()).multiplyScalar(scale);
const normalization = new Matrix4().makeTranslation(-center.x, -box.min.y * scale, -center.z)
  .multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(orientation);
const invNormalization = normalization.clone().invert();
const desiredWorld = new Map([...oldWorld].map(([n, m]) => [n, m.clone()]));
const pivotChanges = [];
for (const [name, target] of Object.entries(config.runtimePositions ?? {})) {
  const node = joints.find(n => n.getName().replaceAll(':', '') === name.replaceAll(':', ''));
  if (!node || !Array.isArray(target) || target.length !== 3 || target.some(x => x !== null && !Number.isFinite(x))) throw new Error('Invalid measured joint: ' + name);
  const before = new Vector3().setFromMatrixPosition(oldWorld.get(node)).applyMatrix4(normalization);
  const after = before.clone();
  target.forEach((x, i) => { if (x !== null) after.setComponent(i, x); });
  desiredWorld.get(node).setPosition(after.clone().applyMatrix4(invNormalization));
  pivotChanges.push({ bone: node.getName(), before: before.toArray(), after: after.toArray(), distanceMeters: before.distanceTo(after) });
}
if (!pivotChanges.length) throw new Error('No pivots specified');
const changedTranslations = new Map();
for (const n of nodes) {
  const parent = parents.get(n);
  const local = parent ? desiredWorld.get(parent).clone().invert().multiply(desiredWorld.get(n)) : desiredWorld.get(n).clone();
  const translation = new Vector3(), rotation = new Quaternion(), localScale = new Vector3();
  local.decompose(translation, rotation, localScale);
  const previous = oldLocal.get(n), delta = translation.clone().sub(new Vector3().fromArray(previous));
  if (delta.length() < 1e-8) continue;
  n.setTranslation(translation.toArray());
  changedTranslations.set(n, delta.toArray());
}
const inverseBinds = new Float32Array(joints.length * 16);
joints.forEach((n, i) => inverseBinds.set(new Matrix4().fromArray(n.getWorldMatrix()).invert().multiply(originalSkinMatrices[i]).elements, i * 16));
skin.getInverseBindMatrices().setArray(inverseBinds);
for (const animation of root.listAnimations()) for (const channel of animation.listChannels()) {
  const delta = changedTranslations.get(channel.getTargetNode());
  if (!delta || channel.getTargetPath() !== 'translation') continue;
  const sampler = channel.getSampler(), a = sampler.getOutput(), factor = sampler.getInterpolation() === 'CUBICSPLINE' ? 3 : 1;
  const values = Float32Array.from({ length: a.getCount() * 3 }, (_, k) => read(a, Math.floor(k / 3))[k % 3]);
  for (let key = 0; key < sampler.getInput().getCount(); key++) for (let k = 0; k < 3; k++) values[(key * factor + (factor === 3 ? 1 : 0)) * 3 + k] += delta[k];
  a.setArray(values).setNormalized(false);
}
const staging = output + '.staging.glb';
try {
  await access(staging); throw new Error('Staging file already exists');
} catch (e) { if (e.code !== 'ENOENT') throw e; }
try {
  await io.write(staging, doc);
  const check = (await io.read(staging)).getRoot();
  if (JSON.stringify(meshSignature(check)) !== beforeMesh || JSON.stringify(rotationChannels(check)) !== beforeRotations) throw new Error('Mesh/weights or rotation/scale/morph clips changed unexpectedly');
  let maxRestMatrixDelta = 0;
  const checkSkin = check.listSkins()[0];
  checkSkin.listJoints().forEach((n, i) => {
    const m = new Matrix4().fromArray(n.getWorldMatrix()).multiply(new Matrix4().fromArray(read(checkSkin.getInverseBindMatrices(), i)));
    maxRestMatrixDelta = Math.max(maxRestMatrixDelta, ...m.elements.map((x, k) => Math.abs(x - originalSkinMatrices[i].elements[k])));
  });
  if (maxRestMatrixDelta > 1e-4) throw new Error('Rest shape changed: ' + maxRestMatrixDelta);
  await rename(staging, output);
  const report = { input, output, pivotChanges, changedLocalTranslations: changedTranslations.size, maxRestMatrixDelta, preserved: ['mesh', 'weights', 'UVs', 'materials', 'rotation/scale/morph clips', 'rest shape'] };
  await writeFile(output + '.report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (e) { await rm(staging, { force: true }); throw e; }
