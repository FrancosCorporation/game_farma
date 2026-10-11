#!/usr/bin/env node
// Smooth WEIGHTS_0 over the target mesh's own topology, without re-exporting
// the armature or clips. The GLB skeleton, inverse-bind matrices and animation
// accessors are checked unchanged after writing.
// Usage: node scripts/smooth_gltf_skin_weights.mjs <input.glb> <output.glb> [iterations=3] [factor=0.30]
import { createHash } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, iterationsArg = '3', factorArg = '0.3'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/smooth_gltf_skin_weights.mjs <input.glb> <output.glb> [iterations=3] [factor=0.30]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída não pode sobrescrever a entrada');
try {
  await access(output);
  throw new Error(`a saída já existe; escolha outro arquivo para preservar: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const iterations = Number(iterationsArg);
const factor = Number(factorArg);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 12) throw new Error('iterations deve ficar entre 1 e 12');
if (!(factor > 0 && factor <= 0.5)) throw new Error('factor deve ficar em (0, 0.5]');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const root = doc.getRoot();
if (root.listSkins().length !== 1) throw new Error(`esperada 1 skin; encontradas ${root.listSkins().length}`);

const hashArray = (array) => createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
  .digest('hex');
const invariantSignature = (document) => {
  const r = document.getRoot();
  const parentByNode = new Map();
  for (const node of r.listNodes()) for (const child of node.listChildren()) parentByNode.set(child, node);
  const nodeSig = r.listNodes().map((node) => ({
    name: node.getName(),
    parent: parentByNode.get(node)?.getName() ?? null,
    translation: node.getTranslation(),
    rotation: node.getRotation(),
    scale: node.getScale(),
  }));
  const skinSig = r.listSkins().map((skin) => ({
    name: skin.getName(),
    skeleton: skin.getSkeleton()?.getName() ?? null,
    joints: skin.listJoints().map((joint) => joint.getName()),
    inverseBindMatrices: skin.getInverseBindMatrices()?.getArray()
      ? hashArray(skin.getInverseBindMatrices().getArray()) : null,
  }));
  const animationSig = r.listAnimations().map((animation) => ({
    name: animation.getName(),
    channels: animation.listChannels().map((channel) => {
      const sampler = channel.getSampler();
      return {
        node: channel.getTargetNode()?.getName() ?? null,
        path: channel.getTargetPath(),
        interpolation: sampler?.getInterpolation() ?? null,
        input: sampler?.getInput()?.getArray() ? hashArray(sampler.getInput().getArray()) : null,
        output: sampler?.getOutput()?.getArray() ? hashArray(sampler.getOutput().getArray()) : null,
      };
    }),
  }));
  return JSON.stringify({ nodeSig, skinSig, animationSig });
};
const beforeInvariant = invariantSignature(doc);

const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives())
  .filter((primitive) => primitive.getAttribute('JOINTS_0') && primitive.getAttribute('WEIGHTS_0'));
if (!primitives.length) throw new Error('nenhuma primitive com JOINTS_0/WEIGHTS_0');
if (primitives.some((primitive) => primitive.getAttribute('JOINTS_1') || primitive.getAttribute('WEIGHTS_1'))) {
  throw new Error('JOINTS_1/WEIGHTS_1 encontrados; esta versão não altera mais de 4 influências.');
}

function normalizeInfluences(map) {
  const top = [...map.entries()]
    .filter(([, weight]) => weight > 1e-8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const sum = top.reduce((total, [, weight]) => total + weight, 0);
  if (!(sum > 1e-8)) throw new Error('vértice sem soma de pesos positiva');
  return top.map(([joint, weight]) => [joint, weight / sum]);
}

function edgeRoughness(influences, edges) {
  let total = 0;
  for (const [a, b] of edges) {
    const left = new Map(influences[a]);
    const right = new Map(influences[b]);
    const keys = new Set([...left.keys(), ...right.keys()]);
    for (const joint of keys) total += Math.abs((left.get(joint) ?? 0) - (right.get(joint) ?? 0));
  }
  return total / Math.max(edges.length, 1);
}

for (const [primitiveIndex, primitive] of primitives.entries()) {
  if (primitive.getMode() !== Primitive.Mode.TRIANGLES) throw new Error(`primitive ${primitiveIndex} não é TRIANGLES`);
  const jointsAccessor = primitive.getAttribute('JOINTS_0');
  const weightsAccessor = primitive.getAttribute('WEIGHTS_0');
  const count = jointsAccessor.getCount();
  if (weightsAccessor.getCount() !== count) throw new Error('contagem JOINTS/WEIGHTS divergente');
  if (jointsAccessor.getType() !== 'VEC4' || weightsAccessor.getType() !== 'VEC4') throw new Error('JOINTS_0/WEIGHTS_0 devem ser VEC4');

  const jointEl = [0, 0, 0, 0];
  const weightEl = [0, 0, 0, 0];
  let influences = new Array(count);
  for (let index = 0; index < count; index++) {
    jointsAccessor.getElement(index, jointEl);
    weightsAccessor.getElement(index, weightEl);
    const map = new Map();
    for (let slot = 0; slot < 4; slot++) {
      const weight = Number(weightEl[slot]);
      const joint = Number(jointEl[slot]);
      if (weight > 1e-8) map.set(joint, (map.get(joint) ?? 0) + weight);
    }
    influences[index] = normalizeInfluences(map);
  }

  const indicesAccessor = primitive.getIndices();
  const indexCount = indicesAccessor?.getCount() ?? count;
  if (indexCount % 3 !== 0) throw new Error(`primitive ${primitiveIndex}: index count não é múltiplo de 3`);
  const edgeKeys = new Set();
  const edge = (a, b) => {
    if (a === b) return;
    const low = Math.min(a, b), high = Math.max(a, b);
    edgeKeys.add(`${low}:${high}`);
  };
  for (let offset = 0; offset < indexCount; offset += 3) {
    const a = indicesAccessor ? indicesAccessor.getScalar(offset) : offset;
    const b = indicesAccessor ? indicesAccessor.getScalar(offset + 1) : offset + 1;
    const c = indicesAccessor ? indicesAccessor.getScalar(offset + 2) : offset + 2;
    if (a >= count || b >= count || c >= count) throw new Error(`primitive ${primitiveIndex}: índice fora do range`);
    edge(a, b); edge(b, c); edge(c, a);
  }
  const edges = [...edgeKeys].map((value) => value.split(':').map(Number));
  const adjacency = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) { adjacency[a].push(b); adjacency[b].push(a); }

  const roughnessBefore = edgeRoughness(influences, edges);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const updated = new Array(count);
    for (let index = 0; index < count; index++) {
      const neighbors = adjacency[index];
      if (!neighbors.length) { updated[index] = influences[index]; continue; }
      const map = new Map();
      for (const [joint, weight] of influences[index]) map.set(joint, weight * (1 - factor));
      const contribution = factor / neighbors.length;
      for (const neighbor of neighbors) {
        for (const [joint, weight] of influences[neighbor]) {
          map.set(joint, (map.get(joint) ?? 0) + weight * contribution);
        }
      }
      updated[index] = normalizeInfluences(map);
    }
    influences = updated;
  }
  const roughnessAfter = edgeRoughness(influences, edges);
  if (!Number.isFinite(roughnessAfter) || roughnessAfter >= roughnessBefore) {
    throw new Error(`primitive ${primitiveIndex}: roughness não caiu (${roughnessBefore} → ${roughnessAfter})`);
  }

  const outputJoints = new Array(4);
  const outputWeights = new Array(4);
  const outputJointRange = jointsAccessor.getArray();
  if (!outputJointRange) throw new Error('JOINTS_0 accessor sem array');
  const maxJoint = outputJointRange.constructor === Uint8Array ? 255 : 65535;
  for (let index = 0; index < count; index++) {
    const items = influences[index];
    for (let slot = 0; slot < 4; slot++) {
      outputJoints[slot] = items[slot]?.[0] ?? 0;
      outputWeights[slot] = items[slot]?.[1] ?? 0;
      if (outputJoints[slot] > maxJoint) throw new Error(`joint ${outputJoints[slot]} excede o tipo do accessor`);
    }
    jointsAccessor.setElement(index, outputJoints);
    weightsAccessor.setElement(index, outputWeights);
  }

  let minSum = Infinity, maxSum = -Infinity, maxInfluences = 0;
  const verifyJoints = [0, 0, 0, 0], verifyWeights = [0, 0, 0, 0];
  for (let index = 0; index < count; index++) {
    jointsAccessor.getElement(index, verifyJoints);
    weightsAccessor.getElement(index, verifyWeights);
    const sum = verifyWeights.reduce((a, b) => a + b, 0);
    const active = verifyWeights.filter((weight) => weight > 1e-5).length;
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.01) throw new Error(`soma inválida após smooth no vértice ${index}: ${sum}`);
    minSum = Math.min(minSum, sum);
    maxSum = Math.max(maxSum, sum);
    maxInfluences = Math.max(maxInfluences, active);
  }
  console.log(`[weights] primitive=${primitiveIndex} vertices=${count} edges=${edges.length} factor=${factor} iterations=${iterations}`);
  console.log(`[weights] edge roughness ${roughnessBefore.toFixed(6)} → ${roughnessAfter.toFixed(6)} (${((1 - roughnessAfter / roughnessBefore) * 100).toFixed(1)}% reduction)`);
  console.log(`[weights] normalized sums=[${minSum.toFixed(4)},${maxSum.toFixed(4)}] maxInfluences=${maxInfluences}`);
}

// Do not run the general meshopt transform here: it also reorders/quantizes
// resources and may prune hierarchy elements. NodeIO's registered encoder
// rewrites the existing EXT_meshopt bufferViews from the updated accessors.
await io.write(output, doc);
const outputDoc = await io.read(output);
const afterInvariant = invariantSignature(outputDoc);
if (beforeInvariant !== afterInvariant) throw new Error('Skeleton, inverse-bind matrices, hierarchy ou clips mudaram durante a edição dos pesos.');
console.log(`[weights] rig/IBM/hierarquia/clips invariantes: SHA-signature=${createHash('sha256').update(afterInvariant).digest('hex')}`);
console.log(`[weights] output=${output} bytes=${(await stat(output)).size}`);
