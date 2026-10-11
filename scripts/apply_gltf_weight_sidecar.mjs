#!/usr/bin/env node
// Apply Blender-computed weights by exact vertex index while preserving the
// target GLB's geometry, skeleton, inverse-bind matrices, hierarchy, and clips.
// Usage: node scripts/apply_gltf_weight_sidecar.mjs <input.glb> <weights.bin> <output.glb>
import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, sidecarPath, output] = process.argv.slice(2);
if (!input || !sidecarPath || !output || input === '--help') {
  console.log('Uso: node scripts/apply_gltf_weight_sidecar.mjs <input.glb> <weights.bin> <output.glb>');
  process.exit(input ? 0 : 2);
}
if (input === output || sidecarPath === output) throw new Error('a saída precisa ser um arquivo separado');
try {
  await access(output);
  throw new Error(`a saída já existe; escolha outro caminho: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const inputBytes = await readFile(input);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sidecar = await readFile(sidecarPath);
const magic = Buffer.from('FARMAW1\0');
if (sidecar.length < magic.length + 4 || !sidecar.subarray(0, magic.length).equals(magic)) {
  throw new Error('sidecar com magic/versão inválida');
}
const headerLength = sidecar.readUInt32LE(magic.length);
const headerStart = magic.length + 4;
const recordsStart = headerStart + headerLength;
if (recordsStart > sidecar.length) throw new Error('header do sidecar truncado');
const header = JSON.parse(sidecar.toString('utf8', headerStart, recordsStart));
if (header.format !== 'farmacheck-weight-sidecar-v1') throw new Error('formato de sidecar não suportado');
if (header.sourceSha256 !== sha256(inputBytes)) throw new Error('o sidecar foi calculado para outro GLB; nada foi escrito');
if (header.recordBytes !== 24 || !Number.isInteger(header.vertexCount) || header.vertexCount <= 0) {
  throw new Error('metadata do sidecar inválida');
}
if (sidecar.length !== recordsStart + header.vertexCount * header.recordBytes) {
  throw new Error('quantidade de registros do sidecar não confere');
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const root = doc.getRoot();
const skins = root.listSkins();
if (skins.length !== 1) throw new Error(`esperada uma skin; encontradas ${skins.length}`);
const skin = skins[0];
const skinJoints = skin.listJoints();
if (skinJoints.length !== 65 || header.jointNames?.length !== skinJoints.length) {
  throw new Error('a contagem de joints do sidecar/GLB não é 65');
}
const targetJointIndex = new Map(skinJoints.map((joint, index) => [joint.getName(), index]));
if (new Set(header.jointNames).size !== header.jointNames.length) throw new Error('nomes de joint duplicados no sidecar');
const sidecarToTarget = header.jointNames.map((name) => {
  const index = targetJointIndex.get(name);
  if (index == null) throw new Error(`joint do sidecar ausente no GLB: ${name}`);
  return index;
});
if (sidecarToTarget.length !== targetJointIndex.size) throw new Error('o conjunto de joints do sidecar difere do GLB');

const skinnedNodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skinnedNodes.length !== 1) throw new Error(`esperado um node skinned; encontrados ${skinnedNodes.length}`);
const primitives = skinnedNodes[0].getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error(`esperada uma primitive; encontradas ${primitives.length}`);
const primitive = primitives[0];
if (primitive.getMode() !== Primitive.Mode.TRIANGLES) throw new Error('a primitive não usa TRIANGLES');
const position = primitive.getAttribute('POSITION');
const joints = primitive.getAttribute('JOINTS_0');
let weights = primitive.getAttribute('WEIGHTS_0');
if (!position || !joints || !weights) throw new Error('faltam POSITION/JOINTS_0/WEIGHTS_0');
if (primitive.getAttribute('JOINTS_1') || primitive.getAttribute('WEIGHTS_1')) {
  throw new Error('JOINTS_1/WEIGHTS_1 não são suportados');
}
if (position.getCount() !== header.vertexCount || joints.getCount() !== header.vertexCount || weights.getCount() !== header.vertexCount) {
  throw new Error('vertexCount GLB/sidecar diverge; nada foi escrito');
}
if (joints.getType() !== 'VEC4' || weights.getType() !== 'VEC4') throw new Error('JOINTS_0/WEIGHTS_0 devem ser VEC4');

const hashArray = (array) => array ? sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) : null;
const graphSignature = (document) => {
  const r = document.getRoot();
  const parents = new Map();
  for (const node of r.listNodes()) for (const child of node.listChildren()) parents.set(child, node);
  const nodes = r.listNodes().map((node) => ({
    name: node.getName(), parent: parents.get(node)?.getName() ?? null,
    translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
  }));
  const skinsSig = r.listSkins().map((item) => ({
    name: item.getName(), joints: item.listJoints().map((joint) => joint.getName()),
    skeleton: item.getSkeleton()?.getName() ?? null,
    inverseBindMatrices: hashArray(item.getInverseBindMatrices()?.getArray()),
  }));
  const animations = r.listAnimations().map((animation) => ({
    name: animation.getName(), channels: animation.listChannels().map((channel) => ({
      node: channel.getTargetNode()?.getName() ?? null,
      path: channel.getTargetPath(),
      interpolation: channel.getSampler()?.getInterpolation() ?? null,
      input: hashArray(channel.getSampler()?.getInput()?.getArray()),
      output: hashArray(channel.getSampler()?.getOutput()?.getArray()),
    })),
  }));
  const meshes = r.listMeshes().map((mesh) => ({
    name: mesh.getName(), primitives: mesh.listPrimitives().map((item) => ({
      mode: item.getMode(), material: item.getMaterial()?.getName() ?? null,
      indices: hashArray(item.getIndices()?.getArray()),
      attributes: Object.fromEntries(item.listSemantics()
        .filter((name) => name !== 'JOINTS_0' && name !== 'WEIGHTS_0')
        .map((name) => {
          const accessor = item.getAttribute(name);
          return [name, {
          type: accessor.getType(), componentType: accessor.getComponentType(),
          normalized: accessor.getNormalized(), count: accessor.getCount(),
          values: hashArray(accessor.getArray()),
          }];
        }).sort(([a], [b]) => a.localeCompare(b))),
    })),
  }));
  return JSON.stringify({ nodes, skinsSig, animations, meshes });
};
const before = graphSignature(doc);

const jointRange = joints.getArray();
if (!(jointRange instanceof Uint8Array || jointRange instanceof Uint16Array)) {
  throw new Error(`component type JOINTS_0 não suportado: ${jointRange?.constructor?.name}`);
}
if (!(weights.getArray() instanceof Float32Array)) {
  const replacement = new Float32Array(header.vertexCount * 4);
  weights.setArray(replacement).setNormalized(false);
  weights = primitive.getAttribute('WEIGHTS_0');
}
const expectedJoints = new Array(header.vertexCount);
const expectedWeights = new Array(header.vertexCount);
const maxJoint = jointRange instanceof Uint8Array ? 255 : 65535;
for (let vertex = 0; vertex < header.vertexCount; vertex++) {
  const offset = recordsStart + vertex * header.recordBytes;
  const sourceJoints = [0, 1, 2, 3].map((slot) => sidecar.readUInt16LE(offset + slot * 2));
  const sourceWeights = [0, 1, 2, 3].map((slot) => sidecar.readFloatLE(offset + 8 + slot * 4));
  if (sourceJoints.some((joint) => joint >= sidecarToTarget.length) || sourceWeights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error(`registro inválido no vértice ${vertex}`);
  }
  const sum = sourceWeights.reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 1e-4) throw new Error(`pesos não normalizados no vértice ${vertex}: ${sum}`);
  const mappedJoints = sourceJoints.map((joint) => sidecarToTarget[joint]);
  if (mappedJoints.some((joint) => joint > maxJoint)) throw new Error(`joint fora do tipo do accessor no vértice ${vertex}`);
  joints.setElement(vertex, mappedJoints);
  weights.setElement(vertex, sourceWeights);
  expectedJoints[vertex] = mappedJoints;
  expectedWeights[vertex] = sourceWeights;
}

await io.write(output, doc);
const outputDoc = await io.read(output);
if (graphSignature(outputDoc) !== before) {
  throw new Error('geometry, bind, hierarchy ou clips mudaram; saída rejeitada');
}
const outPrimitive = outputDoc.getRoot().listNodes().find((node) => node.getSkin() && node.getMesh())
  .getMesh().listPrimitives()[0];
const outJoints = outPrimitive.getAttribute('JOINTS_0');
const outWeights = outPrimitive.getAttribute('WEIGHTS_0');
const actualJoints = [0, 0, 0, 0], actualWeights = [0, 0, 0, 0];
for (let vertex = 0; vertex < header.vertexCount; vertex++) {
  outJoints.getElement(vertex, actualJoints);
  outWeights.getElement(vertex, actualWeights);
  for (let slot = 0; slot < 4; slot++) {
    if (actualJoints[slot] !== expectedJoints[vertex][slot] || Math.abs(actualWeights[slot] - expectedWeights[vertex][slot]) > 1e-6) {
      throw new Error(`round-trip de peso/joint divergiu no vértice ${vertex}, influência ${slot}`);
    }
  }
}
console.log(`[weights] geometry/bind/hierarchy/clips invariantes; vertices=${header.vertexCount} joints=${skinJoints.length}`);
console.log(`[weights] output=${output} bytes=${(await stat(output)).size}`);
