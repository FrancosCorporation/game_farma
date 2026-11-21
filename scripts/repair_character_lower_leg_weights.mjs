// Smooth a thigh-to-calf skin-weight imbalance inside the measured lower-leg
// segment. Produces a separate GLB and keeps the bind pose visually invariant.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const [input, output, targetShareArgument = '0.66'] = process.argv.slice(2);
const targetLowerLegShare = Number(targetShareArgument);
if (!input || !output || resolve(input) === resolve(output)) {
  throw new Error('Usage: node scripts/repair_character_lower_leg_weights.mjs input.glb separate-output.glb [targetLowerLegShare=.66]');
}
if (!Number.isFinite(targetLowerLegShare) || targetLowerLegShare < 0.55 || targetLowerLegShare > 0.90) throw new Error('targetLowerLegShare must be within [0.55, 0.90]');
try { await access(output); throw new Error(`Output exists: ${output}`); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const root = doc.getRoot();
const skinnedNodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skinnedNodes.length !== 1 || root.listSkins().length !== 1) throw new Error('Expected one skinned mesh and one skin');
const node = skinnedNodes[0];
const skin = node.getSkin();
const primitives = node.getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error('Expected one mesh primitive');
const primitive = primitives[0];
const position = primitive.getAttribute('POSITION');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
if (!position || !joints || !weights || primitive.getAttribute('WEIGHTS_1')) throw new Error('Expected POSITION/JOINTS_0/WEIGHTS_0 only');
const weightArray = weights.getArray();
const weightUnitMax = weightArray instanceof Uint16Array ? 65535 : weightArray instanceof Uint8Array ? 255 : 0;
if (!weightUnitMax || !weights.getNormalized()) throw new Error('Expected normalized Uint8/Uint16 WEIGHTS_0');

const names = skin.listJoints().map((joint) => joint.getName());
const jointIndex = new Map(names.map((name, index) => [name, index]));
const sideJoints = ['Left', 'Right'].map((side) => {
  const upper = jointIndex.get(`mixamorig:${side}UpLeg`);
  const lower = jointIndex.get(`mixamorig:${side}Leg`);
  const foot = jointIndex.get(`mixamorig:${side}Foot`);
  if ([upper, lower, foot].some((index) => index === undefined)) throw new Error(`Missing ${side} leg joints`);
  return { side, upper, lower, foot };
});

const hash = (array) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const signature = (document) => JSON.stringify({
  asset: document.getRoot().getAsset(),
  nodes: document.getRoot().listNodes().map((item) => [item.getName(), item.getTranslation(), item.getRotation(), item.getScale(), item.listChildren().map((child) => child.getName())]),
  skins: document.getRoot().listSkins().map((item) => [item.listJoints().map((joint) => joint.getName()), hash(item.getInverseBindMatrices().getArray())]),
  clips: document.getRoot().listAnimations().map((animation) => [animation.getName(), animation.listChannels().map((channel) => [channel.getTargetNode().getName(), channel.getTargetPath(), channel.getSampler().getInterpolation(), hash(channel.getSampler().getInput().getArray()), hash(channel.getSampler().getOutput().getArray())])]),
  attrs: document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((item) => [hash(item.getIndices().getArray()), item.listSemantics().filter((semantic) => !['JOINTS_0', 'WEIGHTS_0'].includes(semantic)).map((semantic) => [semantic, hash(item.getAttribute(semantic).getArray())])])),
  materials: document.getRoot().listMaterials().map((material) => [material.getName(), material.getBaseColorFactor(), material.getRoughnessFactor(), material.getMetallicFactor(), material.getDoubleSided()]),
  textures: document.getRoot().listTextures().map((texture) => hash(texture.getImage())),
});

const beforeSignature = signature(doc);
const sourceWeights = weights.getArray();
const resultWeights = sourceWeights.slice();
const sourceJointIndices = joints.getArray();
const resultJointIndices = sourceJointIndices.slice();
if (!(resultJointIndices instanceof Uint16Array) && !(resultJointIndices instanceof Uint8Array)) throw new Error('Expected Uint8/Uint16 JOINTS_0');
const ibm = skin.getInverseBindMatrices();
const skinMatrices = skin.listJoints().map((joint, index) => new THREE.Matrix4().fromArray(joint.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ibm.getElement(index, []))));
const normalizedRest = [];
const restBounds = new THREE.Box3();
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = new THREE.Vector3().fromArray(position.getElement(vertex, []));
  const vertexJoints = Array.from(sourceJointIndices.slice(vertex * 4, vertex * 4 + 4));
  const vertexWeights = weights.getElement(vertex, []);
  const restPoint = new THREE.Vector3();
  for (let slot = 0; slot < 4; slot++) restPoint.addScaledVector(point.clone().applyMatrix4(skinMatrices[vertexJoints[slot]]), vertexWeights[slot]);
  normalizedRest.push(restPoint);
  restBounds.expandByPoint(restPoint);
}
const axisFix = new THREE.Matrix4();
if (restBounds.getSize(new THREE.Vector3()).z > restBounds.getSize(new THREE.Vector3()).y * 1.5) axisFix.makeRotationX(-Math.PI / 2);
restBounds.applyMatrix4(axisFix);
const center = restBounds.getCenter(new THREE.Vector3());
const runtimeScale = 1.72 / restBounds.getSize(new THREE.Vector3()).y;
const normalizePoint = (point) => point.clone().applyMatrix4(axisFix).sub(center).multiplyScalar(runtimeScale);
const normalizedJoints = sideJoints.map(({ side, upper, lower, foot }) => {
  const knee = normalizePoint(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.listJoints()[lower].getWorldMatrix())));
  const ankle = normalizePoint(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.listJoints()[foot].getWorldMatrix())));
  return { side, upper, lower, knee, ankle, segment: ankle.clone().sub(knee), lengthSq: knee.distanceToSquared(ankle) };
});
for (const item of normalizedJoints) if (item.lengthSq < 0.05 ** 2) throw new Error(`${item.side} lower-leg segment is too short`);

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
let changedVertices = 0;
let changedWeightUnits = 0;
let maxRestDeltaMeters = 0;
let skippedMissingPair = 0;
let selectedBySide = { Left: 0, Right: 0 };
let calfBefore = { Left: { n: 0, upper: 0, lower: 0 }, Right: { n: 0, upper: 0, lower: 0 } };
let calfAfter = { Left: { n: 0, upper: 0, lower: 0 }, Right: { n: 0, upper: 0, lower: 0 } };
const edgeSet = new Set();
const indices = primitive.getIndices()?.getArray();
if (!indices) throw new Error('Indexed mesh required to audit weight continuity');
let maxLowerEdgeJumpBefore = 0;
let maxLowerEdgeJumpAfter = 0;
const changedVertexSet = new Set();
const ownLowerWeight = (vertex, sideInfo, array, jointArray = sourceJointIndices) => {
  const slots = [0, 1, 2, 3].filter((slot) => jointArray[vertex * 4 + slot] === sideInfo.lower);
  return slots.reduce((sum, slot) => sum + array[vertex * 4 + slot] / weightUnitMax, 0);
};
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = normalizePoint(normalizedRest[vertex]);
  const vertexJoints = Array.from(sourceJointIndices.slice(vertex * 4, vertex * 4 + 4));
  const vertexWeights = weights.getElement(vertex, []);
  const candidates = [];
  for (const sideInfo of normalizedJoints) {
    let upperSlot = -1;
    let lowerSlot = -1;
    let upperWeight = 0;
    let lowerWeight = 0;
    for (let slot = 0; slot < 4; slot++) {
      if (vertexJoints[slot] === sideInfo.upper) { upperSlot = slot; upperWeight += vertexWeights[slot]; }
      if (vertexJoints[slot] === sideInfo.lower) { lowerSlot = slot; lowerWeight += vertexWeights[slot]; }
    }
    const t = point.clone().sub(sideInfo.knee).dot(sideInfo.segment) / sideInfo.lengthSq;
    if (t < -0.08 || t > 1.05) continue;
    const projected = sideInfo.knee.clone().addScaledVector(sideInfo.segment, t);
    const distance = point.distanceTo(projected);
    if (distance > 0.19) continue;
    let replacementSlot = -1;
    let replacementWeight = 0;
    if (lowerSlot < 0 && upperSlot >= 0) {
      for (let slot = 0; slot < 4; slot++) {
        if (slot === upperSlot) continue;
        const name = names[vertexJoints[slot]];
        if (/(?:Foot|Toe|Hand|End)$/.test(name)) continue;
        const candidateWeight = vertexWeights[slot];
        if ((candidateWeight > replacementWeight && candidateWeight <= 0.14)
          || (candidateWeight === 0 && replacementSlot < 0)) {
          replacementSlot = slot;
          replacementWeight = candidateWeight;
        }
      }
    }
    const transferWeight = upperWeight + lowerWeight + replacementWeight;
    if (transferWeight < 0.35 || upperSlot < 0 || (lowerSlot < 0 && replacementSlot < 0)) continue;
    candidates.push({ sideInfo, upperSlot, lowerSlot: lowerSlot < 0 ? replacementSlot : lowerSlot, upperWeight, lowerWeight, transferWeight, replacementWeight, t, distance });
  }
  if (!candidates.length) continue;
  candidates.sort((a, b) => a.distance - b.distance);
  const { sideInfo, upperSlot, lowerSlot, upperWeight, lowerWeight, transferWeight, replacementWeight, t, distance } = candidates[0];
  const lowerWasMissing = lowerWeight <= 1e-8;
  if (lowerWasMissing && lowerSlot < 0) { skippedMissingPair++; continue; }
  const side = calfBefore[sideInfo.side];
  if (t >= 0 && t <= 0.85 && distance <= 0.145) {
    side.n++;
    side.upper += upperWeight;
    side.lower += lowerWeight;
  }
  const kneeRamp = smoothstep(0.0, 0.18, t);
  const ankleFade = 1 - smoothstep(0.78, 0.94, t);
  const radialFade = 1 - smoothstep(0.145, 0.19, distance);
  const amount = kneeRamp * ankleFade * radialFade;
  if (amount <= 0.001) continue;
  const currentLowerShare = lowerWeight / transferWeight;
  const appliedLowerShare = currentLowerShare + (targetLowerLegShare - currentLowerShare) * amount;
  const targetLowerRaw = Math.max(0, Math.min(weightUnitMax, Math.round(transferWeight * appliedLowerShare * weightUnitMax)));
  const pairRaw = [0, 1, 2, 3].reduce((sum, slot) => sum + (vertexJoints[slot] === sideInfo.upper || vertexJoints[slot] === sideInfo.lower || (lowerWasMissing && slot === lowerSlot) ? sourceWeights[vertex * 4 + slot] : 0), 0);
  const targetUpperRaw = pairRaw - targetLowerRaw;
  let oldLowerRaw = 0;
  for (let slot = 0; slot < 4; slot++) if (vertexJoints[slot] === sideInfo.lower) oldLowerRaw += resultWeights[vertex * 4 + slot];
  if (!Number.isFinite(targetUpperRaw) || targetUpperRaw < 0 || targetLowerRaw < 0 || targetLowerRaw > pairRaw) throw new Error(`Invalid proposed weights at vertex ${vertex}`);
  resultWeights[vertex * 4 + upperSlot] = targetUpperRaw;
  resultWeights[vertex * 4 + lowerSlot] = targetLowerRaw;
  if (lowerWasMissing) resultJointIndices[vertex * 4 + lowerSlot] = sideInfo.lower;
  if (targetLowerRaw === oldLowerRaw && !lowerWasMissing) continue;
  changedVertices++;
  changedVertexSet.add(vertex);
  selectedBySide[sideInfo.side]++;
  changedWeightUnits += Math.abs(targetLowerRaw - oldLowerRaw);
  const originalPoint = new THREE.Vector3().fromArray(position.getElement(vertex, []));
  const originalBind = new THREE.Vector3();
  const correctedBind = new THREE.Vector3();
  for (let slot = 0; slot < 4; slot++) {
    const sourceMatrix = skinMatrices[vertexJoints[slot]];
    const resultMatrix = skinMatrices[resultJointIndices[vertex * 4 + slot]];
    originalBind.addScaledVector(originalPoint.clone().applyMatrix4(sourceMatrix), sourceWeights[vertex * 4 + slot] / weightUnitMax);
    correctedBind.addScaledVector(originalPoint.clone().applyMatrix4(resultMatrix), resultWeights[vertex * 4 + slot] / weightUnitMax);
  }
  maxRestDeltaMeters = Math.max(maxRestDeltaMeters, originalBind.distanceTo(correctedBind) * runtimeScale);
}

for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = normalizePoint(normalizedRest[vertex]);
  const vertexJoints = Array.from(resultJointIndices.slice(vertex * 4, vertex * 4 + 4));
  for (const sideInfo of normalizedJoints) {
    let lowerWeight = 0;
    for (let slot = 0; slot < 4; slot++) if (vertexJoints[slot] === sideInfo.lower) lowerWeight += resultWeights[vertex * 4 + slot] / weightUnitMax;
    const t = point.clone().sub(sideInfo.knee).dot(sideInfo.segment) / sideInfo.lengthSq;
    if (t >= 0 && t <= 0.85 && point.distanceTo(sideInfo.knee.clone().addScaledVector(sideInfo.segment, t)) <= 0.145) {
      const row = calfAfter[sideInfo.side];
      row.n++;
      row.lower += lowerWeight;
      for (let slot = 0; slot < 4; slot++) if (vertexJoints[slot] === sideInfo.upper) row.upper += resultWeights[vertex * 4 + slot] / weightUnitMax;
    }
  }
}

for (let offset = 0; offset < indices.length; offset += 3) {
  const tri = [indices[offset], indices[offset + 1], indices[offset + 2]];
  for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeSet.has(key) || (!changedVertexSet.has(a) && !changedVertexSet.has(b))) continue;
    edgeSet.add(key);
    for (const sideInfo of normalizedJoints) {
      maxLowerEdgeJumpBefore = Math.max(maxLowerEdgeJumpBefore, Math.abs(ownLowerWeight(a, sideInfo, sourceWeights) - ownLowerWeight(b, sideInfo, sourceWeights)));
      maxLowerEdgeJumpAfter = Math.max(maxLowerEdgeJumpAfter, Math.abs(ownLowerWeight(a, sideInfo, resultWeights, resultJointIndices) - ownLowerWeight(b, sideInfo, resultWeights, resultJointIndices)));
    }
  }
}
if (changedVertices < 100) throw new Error(`Too few eligible vertices changed: ${changedVertices}`);
if (maxRestDeltaMeters > 1e-6) throw new Error(`Bind pose changed by ${maxRestDeltaMeters} m`);
if (maxLowerEdgeJumpAfter > maxLowerEdgeJumpBefore + 0.08) throw new Error(`Weight continuity worsened: ${maxLowerEdgeJumpBefore} -> ${maxLowerEdgeJumpAfter}`);

joints.setArray(resultJointIndices);
weights.setArray(resultWeights);
if (signature(doc) !== beforeSignature) throw new Error('Unexpected change outside JOINTS_0/WEIGHTS_0');
const staging = `${output}.staging.glb`;
await io.write(staging, doc);
const reread = await io.read(staging);
const rereadPrimitive = reread.getRoot().listMeshes()[0].listPrimitives()[0];
if (signature(reread) !== beforeSignature || hash(rereadPrimitive.getAttribute('WEIGHTS_0').getArray()) !== hash(resultWeights) || hash(rereadPrimitive.getAttribute('JOINTS_0').getArray()) !== hash(resultJointIndices)) throw new Error('Serialized candidate failed invariant check');
await rename(staging, output);
const report = {
  input,
  output,
  sourceSha256: createHash('sha256').update(await readFile(input)).digest('hex'),
  changedVertices,
  selectedBySide,
  changedWeightUnits,
  skippedMissingPair,
  runtimeScale,
  targetLowerLegShare,
  calfBefore: Object.fromEntries(Object.entries(calfBefore).map(([side, row]) => [side, { vertices: row.n, meanUpperWeight: row.n ? row.upper / row.n : 0, meanLowerWeight: row.n ? row.lower / row.n : 0 }])),
  calfAfter: Object.fromEntries(Object.entries(calfAfter).map(([side, row]) => [side, { vertices: row.n, meanUpperWeight: row.n ? row.upper / row.n : 0, meanLowerWeight: row.n ? row.lower / row.n : 0 }])),
  maxLowerEdgeJumpBefore,
  maxLowerEdgeJumpAfter,
  maxRestDeltaMeters,
  geometryBindClipsMaterialsUnchanged: true,
};
await writeFile(`${output}.audit.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
