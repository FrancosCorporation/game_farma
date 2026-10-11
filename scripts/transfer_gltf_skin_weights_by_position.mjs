#!/usr/bin/env node
// Move weights from a re-rigged copy back onto a target GLB by world-space
// vertex correspondence, preserving the target's own bind matrices and clips.
// Usage: node scripts/transfer_gltf_skin_weights_by_position.mjs <weighted-source.glb> <target.glb> <output.glb> [maxDistance=0.03]
import { createHash } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [sourcePath, targetPath, outputPath, maxDistanceArg = '0.03'] = process.argv.slice(2);
if (!sourcePath || !targetPath || !outputPath || sourcePath === '--help') {
  console.log('Uso: node scripts/transfer_gltf_skin_weights_by_position.mjs <weighted-source.glb> <target.glb> <output.glb> [maxDistance=0.03]');
  process.exit(sourcePath ? 0 : 2);
}
if (outputPath === targetPath || outputPath === sourcePath) throw new Error('a saída deve ser separada das entradas');
try {
  await access(outputPath);
  throw new Error(`a saída já existe; preserve-a e escolha outro caminho: ${outputPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const maxDistance = Number(maxDistanceArg);
if (!(maxDistance >= 0.001 && maxDistance <= 0.15)) throw new Error('maxDistance deve ficar entre 0,001 e 0,15 m');

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const [sourceDoc, targetDoc] = await Promise.all([io.read(sourcePath), io.read(targetPath)]);
const sourceRoot = sourceDoc.getRoot();
const targetRoot = targetDoc.getRoot();
if (sourceRoot.listSkins().length !== 1 || targetRoot.listSkins().length !== 1) {
  throw new Error('fonte e alvo precisam conter exatamente uma skin');
}
const sourceSkin = sourceRoot.listSkins()[0];
const targetSkin = targetRoot.listSkins()[0];
const sourceJoints = sourceSkin.listJoints();
const targetJoints = targetSkin.listJoints();
if (sourceJoints.length !== 65 || targetJoints.length !== 65) throw new Error('esperados 65 joints em ambos os GLBs');
const targetJointIndex = new Map(targetJoints.map((node, index) => [node.getName(), index]));
const sourceToTarget = sourceJoints.map((node) => {
  const index = targetJointIndex.get(node.getName());
  if (index == null) throw new Error(`joint da fonte ausente no alvo: ${node.getName()}`);
  return index;
});

const meshPrimitive = (document, label) => {
  const nodes = document.getRoot().listNodes().filter((node) => node.getSkin() && node.getMesh());
  if (nodes.length !== 1) throw new Error(`${label}: esperado um único node skinned; encontrados ${nodes.length}`);
  const node = nodes[0];
  const primitives = node.getMesh().listPrimitives();
  if (primitives.length !== 1) throw new Error(`${label}: esperado uma primitive; encontradas ${primitives.length}`);
  const primitive = primitives[0];
  for (const attribute of ['POSITION', 'JOINTS_0', 'WEIGHTS_0']) {
    if (!primitive.getAttribute(attribute)) throw new Error(`${label}: atributo ${attribute} ausente`);
  }
  if (primitive.getAttribute('JOINTS_1') || primitive.getAttribute('WEIGHTS_1')) {
    throw new Error(`${label}: JOINTS_1/WEIGHTS_1 não são suportados por este helper`);
  }
  return { node, primitive };
};
const sourceMesh = meshPrimitive(sourceDoc, 'fonte');
const targetMesh = meshPrimitive(targetDoc, 'alvo');
const sourcePositions = sourceMesh.primitive.getAttribute('POSITION');
const sourceJointsAttr = sourceMesh.primitive.getAttribute('JOINTS_0');
const sourceWeightsAttr = sourceMesh.primitive.getAttribute('WEIGHTS_0');
const targetPositions = targetMesh.primitive.getAttribute('POSITION');
const targetJointsAttr = targetMesh.primitive.getAttribute('JOINTS_0');
const targetWeightsAttr = targetMesh.primitive.getAttribute('WEIGHTS_0');
if (sourcePositions.getCount() !== sourceJointsAttr.getCount() || sourcePositions.getCount() !== sourceWeightsAttr.getCount()) {
  throw new Error('contagens POSITION/skin da fonte divergem');
}
if (targetPositions.getCount() !== targetJointsAttr.getCount() || targetPositions.getCount() !== targetWeightsAttr.getCount()) {
  throw new Error('contagens POSITION/skin do alvo divergem');
}

const hashArray = (array) => createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const invariantSignature = (document) => {
  const r = document.getRoot();
  const parentByNode = new Map();
  for (const node of r.listNodes()) for (const child of node.listChildren()) parentByNode.set(child, node);
  const nodes = r.listNodes().map((node) => ({
    name: node.getName(), parent: parentByNode.get(node)?.getName() ?? null,
    translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
  }));
  const skins = r.listSkins().map((skin) => ({
    name: skin.getName(), joints: skin.listJoints().map((joint) => joint.getName()),
    inverseBindMatrices: skin.getInverseBindMatrices()?.getArray()
      ? hashArray(skin.getInverseBindMatrices().getArray()) : null,
  }));
  const animations = r.listAnimations().map((animation) => ({
    name: animation.getName(), channels: animation.listChannels().map((channel) => ({
      node: channel.getTargetNode()?.getName() ?? null,
      path: channel.getTargetPath(),
      interpolation: channel.getSampler()?.getInterpolation() ?? null,
      input: channel.getSampler()?.getInput()?.getArray()
        ? hashArray(channel.getSampler().getInput().getArray()) : null,
      output: channel.getSampler()?.getOutput()?.getArray()
        ? hashArray(channel.getSampler().getOutput().getArray()) : null,
    })),
  }));
  return JSON.stringify({ nodes, skins, animations });
};
const beforeInvariant = invariantSignature(targetDoc);

const vector = new Vector3();
const sourceMatrix = new Matrix4().fromArray(sourceMesh.node.getWorldMatrix());
const targetMatrix = new Matrix4().fromArray(targetMesh.node.getWorldMatrix());
const pos = [0, 0, 0];
const sourcePoints = new Array(sourcePositions.getCount());
const sourceBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let index = 0; index < sourcePositions.getCount(); index++) {
  sourcePositions.getElement(index, pos);
  vector.set(pos[0], pos[1], pos[2]).applyMatrix4(sourceMatrix);
  const point = [vector.x, vector.y, vector.z];
  sourcePoints[index] = point;
  for (let axis = 0; axis < 3; axis++) {
    sourceBounds.min[axis] = Math.min(sourceBounds.min[axis], point[axis]);
    sourceBounds.max[axis] = Math.max(sourceBounds.max[axis], point[axis]);
  }
}
console.log(`[remap] sourceWorldMatrix=${JSON.stringify(Array.from(sourceMatrix.elements))}`);
console.log(`[remap] sourceWorldBounds=${JSON.stringify(sourceBounds)} firstPositions=${JSON.stringify(sourcePoints.slice(0, 3))}`);
const targetBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const targetCount = targetPositions.getCount();
const mapping = new Uint32Array(targetCount);
const distances = new Float32Array(targetCount);
const targetPoints = new Array(targetCount);
for (let index = 0; index < targetCount; index++) {
  targetPositions.getElement(index, pos);
  vector.set(pos[0], pos[1], pos[2]).applyMatrix4(targetMatrix);
  const point = [vector.x, vector.y, vector.z];
  for (let axis = 0; axis < 3; axis++) {
    targetBounds.min[axis] = Math.min(targetBounds.min[axis], point[axis]);
    targetBounds.max[axis] = Math.max(targetBounds.max[axis], point[axis]);
  }
  targetPoints[index] = point;
}
console.log(`[remap] targetWorldMatrix=${JSON.stringify(Array.from(targetMatrix.elements))}`);
console.log(`[remap] targetWorldBounds=${JSON.stringify(targetBounds)} firstPositions=${JSON.stringify(targetPoints.slice(0, 3))}`);
const dimensionDelta = Math.max(...targetBounds.min.map((value, axis) => Math.abs(value - sourceBounds.min[axis])),
  ...targetBounds.max.map((value, axis) => Math.abs(value - sourceBounds.max[axis])));
const runtimeHeight = targetBounds.max[1] - targetBounds.min[1];
if (!(runtimeHeight > 1e-5)) throw new Error(`altura global inválida para correspondência: ${runtimeHeight}`);
const runtimeScale = 1.72 / runtimeHeight;
const maxDistanceInSourceUnits = maxDistance / runtimeScale;
console.log(`[remap] runtimeScale=${runtimeScale.toFixed(3)} maxDistanceSourceUnits=${maxDistanceInSourceUnits.toFixed(7)}`);
if (dimensionDelta * runtimeScale > 0.5) throw new Error(`quadros globais claramente divergentes (delta bbox ${(dimensionDelta * runtimeScale).toFixed(3)}m); nada foi escrito`);
// Balanced 3D KD tree keeps this remap O(N log N), independent of the model's
// unusual accessor units (the web loader normalizes the model to 1.72 m).
const order = new Uint32Array(sourcePoints.length);
for (let index = 0; index < order.length; index++) order[index] = index;
const leftChild = [], rightChild = [], splitAxis = [], pointIndex = [];
const compareIndex = (a, b, axis) => (sourcePoints[a][axis] - sourcePoints[b][axis]) || (a - b);
const selectMedian = (low, high, kth, axis) => {
  while (low < high) {
    const pivot = order[(low + high) >> 1];
    let i = low, j = high;
    while (i <= j) {
      while (compareIndex(order[i], pivot, axis) < 0) i++;
      while (compareIndex(order[j], pivot, axis) > 0) j--;
      if (i <= j) { const temp = order[i]; order[i] = order[j]; order[j] = temp; i++; j--; }
    }
    if (kth <= j) high = j;
    else if (kth >= i) low = i;
    else return;
  }
};
const buildTree = (low, high, depth = 0) => {
  if (low >= high) return -1;
  const axis = depth % 3;
  const middle = (low + high) >> 1;
  selectMedian(low, high - 1, middle, axis);
  const id = pointIndex.length;
  pointIndex.push(order[middle]); splitAxis.push(axis); leftChild.push(-1); rightChild.push(-1);
  leftChild[id] = buildTree(low, middle, depth + 1);
  rightChild[id] = buildTree(middle + 1, high, depth + 1);
  return id;
};
const treeRoot = buildTree(0, order.length);
console.log(`[remap] kdTree nodes=${pointIndex.length}`);
const searchNearest = (point) => {
  let bestIndex = -1, bestDistanceSq = Infinity;
  const visit = (nodeId) => {
    if (nodeId < 0) return;
    const index = pointIndex[nodeId];
    const candidate = sourcePoints[index];
    const dx = point[0] - candidate[0], dy = point[1] - candidate[1], dz = point[2] - candidate[2];
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq < bestDistanceSq) { bestDistanceSq = distanceSq; bestIndex = index; }
    const axis = splitAxis[nodeId];
    const delta = point[axis] - candidate[axis];
    const near = delta < 0 ? leftChild[nodeId] : rightChild[nodeId];
    const far = delta < 0 ? rightChild[nodeId] : leftChild[nodeId];
    visit(near);
    if (delta * delta < bestDistanceSq) visit(far);
  };
  visit(treeRoot);
  return [bestIndex, Math.sqrt(bestDistanceSq)];
};
for (let index = 0; index < targetCount; index++) {
  const point = targetPoints[index];
  const [sourceIndex, localDistance] = searchNearest(point);
  const distance = localDistance * runtimeScale;
  if (sourceIndex < 0 || !Number.isFinite(distance)) throw new Error(`nenhum vértice fonte próximo ao alvo ${index}`);
  mapping[index] = sourceIndex;
  distances[index] = distance;
}
const sortedDistances = Array.from(distances).sort((a, b) => a - b);
const quantile = (p) => sortedDistances[Math.min(sortedDistances.length - 1, Math.floor(p * (sortedDistances.length - 1)))];
const maxMappedDistance = sortedDistances.at(-1);
console.log(`[remap] sourceVertices=${sourcePositions.getCount()} targetVertices=${targetCount}`);
console.log(`[remap] sourceBounds=${JSON.stringify(sourceBounds)} targetBounds=${JSON.stringify(targetBounds)}`);
console.log(`[remap] nearestDistanceMeters=${JSON.stringify({
  p50: +quantile(.50).toFixed(5), p95: +quantile(.95).toFixed(5),
  p99: +quantile(.99).toFixed(5), max: +maxMappedDistance.toFixed(5),
})}`);
if (maxMappedDistance > maxDistance) {
  throw new Error(`correspondência geométrica insuficiente: máximo=${maxMappedDistance.toFixed(4)}m > ${maxDistance.toFixed(4)}m; nada foi escrito`);
}

const sourceJointEl = [0, 0, 0, 0];
const sourceWeightEl = [0, 0, 0, 0];
const targetJointEl = [0, 0, 0, 0];
const targetWeightEl = [0, 0, 0, 0];
for (let index = 0; index < targetCount; index++) {
  const sourceIndex = mapping[index];
  sourceJointsAttr.getElement(sourceIndex, sourceJointEl);
  sourceWeightsAttr.getElement(sourceIndex, sourceWeightEl);
  let sum = 0;
  for (let slot = 0; slot < 4; slot++) {
    const sourceJoint = Number(sourceJointEl[slot]);
    const weight = Number(sourceWeightEl[slot]);
    targetJointEl[slot] = sourceToTarget[sourceJoint] ?? 0;
    targetWeightEl[slot] = weight;
    sum += weight;
  }
  if (!(sum > 1e-8) || !Number.isFinite(sum)) throw new Error(`pesos fonte inválidos no vértice ${sourceIndex}`);
  for (let slot = 0; slot < 4; slot++) targetWeightEl[slot] /= sum;
  targetJointsAttr.setElement(index, targetJointEl);
  targetWeightsAttr.setElement(index, targetWeightEl);
}

await io.write(outputPath, targetDoc);
const verifyDoc = await io.read(outputPath);
if (invariantSignature(verifyDoc) !== beforeInvariant) {
  throw new Error('Skeleton, IBMs, hierarquia ou canais mudaram durante a transferência; saída rejeitada.');
}
console.log(`[remap] target rig/IBM/hierarquia/clips preservados; output=${outputPath} bytes=${(await stat(outputPath)).size}`);
