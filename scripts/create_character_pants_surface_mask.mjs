#!/usr/bin/env node
// Build a deterministic, runtime-scale mask for lower-leg cloth surface trials.
// The mask is deliberately limited to pant vertices near the ankle, excluding
// footwear by their joint influence. It never modifies the source GLB.
// Usage: node scripts/create_character_pants_surface_mask.mjs <input.glb> <output.mask.json>
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) {
  throw new Error('Usage: node scripts/create_character_pants_surface_mask.mjs input.glb separate-output.mask.json');
}
try { await access(output); throw new Error(`Output exists: ${output}`); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
const root = doc.getRoot();
const skinned = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skinned.length !== 1 || root.listSkins().length !== 1) throw new Error('Expected exactly one skinned mesh and skin');
const skin = skinned[0].getSkin();
const primitives = skinned[0].getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error('Expected exactly one mesh primitive');
const primitive = primitives[0];
const position = primitive.getAttribute('POSITION');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
if (!position || !joints || !weights || primitive.getAttribute('WEIGHTS_1')) throw new Error('Expected POSITION/JOINTS_0/WEIGHTS_0 only');
if (!weights.getNormalized()) throw new Error('Expected normalized skin weights');

const names = skin.listJoints().map((joint) => joint.getName());
const jointByName = new Map(names.map((name, index) => [name, index]));
const legSides = ['Left', 'Right'].map((side) => {
  const upper = jointByName.get(`mixamorig:${side}UpLeg`);
  const lower = jointByName.get(`mixamorig:${side}Leg`);
  const foot = jointByName.get(`mixamorig:${side}Foot`);
  const toe = jointByName.get(`mixamorig:${side}ToeBase`);
  if ([upper, lower, foot, toe].some((index) => index === undefined)) throw new Error(`Missing ${side} leg/foot joints`);
  return { side, upper, lower, foot, toe };
});

const ibm = skin.getInverseBindMatrices();
const skinMatrices = skin.listJoints().map((joint, index) =>
  new THREE.Matrix4().fromArray(joint.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ibm.getElement(index, []))));
const rest = [];
const bounds = new THREE.Box3();
const vertexJoints = new Array(position.getCount());
const vertexWeights = new Array(position.getCount());
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = new THREE.Vector3().fromArray(position.getElement(vertex, []));
  const js = joints.getElement(vertex, []);
  const ws = weights.getElement(vertex, []);
  const deformed = new THREE.Vector3();
  for (let slot = 0; slot < 4; slot++) deformed.addScaledVector(point.clone().applyMatrix4(skinMatrices[js[slot]]), ws[slot]);
  rest.push(deformed);
  bounds.expandByPoint(deformed);
  vertexJoints[vertex] = js;
  vertexWeights[vertex] = ws;
}

const axisFix = new THREE.Matrix4();
if (bounds.getSize(new THREE.Vector3()).z > bounds.getSize(new THREE.Vector3()).y * 1.5) axisFix.makeRotationX(-Math.PI / 2);
bounds.applyMatrix4(axisFix);
const center = bounds.getCenter(new THREE.Vector3());
const runtimeScale = 1.72 / bounds.getSize(new THREE.Vector3()).y;
const normalize = (point) => {
  const v = point.clone().applyMatrix4(axisFix);
  return new THREE.Vector3((v.x - center.x) * runtimeScale, (v.y - bounds.min.y) * runtimeScale, (v.z - center.z) * runtimeScale);
};

for (const data of legSides) {
  data.ankle = normalize(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.listJoints()[data.foot].getWorldMatrix())));
  data.knee = normalize(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.listJoints()[data.lower].getWorldMatrix())));
  data.axis = data.knee.clone().sub(data.ankle);
  data.lengthSq = data.axis.lengthSq();
  if (data.lengthSq < 0.04 ** 2) throw new Error(`${data.side} lower-leg segment is implausibly short`);
}

const mask = new Array(position.getCount()).fill(0);
const selectedBySide = { Left: 0, Right: 0 };
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = normalize(rest[vertex]);
  const js = vertexJoints[vertex];
  const ws = vertexWeights[vertex];
  let best = null;
  for (const data of legSides) {
    let upperWeight = 0, lowerWeight = 0, footWeight = 0;
    for (let slot = 0; slot < 4; slot++) {
      if (js[slot] === data.upper) upperWeight += ws[slot];
      if (js[slot] === data.lower) lowerWeight += ws[slot];
      if (js[slot] === data.foot || js[slot] === data.toe) footWeight += ws[slot];
    }
    const legWeight = upperWeight + lowerWeight;
    if (legWeight < 0.25 || footWeight > 0.45) continue;
    const delta = point.clone().sub(data.ankle);
    const t = delta.dot(data.axis) / data.lengthSq;
    if (t < -0.08 || t > 0.32) continue;
    const closest = data.ankle.clone().addScaledVector(data.axis, Math.max(0, Math.min(1, t)));
    const distance = point.distanceTo(closest);
    if (distance > 0.145) continue;
    if (!best || distance < best.distance) best = { side: data.side, distance };
  }
  if (best) {
    mask[vertex] = 1;
    selectedBySide[best.side]++;
  }
}

const selectedVertices = mask.reduce((sum, value) => sum + value, 0);
if (selectedVertices < 100 || Object.values(selectedBySide).some((count) => count < 20)) {
  throw new Error(`Mask too small/imbalanced: total=${selectedVertices} bySide=${JSON.stringify(selectedBySide)}`);
}
const maskData = {
  sourceSha256: createHash('sha256').update(await readFile(input)).digest('hex'),
  runtimeScale,
  vertexCount: position.getCount(),
  mask,
  selection: {
    region: 'lower-leg cloth near ankle; leg weight >= 0.25, foot/toe weight <= 0.45, t=-0.08..0.32, radius <= 145 mm',
    selectedVertices,
    selectedBySide,
  },
};
await writeFile(output, `${JSON.stringify(maskData)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ input, output, vertexCount: position.getCount(), runtimeScale, ...maskData.selection }, null, 2));
