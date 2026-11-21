#!/usr/bin/env node
// Replace only a candidate GLB's mesh data while keeping its exact rig, bind,
// node transforms, and Walk/Idle channels. The geometry input must already be
// weighted to the same named skeleton and share one consistent bind-frame
// conversion across all joints.
// Usage: node scripts/transplant_candidate_geometry.mjs <rigged-candidate.glb> <weighted-geometry.glb> <output.glb>
import assert from 'node:assert/strict';
import { access, stat, writeFile } from 'node:fs/promises';
import { Matrix3, Matrix4, Vector3 } from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [rigPath, geometryPath, outputPath] = process.argv.slice(2);
if (!rigPath || !geometryPath || !outputPath || rigPath === '--help') {
  console.log('Uso: node scripts/transplant_candidate_geometry.mjs <rigged-candidate.glb> <weighted-geometry.glb> <output.glb>');
  process.exit(rigPath ? 0 : 2);
}
if ([rigPath, geometryPath].includes(outputPath)) throw new Error('a saída precisa ser um arquivo novo');
try { await access(outputPath); throw new Error(`a saída já existe; preserve-a: ${outputPath}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const [rigDoc, geometryDoc] = await Promise.all([io.read(rigPath), io.read(geometryPath)]);

function getSkinnedPrimitive(doc, label) {
  const root = doc.getRoot();
  const skins = root.listSkins();
  const nodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
  assert.equal(skins.length, 1, `${label}: expected exactly one skin`);
  assert.equal(nodes.length, 1, `${label}: expected exactly one skinned mesh node`);
  const primitives = nodes[0].getMesh().listPrimitives();
  assert.equal(primitives.length, 1, `${label}: expected exactly one mesh primitive`);
  return { root, skin: skins[0], node: nodes[0], primitive: primitives[0] };
}

const rig = getSkinnedPrimitive(rigDoc, 'rig source');
const geometry = getSkinnedPrimitive(geometryDoc, 'weighted geometry');
const rigJoints = rig.skin.listJoints();
const geometryJoints = geometry.skin.listJoints();
const rigByName = new Map(rigJoints.map((joint, index) => [joint.getName(), index]));
const geometryByName = new Map(geometryJoints.map((joint, index) => [joint.getName(), index]));
assert.equal(rigByName.size, rigJoints.length, 'duplicate joint names in rig source');
assert.equal(geometryByName.size, geometryJoints.length, 'duplicate joint names in weighted geometry');
assert.equal(geometryJoints.length, rigJoints.length, 'joint count differs');
const geometryToRigJoint = geometryJoints.map((joint) => {
  const index = rigByName.get(joint.getName());
  assert.notEqual(index, undefined, `joint missing in rig source: ${joint.getName()}`);
  return index;
});
assert.equal(rig.primitive.getAttribute('JOINTS_1'), null, 'JOINTS_1 is not supported');
assert.equal(geometry.primitive.getAttribute('JOINTS_1'), null, 'JOINTS_1 is not supported');
assert.equal(geometry.primitive.getAttribute('WEIGHTS_1'), null, 'WEIGHTS_1 is not supported');

const rigIBM = rig.skin.getInverseBindMatrices()?.getArray();
const geometryIBM = geometry.skin.getInverseBindMatrices()?.getArray();
assert.ok(rigIBM && geometryIBM, 'both skins need inverse-bind matrices');
assert.equal(rigIBM.length, rigJoints.length * 16, 'rig inverse-bind matrix count differs');
assert.equal(geometryIBM.length, geometryJoints.length * 16, 'geometry inverse-bind matrix count differs');
let bindFrameTransform = null;
let maxBindFrameDelta = 0;
for (let index = 0; index < geometryJoints.length; index++) {
  const joint = geometryJoints[index];
  const rigIndex = rigByName.get(joint.getName());
  const rigJoint = rigJoints[rigIndex];
  const rigBind = new Matrix4().fromArray(rigIBM.slice(rigIndex * 16, rigIndex * 16 + 16));
  rigBind.premultiply(new Matrix4().fromArray(rigJoint.getWorldMatrix()));
  const geometryBind = new Matrix4().fromArray(geometryIBM.slice(index * 16, index * 16 + 16));
  geometryBind.premultiply(new Matrix4().fromArray(joint.getWorldMatrix()));
  const candidateTransform = rigBind.invert().multiply(geometryBind);
  if (!bindFrameTransform) bindFrameTransform = candidateTransform;
  const delta = Math.max(...candidateTransform.elements.map((value, i) => Math.abs(value - bindFrameTransform.elements[i])));
  maxBindFrameDelta = Math.max(maxBindFrameDelta, delta);
}
assert.ok(maxBindFrameDelta <= 1e-3,
  `bind-frame conversion differs across joints: max Δ=${maxBindFrameDelta.toExponential(2)}`);

for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
  assert.ok(geometry.primitive.getAttribute(semantic), `weighted geometry is missing ${semantic}`);
}
const geometryPositions = geometry.primitive.getAttribute('POSITION');
const geometryNormals = geometry.primitive.getAttribute('NORMAL');
const geometryJointsAttr = geometry.primitive.getAttribute('JOINTS_0');
const geometryWeightsAttr = geometry.primitive.getAttribute('WEIGHTS_0');
const count = geometryPositions.getCount();
assert.ok(count > 0, 'weighted geometry is empty');
for (const semantic of ['NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
  assert.equal(geometry.primitive.getAttribute(semantic).getCount(), count, `${semantic} count differs from POSITION`);
}

const normalToRigLocal = new Matrix3().getNormalMatrix(bindFrameTransform);
const transformedPositions = new Float32Array(count * 3);
const transformedNormals = new Float32Array(count * 3);
const srcPosition = [0, 0, 0];
const srcNormal = [0, 0, 1];
const srcJoints = [0, 0, 0, 0];
const srcWeights = [0, 0, 0, 0];
const p = new Vector3();
const n = new Vector3();
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
let maxWeightSumError = 0;
const remappedJoints = new Uint16Array(count * 4);
const remappedWeights = new Float32Array(count * 4);

for (let index = 0; index < count; index++) {
  geometryPositions.getElement(index, srcPosition);
  p.set(srcPosition[0], srcPosition[1], srcPosition[2]).applyMatrix4(bindFrameTransform);
  transformedPositions.set([p.x, p.y, p.z], index * 3);
  bounds.min[0] = Math.min(bounds.min[0], p.x); bounds.max[0] = Math.max(bounds.max[0], p.x);
  bounds.min[1] = Math.min(bounds.min[1], p.y); bounds.max[1] = Math.max(bounds.max[1], p.y);
  bounds.min[2] = Math.min(bounds.min[2], p.z); bounds.max[2] = Math.max(bounds.max[2], p.z);

  geometryNormals.getElement(index, srcNormal);
  n.set(srcNormal[0], srcNormal[1], srcNormal[2]).applyMatrix3(normalToRigLocal).normalize();
  transformedNormals.set([n.x, n.y, n.z], index * 3);

  geometryJointsAttr.getElement(index, srcJoints);
  geometryWeightsAttr.getElement(index, srcWeights);
  let sum = 0;
  for (let slot = 0; slot < 4; slot++) {
    const sourceJoint = Number(srcJoints[slot]);
    assert.ok(Number.isInteger(sourceJoint) && sourceJoint >= 0 && sourceJoint < geometryToRigJoint.length,
      `invalid joint index ${sourceJoint} at vertex ${index}`);
    const weight = Number(srcWeights[slot]);
    assert.ok(Number.isFinite(weight) && weight >= 0, `invalid skin weight at vertex ${index}`);
    remappedJoints[index * 4 + slot] = geometryToRigJoint[sourceJoint];
    remappedWeights[index * 4 + slot] = weight;
    sum += weight;
  }
  assert.ok(sum > 1e-6, `unweighted vertex ${index}`);
  maxWeightSumError = Math.max(maxWeightSumError, Math.abs(sum - 1));
  for (let slot = 0; slot < 4; slot++) remappedWeights[index * 4 + slot] /= sum;
}
assert.ok(maxWeightSumError <= 0.01, `weight sums differ from one: ${maxWeightSumError}`);

const indexAccessor = geometry.primitive.getIndices();
const indices = indexAccessor?.getArray();
assert.ok(indices?.length, 'weighted geometry needs indexed triangles');
assert.equal(indices.length % 3, 0, 'geometry indices are not a triangle list');
let maxIndex = 0;
for (const index of indices) maxIndex = Math.max(maxIndex, index);
assert.ok(maxIndex < count, 'geometry index exceeds vertex count');

const rigPrimitive = rig.primitive;
const rigBuffer = rigDoc.getRoot().listBuffers()[0];
const addAccessor = (name, type, array) => {
  const accessor = rigDoc.createAccessor(name, rigBuffer).setType(type).setArray(array);
  return accessor;
};
const set = (semantic, type, array) => {
  rigPrimitive.setAttribute(semantic, addAccessor(`review_${semantic}`, type, array));
};
set('POSITION', 'VEC3', transformedPositions);
set('NORMAL', 'VEC3', transformedNormals);
set('TEXCOORD_0', 'VEC2', new Float32Array(geometry.primitive.getAttribute('TEXCOORD_0').getArray()));
set('JOINTS_0', 'VEC4', remappedJoints);
set('WEIGHTS_0', 'VEC4', remappedWeights);
rigPrimitive.setIndices(addAccessor('review_indices', 'SCALAR', Uint32Array.from(indices)));

const report = {
  rigPath, geometryPath, outputPath,
  joints: rigJoints.length,
  vertices: count,
  triangles: indices.length / 3,
  bindFrameTransform: Array.from(bindFrameTransform.elements),
  maxBindFrameDelta,
  weightMaxSumError: maxWeightSumError,
  rigLocalBounds: bounds,
  preservedWalkIdle: rig.root.listAnimations().map((animation) => animation.getName()),
  materialSource: 'original rigged candidate; high-resolution geometry UVs reused',
};
const reportPath = `${outputPath}.geometry-transfer.json`;
await io.write(outputPath, rigDoc);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, bytes: (await stat(outputPath)).size, reportPath }, null, 2));
