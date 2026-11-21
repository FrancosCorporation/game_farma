#!/usr/bin/env node
// Correct lower-coat weights identified from the character's base-color atlas.
// Geometry, bind, skeleton, textures and animation clips remain unchanged.
// Usage: node scripts/repair_attendant_coat_weights.mjs <input.glb> <output.glb> [config.json]
import { createHash } from 'node:crypto';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output, configPath] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/repair_attendant_coat_weights.mjs <input.glb> <output.glb> [config.json]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída precisa ser separada para preservar o candidato-base');
try {
  await access(output);
  throw new Error(`a saída já existe; escolha outro caminho: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const config = configPath ? JSON.parse(await readFile(configPath, 'utf8')) : {};
const settings = {
  minY: config.minY ?? 0.4,
  maxY: config.maxY ?? 0.78,
  minAbsX: config.minAbsX ?? 0.11,
  maxAbsX: config.maxAbsX ?? 0.26,
  minAbsZ: config.minAbsZ ?? 0.055,
  minChannel: config.minChannel ?? 160,
  maxChroma: config.maxChroma ?? 26,
  hipWeightAtHem: config.hipWeightAtHem ?? 0.78,
  hipWeightAtWaist: config.hipWeightAtWaist ?? 0.9,
};
if (!(settings.minY < settings.maxY && settings.minAbsX < settings.maxAbsX)) throw new Error('faixa espacial inválida');
if (!(settings.minChannel >= 0 && settings.minChannel <= 255 && settings.maxChroma >= 0 && settings.maxChroma <= 255)) throw new Error('limites de cor inválidos');
if (![settings.hipWeightAtHem, settings.hipWeightAtWaist].every((value) => value > 0 && value < 1)) throw new Error('pesos-alvo fora de (0,1)');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const root = doc.getRoot();
const skins = root.listSkins();
const skinnedNodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skins.length !== 1 || skinnedNodes.length !== 1) throw new Error('esperada uma única skin e um único mesh skinned');
const skin = skins[0];
if (skin.listJoints().length !== 65) throw new Error('o candidato precisa usar o rig Mixamo de 65 ossos');
const primitives = skinnedNodes[0].getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error('esperada uma primitive');
const primitive = primitives[0];
const position = primitive.getAttribute('POSITION');
const uv = primitive.getAttribute('TEXCOORD_0');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
const material = primitive.getMaterial();
const baseColorTexture = material?.getBaseColorTexture();
if (!position || !uv || !joints || !weights || !baseColorTexture) throw new Error('POSITION/UV/skin/base-color atlas obrigatório');
if (primitive.getAttribute('JOINTS_1') || primitive.getAttribute('WEIGHTS_1')) throw new Error('JOINTS_1/WEIGHTS_1 não suportados');
if (![uv.getCount(), joints.getCount(), weights.getCount()].every((count) => count === position.getCount())) throw new Error('quantidades de atributos divergentes');

const jointNames = skin.listJoints().map((joint) => joint.getName());
const jointIndex = new Map(jointNames.map((name, index) => [name.replaceAll(':', ''), index]));
const hipsIndex = jointIndex.get('mixamorigHips');
if (hipsIndex == null) throw new Error('mixamorigHips ausente');
const weightHash = (side) => {
  const index = jointIndex.get(`mixamorig${side}UpLeg`);
  if (index == null) throw new Error(`mixamorig${side}UpLeg ausente`);
  return index;
};
const legIndices = { left: weightHash('Left'), right: weightHash('Right') };

const image = await sharp(baseColorTexture.getImage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels = image.data;
const { width, height, channels } = image.info;
const readPosition = [0, 0, 0];
const readUV = [0, 0];
const selected = new Set();
const selectedBySide = { left: 0, right: 0 };
const colorStats = { matched: 0, rejectedByYOrX: 0, rejectedByColor: 0 };
const sample = [];
const wrap = (value) => ((value % 1) + 1) % 1;
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  position.getElement(vertex, readPosition);
  const [x, y, z] = readPosition;
  if (y < settings.minY || y > settings.maxY || Math.abs(x) < settings.minAbsX || Math.abs(x) > settings.maxAbsX || Math.abs(z) < settings.minAbsZ) {
    colorStats.rejectedByYOrX++;
    continue;
  }
  uv.getElement(vertex, readUV);
  const px = Math.min(width - 1, Math.max(0, Math.floor(wrap(readUV[0]) * width)));
  const py = Math.min(height - 1, Math.max(0, Math.floor((1 - wrap(readUV[1])) * height)));
  const offset = (py * width + px) * channels;
  const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
  if (minimum < settings.minChannel || maximum - minimum > settings.maxChroma) {
    colorStats.rejectedByColor++;
    continue;
  }
  selected.add(vertex);
  selectedBySide[x > 0 ? 'left' : 'right']++;
  colorStats.matched++;
  if (sample.length < 12) sample.push({ vertex, position: readPosition.slice(), uv: readUV.slice(), rgb: [red, green, blue] });
}
if (selected.size < 100 || selected.size > position.getCount() * 0.15) throw new Error(`máscara de jaleco fora da faixa segura: ${selected.size} vértices`);

// Keep exact-position UV seam copies coherent: one copy matching the coat atlas
// marks all vertices at that same point, while no nearby vertices are inferred.
const positionKey = (array) => array.map((value) => Math.round(value * 1e6)).join(':');
const coincident = new Map();
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  position.getElement(vertex, readPosition);
  const key = positionKey(readPosition);
  if (!coincident.has(key)) coincident.set(key, []);
  coincident.get(key).push(vertex);
}
const expanded = new Set(selected);
for (const vertex of selected) {
  position.getElement(vertex, readPosition);
  for (const duplicate of coincident.get(positionKey(readPosition)) || []) expanded.add(duplicate);
}
if (expanded.size > position.getCount() * 0.18) throw new Error(`expansão de costura excessiva: ${expanded.size} vértices`);

const hashArray = (array) => createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const nonWeightSignature = (document) => {
  const r = document.getRoot();
  const parents = new Map();
  for (const node of r.listNodes()) for (const child of node.listChildren()) parents.set(child, node);
  const nodes = r.listNodes().map((node) => [node.getName(), parents.get(node)?.getName() ?? null, node.getTranslation(), node.getRotation(), node.getScale()]);
  const skinsSignature = r.listSkins().map((item) => [item.getName(), item.listJoints().map((joint) => joint.getName()), hashArray(item.getInverseBindMatrices().getArray())]);
  const meshes = r.listMeshes().map((mesh) => mesh.listPrimitives().map((item) => [
    item.getMode(), item.getMaterial()?.getName() ?? null,
    hashArray(item.getIndices()?.getArray()),
    item.listSemantics().filter((semantic) => !['JOINTS_0', 'WEIGHTS_0'].includes(semantic))
      .map((semantic) => [semantic, hashArray(item.getAttribute(semantic).getArray())]),
  ]));
  const animations = r.listAnimations().map((animation) => [animation.getName(), animation.listChannels().map((channel) => {
    const sampler = channel.getSampler();
    return [channel.getTargetNode()?.getName(), channel.getTargetPath(), sampler.getInterpolation(), hashArray(sampler.getInput().getArray()), hashArray(sampler.getOutput().getArray())];
  })]);
  const textures = r.listTextures().map((texture) => [texture.getName(), hashArray(texture.getImage())]);
  return JSON.stringify({ nodes, skinsSignature, meshes, animations, textures });
};
const beforeSignature = nonWeightSignature(doc);
const jointValue = [0, 0, 0, 0];
const weightValue = [0, 0, 0, 0];
const originalJointBytes = joints.getArray().slice();
const originalWeightBytes = weights.getArray().slice();
let changedVertices = 0;
let maximumJointSlotChanges = 0;
let maximumWeightDelta = 0;
for (const vertex of expanded) {
  position.getElement(vertex, readPosition);
  const side = readPosition[0] > 0 ? 'left' : 'right';
  const t = Math.max(0, Math.min(1, (readPosition[1] - settings.minY) / (settings.maxY - settings.minY)));
  const smooth = t * t * (3 - 2 * t);
  const hipsWeight = settings.hipWeightAtHem + (settings.hipWeightAtWaist - settings.hipWeightAtHem) * smooth;
  const values = [hipsWeight, 1 - hipsWeight, 0, 0];
  const ids = [hipsIndex, legIndices[side], hipsIndex, hipsIndex];
  joints.getElement(vertex, jointValue);
  weights.getElement(vertex, weightValue);
  if (ids.some((value, slot) => value !== jointValue[slot]) || values.some((value, slot) => Math.abs(value - weightValue[slot]) > 1e-6)) changedVertices++;
  let slotChanges = 0;
  let weightDelta = 0;
  for (let slot = 0; slot < 4; slot++) {
    if (ids[slot] !== jointValue[slot]) slotChanges++;
    weightDelta = Math.max(weightDelta, Math.abs(values[slot] - weightValue[slot]));
  }
  maximumJointSlotChanges = Math.max(maximumJointSlotChanges, slotChanges);
  maximumWeightDelta = Math.max(maximumWeightDelta, weightDelta);
  joints.setElement(vertex, ids);
  weights.setElement(vertex, values);
}
if (!changedVertices) throw new Error('a máscara não alterou nenhum peso');

await io.write(output, doc);
const check = await io.read(output);
if (nonWeightSignature(check) !== beforeSignature) throw new Error('geometria, bind, rig, textura ou clips mudaram');
const checkNode = check.getRoot().listNodes().find((node) => node.getSkin() && node.getMesh());
const checkPrimitive = checkNode.getMesh().listPrimitives()[0];
const checkJoints = checkPrimitive.getAttribute('JOINTS_0');
const checkWeights = checkPrimitive.getAttribute('WEIGHTS_0');
let minSum = Infinity, maxSum = -Infinity;
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  checkJoints.getElement(vertex, jointValue);
  checkWeights.getElement(vertex, weightValue);
  const sum = weightValue.reduce((total, weight) => total + weight, 0);
  if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.01) throw new Error(`pesos não normalizados após serialização no vértice ${vertex}: ${sum}`);
  minSum = Math.min(minSum, sum);
  maxSum = Math.max(maxSum, sum);
}
const report = {
  input, output, settings,
  selectedByAtlasAndBounds: selected.size,
  expandedCoincidentVertices: expanded.size,
  changedVertices,
  sideCounts: selectedBySide,
  colorStats,
  maximumJointSlotChanges,
  maximumWeightDelta,
  normalizedWeightSums: [minSum, maxSum],
  meshBindRigTextureClipsUnchanged: true,
  sourceWeightsAccessorSha256: hashArray(originalWeightBytes),
  outputWeightsAccessorSha256: hashArray(checkWeights.getArray()),
  diagnosticSamples: sample,
  outputBytes: (await stat(output)).size,
};
await writeFile(`${output}.audit.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, diagnosticSamples: undefined }, null, 2));
