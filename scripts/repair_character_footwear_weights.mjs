// Reassign leg-chain weight from shoe vertices to the corresponding foot.
// The edit is spatially limited to the foot volume and writes a new candidate.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const [input, output, ...options] = process.argv.slice(2);
const allowedOptions = new Set(['--include-sole', '--preserve-contact-anchors']);
if (!input || !output || resolve(input) === resolve(output) || options.some((option) => !allowedOptions.has(option))) {
  throw new Error('Usage: node scripts/repair_character_footwear_weights.mjs input.glb separate-output.glb [--include-sole] [--preserve-contact-anchors]');
}
const includeRestSoleVertices = options.includes('--include-sole');
const preserveContactAnchors = options.includes('--preserve-contact-anchors');
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
const sourceJointIndices = joints.getArray();
const sourceWeights = weights.getArray();
const unitMax = sourceWeights instanceof Uint16Array ? 65535 : sourceWeights instanceof Uint8Array ? 255 : 0;
if (!unitMax || !weights.getNormalized()) throw new Error('Expected normalized Uint8/Uint16 WEIGHTS_0');

const names = skin.listJoints().map((joint) => joint.getName());
const jointIndex = new Map(names.map((name, index) => [name, index]));
const sideData = ['Left', 'Right'].map((side) => {
  const upper = jointIndex.get(`mixamorig:${side}UpLeg`);
  const lower = jointIndex.get(`mixamorig:${side}Leg`);
  const foot = jointIndex.get(`mixamorig:${side}Foot`);
  const toe = jointIndex.get(`mixamorig:${side}ToeBase`);
  if ([upper, lower, foot, toe].some((index) => index === undefined)) throw new Error(`Missing ${side} foot joints`);
  return { side, upper, lower, foot, toe };
});

const hash = (array) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const signature = (document) => JSON.stringify({
  nodes: document.getRoot().listNodes().map((item) => [item.getName(), item.getTranslation(), item.getRotation(), item.getScale(), item.listChildren().map((child) => child.getName())]),
  skins: document.getRoot().listSkins().map((item) => [item.listJoints().map((joint) => joint.getName()), hash(item.getInverseBindMatrices().getArray())]),
  clips: document.getRoot().listAnimations().map((animation) => [animation.getName(), animation.listChannels().map((channel) => [channel.getTargetNode().getName(), channel.getTargetPath(), channel.getSampler().getInterpolation(), hash(channel.getSampler().getInput().getArray()), hash(channel.getSampler().getOutput().getArray())])]),
  attrs: document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((item) => [hash(item.getIndices().getArray()), item.listSemantics().filter((semantic) => !['JOINTS_0', 'WEIGHTS_0'].includes(semantic)).map((semantic) => [semantic, hash(item.getAttribute(semantic).getArray())])])),
  materials: document.getRoot().listMaterials().map((material) => [material.getName(), material.getBaseColorFactor(), material.getRoughnessFactor(), material.getMetallicFactor(), material.getDoubleSided()]),
  textures: document.getRoot().listTextures().map((texture) => hash(texture.getImage())),
});

const originalSignature = signature(doc);
const resultJointIndices = sourceJointIndices.slice();
const resultWeights = sourceWeights.slice();
const ibm = skin.getInverseBindMatrices();
const skinMatrices = skin.listJoints().map((joint, index) => new THREE.Matrix4().fromArray(joint.getWorldMatrix()).multiply(new THREE.Matrix4().fromArray(ibm.getElement(index, []))));
const restPositions = [];
const bounds = new THREE.Box3();
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = new THREE.Vector3().fromArray(position.getElement(vertex, []));
  const vertexJoints = sourceJointIndices.slice(vertex * 4, vertex * 4 + 4);
  const vertexWeights = weights.getElement(vertex, []);
  const restPoint = new THREE.Vector3();
  for (let slot = 0; slot < 4; slot++) restPoint.addScaledVector(point.clone().applyMatrix4(skinMatrices[vertexJoints[slot]]), vertexWeights[slot]);
  restPositions.push(restPoint);
  bounds.expandByPoint(restPoint);
}
const axisFix = new THREE.Matrix4();
if (bounds.getSize(new THREE.Vector3()).z > bounds.getSize(new THREE.Vector3()).y * 1.5) axisFix.makeRotationX(-Math.PI / 2);
bounds.applyMatrix4(axisFix);
const center = bounds.getCenter(new THREE.Vector3());
const runtimeScale = 1.72 / bounds.getSize(new THREE.Vector3()).y;
const floorY = (bounds.min.y - center.y) * runtimeScale;
const normalizePoint = (point) => point.clone().applyMatrix4(axisFix).sub(center).multiplyScalar(runtimeScale);
const contactAnchors = new Set();
const footCandidateVertices = new Set();
if (preserveContactAnchors) {
  for (const data of sideData) {
    const candidates = [];
    for (let vertex = 0; vertex < position.getCount(); vertex++) {
      let footWeight = 0;
      for (let slot = 0; slot < 4; slot++) {
        const joint = sourceJointIndices[vertex * 4 + slot];
        if (joint === data.foot || joint === data.toe) footWeight += sourceWeights[vertex * 4 + slot] / unitMax;
      }
      if (footWeight >= 0.15) {
        const row = { vertex, y: normalizePoint(restPositions[vertex]).y };
        candidates.push(row);
        footCandidateVertices.add(vertex);
      }
    }
    candidates.sort((a, b) => a.y - b.y);
    if (!candidates.length) continue;
    const landmarkPool = candidates.filter((row) => row.y <= candidates[0].y + 0.004);
    const landmarkCount = Math.min(64, landmarkPool.length);
    for (let index = 0; index < landmarkCount; index++) {
      contactAnchors.add(landmarkPool[Math.floor(index * landmarkPool.length / landmarkCount)].vertex);
    }
  }
}
for (const data of sideData) {
  data.ankle = normalizePoint(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.listJoints()[data.foot].getWorldMatrix())));
  data.toeTip = normalizePoint(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(skin.listJoints()[data.toe].getWorldMatrix())));
  data.segment = data.toeTip.clone().sub(data.ankle);
  data.lengthSq = data.segment.lengthSq();
  if (data.lengthSq < 0.025 ** 2) throw new Error(`${data.side} ankle-to-toe segment is too short`);
}

const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
let changedVertices = 0;
let skippedContactAnchors = 0;
let skippedNewGroundingCandidates = 0;
let maxBindDeltaMeters = 0;
let changedBySide = { Left: 0, Right: 0 };
let transferredWeight = { Left: 0, Right: 0 };
const changedSet = new Set();

for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = normalizePoint(restPositions[vertex]);
  const oldIndices = Array.from(sourceJointIndices.slice(vertex * 4, vertex * 4 + 4));
  const oldRaw = Array.from(sourceWeights.slice(vertex * 4, vertex * 4 + 4));
  const choices = [];
  for (const data of sideData) {
    const delta = point.clone().sub(data.ankle);
    const t = delta.dot(data.segment) / data.lengthSq;
    if (t < -0.18 || t > 1.12) continue;
    const distance = point.distanceTo(data.ankle.clone().addScaledVector(data.segment, t));
    if (distance >= 0.125) continue;
    const ankleFade = 1 - smoothstep(data.ankle.y - 0.018, data.ankle.y + 0.032, point.y);
    const radialFade = 1 - smoothstep(0.075, 0.125, distance);
    const endFade = smoothstep(-0.18, -0.08, t) * (1 - smoothstep(1.02, 1.12, t));
    // Default mode protects rest-sole anchors. The opt-in mode includes them
    // when a diagnostic shows that poor leg weights are deforming the outsole;
    // the resulting candidate must pass the contact audit again.
    const soleFade = includeRestSoleVertices ? 1 : smoothstep(floorY + 0.007, floorY + 0.022, point.y);
    const amount = ankleFade * radialFade * endFade * soleFade;
    if (amount <= 0.01) continue;
    let legRaw = 0;
    for (let slot = 0; slot < 4; slot++) if (oldIndices[slot] === data.upper || oldIndices[slot] === data.lower) legRaw += oldRaw[slot];
    if (legRaw < unitMax * 0.05) continue;
    choices.push({ data, t, amount, distance, legRaw });
  }
  if (!choices.length) continue;
  choices.sort((a, b) => a.distance - b.distance);
  const { data, t, amount, legRaw } = choices[0];
  if (preserveContactAnchors && contactAnchors.has(vertex)) {
    skippedContactAnchors++;
    continue;
  }
  const transferRaw = Math.min(legRaw, Math.round(legRaw * amount));
  if (transferRaw <= 0) continue;
  if (preserveContactAnchors && !footCandidateVertices.has(vertex)) {
    let oldFootRaw = 0;
    for (let slot = 0; slot < 4; slot++) {
      if (oldIndices[slot] === data.foot || oldIndices[slot] === data.toe) oldFootRaw += oldRaw[slot];
    }
    if (oldFootRaw < unitMax * 0.15 && oldFootRaw + transferRaw >= unitMax * 0.15) {
      skippedNewGroundingCandidates++;
      continue;
    }
  }
  const toePresent = oldIndices.includes(data.toe);
  const footPresent = oldIndices.includes(data.foot);
  const targetToeSlot = oldIndices.indexOf(data.toe);
  const sourceSlots = [0, 1, 2, 3].filter((slot) => oldIndices[slot] === data.upper || oldIndices[slot] === data.lower);
  let remaining = transferRaw;
  for (const slot of sourceSlots) {
    const take = Math.min(remaining, resultWeights[vertex * 4 + slot]);
    resultWeights[vertex * 4 + slot] -= take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining !== 0) throw new Error(`Failed to remove leg weight at vertex ${vertex}`);
  let targetFootSlot = oldIndices.indexOf(data.foot);
  if (targetFootSlot < 0) targetFootSlot = resultWeights.slice(vertex * 4, vertex * 4 + 4).findIndex((value) => value === 0);
  // A partially retained source slot cannot be relabeled as Foot. Skip those
  // vertices until a source slot is fully released or a zero slot is available.
  if (targetFootSlot < 0) {
    for (const slot of sourceSlots) resultWeights[vertex * 4 + slot] = oldRaw[slot];
    continue;
  }
  if (!footPresent) resultJointIndices[vertex * 4 + targetFootSlot] = data.foot;
  const toeShare = toePresent ? 0.25 + 0.45 * smoothstep(0.35, 0.9, t) : 0;
  const toeRaw = targetToeSlot >= 0 ? Math.round(transferRaw * toeShare) : 0;
  resultWeights[vertex * 4 + targetFootSlot] += transferRaw - toeRaw;
  if (toeRaw > 0) resultWeights[vertex * 4 + targetToeSlot] += toeRaw;

  changedVertices++;
  changedSet.add(vertex);
  changedBySide[data.side]++;
  transferredWeight[data.side] += transferRaw / unitMax;

  const originalPoint = new THREE.Vector3().fromArray(position.getElement(vertex, []));
  const originalBind = new THREE.Vector3();
  const correctedBind = new THREE.Vector3();
  for (let slot = 0; slot < 4; slot++) {
    originalBind.addScaledVector(originalPoint.clone().applyMatrix4(skinMatrices[oldIndices[slot]]), oldRaw[slot] / unitMax);
    correctedBind.addScaledVector(originalPoint.clone().applyMatrix4(skinMatrices[resultJointIndices[vertex * 4 + slot]]), resultWeights[vertex * 4 + slot] / unitMax);
  }
  maxBindDeltaMeters = Math.max(maxBindDeltaMeters, originalBind.distanceTo(correctedBind) * runtimeScale);
}

if (changedVertices < 20) throw new Error(`Too few footwear vertices changed: ${changedVertices}`);
if (maxBindDeltaMeters > 0.00002) throw new Error(`Bind pose changed by ${maxBindDeltaMeters} m`);
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const total = resultWeights.slice(vertex * 4, vertex * 4 + 4).reduce((sum, value) => sum + value, 0);
  if (total !== unitMax) throw new Error(`Weight normalization failed at vertex ${vertex}: ${total}`);
}

joints.setArray(resultJointIndices);
weights.setArray(resultWeights);
if (signature(doc) !== originalSignature) throw new Error('Unexpected change outside JOINTS_0/WEIGHTS_0');
const staging = `${output}.staging.glb`;
await io.write(staging, doc);
const reread = await io.read(staging);
const rereadPrimitive = reread.getRoot().listMeshes()[0].listPrimitives()[0];
if (signature(reread) !== originalSignature || hash(rereadPrimitive.getAttribute('WEIGHTS_0').getArray()) !== hash(resultWeights) || hash(rereadPrimitive.getAttribute('JOINTS_0').getArray()) !== hash(resultJointIndices)) throw new Error('Serialized candidate failed invariant check');
await rename(staging, output);
const report = {
  input,
  output,
  sourceSha256: createHash('sha256').update(await readFile(input)).digest('hex'),
  changedVertices,
  changedBySide,
  transferredWeight,
  runtimeScale,
  maxBindDeltaMeters,
  includeRestSoleVertices,
  preserveContactAnchors,
  contactAnchorVertices: contactAnchors.size,
  skippedContactAnchors,
  skippedNewGroundingCandidates,
  footwearBounds: { ankleFadeMeters: [-0.018, 0.032], radiusFadeMeters: [0.075, 0.125], footAxisT: [-0.18, 1.12], soleFadeAboveRestFloorMeters: [0.007, 0.022] },
  geometryBindClipsMaterialsUnchanged: true,
};
await writeFile(`${output}.audit.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
