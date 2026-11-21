// Isolated elbow-weight experiment for the current Ana GLB.
// Redistributes only existing RightArm/RightForeArm mass near the elbow.
// Geometry, animation, bind matrices and all other regions are preserved.
// This is a diagnostic candidate, not a universal weight-painting rule.
//
// Usage:
// node scripts/correct_character_elbow_transition.mjs <input.glb> <output.glb> [halfWidth=0.06] [radius=0.06]
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';

const [input, output, halfWidthArg = '0.06', radiusArg = '0.06'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/correct_character_elbow_transition.mjs <input.glb> <output.glb> [halfWidth=0.06] [radius=0.06]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída precisa ser um arquivo separado');
const halfWidth = Number(halfWidthArg);
const radius = Number(radiusArg);
if (!(halfWidth >= 0.025 && halfWidth <= 0.12)) throw new Error('halfWidth deve ficar entre 25 e 120 mm');
if (!(radius >= 0.025 && radius <= 0.12)) throw new Error('radius deve ficar entre 25 e 120 mm');
try { await access(output); throw new Error(`a saída já existe: ${output}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const root = document.getRoot();
const skins = root.listSkins();
const nodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skins.length !== 1 || skins[0].listJoints().length !== 65 || nodes.length !== 1) {
  throw new Error('esperado o GLB skinned da Ana com uma skin e 65 joints');
}
const skin = skins[0];
const primitive = nodes[0].getMesh().listPrimitives()[0];
const position = primitive.getAttribute('POSITION');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
const inverseBind = skin.getInverseBindMatrices();
if (!position || !joints || !weights || !inverseBind || primitive.getAttribute('JOINTS_1')) {
  throw new Error('faltam atributos de skin/inverse bind ou há mais de quatro influências');
}
if (!(weights.getArray() instanceof Uint8Array) || !weights.getNormalized()) {
  throw new Error('esperado WEIGHTS_0 Uint8 normalizado');
}

const names = skin.listJoints().map((joint) => joint.getName());
const id = Object.fromEntries(['RightArm', 'RightForeArm', 'RightHand'].map((name) => {
  const index = names.indexOf(`mixamorig:${name}`);
  if (index < 0) throw new Error(`mixamorig:${name} ausente`);
  return [name, index];
}));
const bindJointOrigin = (name) => {
  const index = id[name];
  const matrix = [];
  inverseBind.getElement(index, matrix);
  return new Vector3().applyMatrix4(new Matrix4().fromArray(matrix).invert());
};
const shoulder = bindJointOrigin('RightArm');
const elbow = bindJointOrigin('RightForeArm');
const wrist = bindJointOrigin('RightHand');
const upperAxis = elbow.clone().sub(shoulder);
const forearmAxis = wrist.clone().sub(elbow);
const upperLengthSq = upperAxis.lengthSq();
const forearmLengthSq = forearmAxis.lengthSq();
if (upperLengthSq < 1e-5 || forearmLengthSq < 1e-5) throw new Error('pivôs do braço/antebraço inválidos');

const read = (accessor, vertex) => {
  const values = [];
  accessor.getElement(vertex, values);
  return values;
};
const hash = (array) => createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const before = Object.fromEntries(['POSITION', 'NORMAL', 'TEXCOORD_0'].map((name) => [
  name, hash(primitive.getAttribute(name).getArray()),
]));
const indexHash = hash(primitive.getIndices().getArray());
const originalJointArray = joints.getArray();
const originalWeightArray = weights.getArray();
const nextJointArray = originalJointArray.slice();
const nextWeightArray = originalWeightArray.slice();
const editedPositions = [];
const editedVertexIds = [];
let selectedCount = 0;
let beforeArm = 0;
let beforeForearm = 0;
let afterArm = 0;
let afterForearm = 0;
let maxMassError = 0;

const project = (point, start, axis, lengthSq, positive) => {
  const t = Math.max(0, Math.min(1, point.clone().sub(start).dot(axis) / lengthSq));
  const closest = start.clone().addScaledVector(axis, t);
  const length = Math.sqrt(lengthSq);
  return {
    distance: point.distanceTo(closest),
    signedDistance: positive ? (1 - t) * length : -t * length,
  };
};
const smooth = (t) => {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
};
const targetArmFraction = (signedDistance) => {
  // Keep a soft blend centered on the elbow. The upper-arm edge stays mostly
  // RightArm; the forearm edge is mostly RightForeArm.
  if (signedDistance >= 0) {
    return 0.60 + (0.97 - 0.60) * smooth(signedDistance / halfWidth);
  }
  return 0.60 + (0.25 - 0.60) * smooth(-signedDistance / halfWidth);
};
const quantize = (map) => {
  const entries = [...map.entries()].filter(([, value]) => value > 1e-6).sort((a, b) => b[1] - a[1]);
  const selected = entries.slice(0, 4);
  const total = selected.reduce((sum, [, value]) => sum + value, 0);
  if (!(total > 0)) throw new Error('vértice sem massa de skin');
  const exact = selected.map(([, value]) => value / total * 255);
  const bytes = exact.map(Math.floor);
  const remainder = 255 - bytes.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - bytes[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) bytes[order[i].index]++;
  return { names: selected.map(([name]) => name), bytes, totalBeforePrune: entries.reduce((sum, [, value]) => sum + value, 0) };
};

for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = new Vector3(...read(position, vertex));
  const upper = project(point, shoulder, upperAxis, upperLengthSq, true);
  const fore = project(point, elbow, forearmAxis, forearmLengthSq, false);
  const nearest = upper.distance <= fore.distance ? upper : fore;
  const signedDistance = nearest.signedDistance;
  if (Math.abs(signedDistance) > halfWidth || nearest.distance > radius) continue;

  const current = new Map();
  const jointIds = read(joints, vertex);
  const values = read(weights, vertex);
  for (let slot = 0; slot < 4; slot++) {
    if (values[slot] > 0) {
      const name = names[jointIds[slot]];
      current.set(name, (current.get(name) ?? 0) + values[slot]);
    }
  }
  const armMass = current.get('mixamorig:RightArm') ?? 0;
  const forearmMass = current.get('mixamorig:RightForeArm') ?? 0;
  const handMass = current.get('mixamorig:RightHand') ?? 0;
  const pairMass = armMass + forearmMass;
  // Avoid repainting torso/sleeve vertices whose arm-chain support is weak.
  if (pairMass + handMass < 0.75 || pairMass < 0.65) continue;

  const targetFraction = targetArmFraction(signedDistance);
  const updated = new Map(current);
  updated.set('mixamorig:RightArm', pairMass * targetFraction);
  updated.set('mixamorig:RightForeArm', pairMass * (1 - targetFraction));
  const q = quantize(updated);
  const serializedMass = q.totalBeforePrune;
  maxMassError = Math.max(maxMassError, Math.abs(serializedMass - 1));
  for (let slot = 0; slot < 4; slot++) {
    const name = q.names[slot] ?? q.names.at(-1);
    const jointIndex = names.indexOf(name);
    if (jointIndex < 0) throw new Error(`bone ${name} não existe no rig`);
    nextJointArray[vertex * 4 + slot] = jointIndex;
    nextWeightArray[vertex * 4 + slot] = q.bytes[slot] ?? 0;
  }
  selectedCount++;
  beforeArm += armMass;
  beforeForearm += forearmMass;
  afterArm += pairMass * targetFraction;
  afterForearm += pairMass * (1 - targetFraction);
  editedPositions.push(point.toArray());
  editedVertexIds.push(vertex);
}

if (selectedCount < 50) throw new Error(`só ${selectedCount} vértices elegíveis; saída não gravada`);
for (const vertex of editedVertexIds) {
  let sum = 0;
  for (let slot = 0; slot < 4; slot++) sum += nextWeightArray[vertex * 4 + slot];
  if (sum !== 255) throw new Error(`soma WEIGHTS_0 inválida no vértice ${vertex}: ${sum}/255`);
}

joints.setArray(nextJointArray);
weights.setArray(nextWeightArray);
for (const [name, oldHash] of Object.entries(before)) {
  if (hash(primitive.getAttribute(name).getArray()) !== oldHash) throw new Error(`${name} mudou inesperadamente`);
}
if (hash(primitive.getIndices().getArray()) !== indexHash) throw new Error('índices mudaram inesperadamente');
await io.write(output, document);
const reread = await io.read(output);
const writtenPrimitive = reread.getRoot().listNodes().find((node) => node.getSkin() && node.getMesh()).getMesh().listPrimitives()[0];
for (const [name, oldHash] of Object.entries(before)) {
  if (hash(writtenPrimitive.getAttribute(name).getArray()) !== oldHash) throw new Error(`${name} divergiu após serialização`);
}
if (hash(writtenPrimitive.getIndices().getArray()) !== indexHash) throw new Error('índices divergiram após serialização');

const bounds = [0, 1, 2].map((axis) => {
  const values = editedPositions.map((point) => point[axis]);
  return [Math.min(...values), Math.max(...values)].map((value) => +value.toFixed(4));
});
console.log(JSON.stringify({
  input, output, editedVertices: selectedCount, halfWidthMeters: halfWidth, radialLimitMeters: radius,
  elbowLocalPosition: elbow.toArray().map((value) => +value.toFixed(4)), editedBounds: bounds,
  meanArmFractionBefore: +(beforeArm / Math.max(1e-8, beforeArm + beforeForearm)).toFixed(4),
  meanArmFractionAfter: +(afterArm / Math.max(1e-8, afterArm + afterForearm)).toFixed(4),
  maxWeightMassErrorBeforeQuantization: +maxMassError.toFixed(8),
  geometryNormalsUVIndicesPreserved: true,
  note: 'diagnostic candidate; requires visual QA at elbow flexion and wide shoulder poses',
}, null, 2));
