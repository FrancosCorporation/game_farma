// Transfer only upper-body rotation tracks between GLBs that share the same
// skeleton rest transforms. Geometry, skin weights, inverse-bind matrices,
// hierarchy, and lower-body animation always remain from the target.
//
// Usage: node scripts/transfer_gltf_upper_body_tracks.mjs <target.glb> <reference.glb> <output.glb> [Walk|Idle|both]
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [targetPath, referencePath, outputPath, clipArg = 'both'] = process.argv.slice(2);
if (!targetPath || !referencePath || !outputPath || targetPath === '--help') {
  console.log('Uso: node scripts/transfer_gltf_upper_body_tracks.mjs <target.glb> <reference.glb> <output.glb> [Walk|Idle|both]');
  process.exit(targetPath ? 0 : 2);
}
if (!['Walk', 'Idle', 'both'].includes(clipArg)) throw new Error('clip deve ser Walk, Idle ou both');
statSync(targetPath);
statSync(referencePath);
try {
  statSync(outputPath);
  throw new Error(`saída já existe; escolha outro caminho: ${outputPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const [targetDoc, referenceDoc] = await Promise.all([io.read(targetPath), io.read(referencePath)]);
const targetRoot = targetDoc.getRoot();
const referenceRoot = referenceDoc.getRoot();
const targetSkin = targetRoot.listSkins()[0];
const referenceSkin = referenceRoot.listSkins()[0];
if (targetRoot.listSkins().length !== 1 || referenceRoot.listSkins().length !== 1 || !targetSkin || !referenceSkin) {
  throw new Error('esperada exatamente uma skin em cada GLB');
}

const normalizeName = (name) => name.replaceAll(':', '').toLowerCase();
const indexNodes = (root) => {
  const map = new Map();
  for (const node of root.listNodes()) {
    const key = normalizeName(node.getName());
    if (map.has(key)) throw new Error(`nome de node duplicado após normalização: ${node.getName()}`);
    map.set(key, node);
  }
  return map;
};
const targetNodes = indexNodes(targetRoot);
const referenceNodes = indexNodes(referenceRoot);
const parentMap = (root) => {
  const map = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) map.set(child, node);
  return map;
};
const targetParents = parentMap(targetRoot);
const referenceParents = parentMap(referenceRoot);
const jointNames = targetSkin.listJoints().map((node) => normalizeName(node.getName()));
const referenceJointNames = referenceSkin.listJoints().map((node) => normalizeName(node.getName()));
if (jointNames.length !== referenceJointNames.length || jointNames.some((name) => !referenceJointNames.includes(name))) {
  throw new Error('esqueletos incompatíveis: nomes/contagem de joints diferem');
}

let maxTranslationDelta = 0;
let maxRotationDelta = 0;
let maxScaleDelta = 0;
for (const name of jointNames) {
  const targetNode = targetNodes.get(name);
  const referenceNode = referenceNodes.get(name);
  if (!targetNode || !referenceNode) throw new Error(`joint ausente: ${name}`);
  const targetParent = targetParents.get(targetNode);
  const referenceParent = referenceParents.get(referenceNode);
  if (normalizeName(targetParent?.getName() ?? '') !== normalizeName(referenceParent?.getName() ?? '')) {
    throw new Error(`hierarquia incompatível em ${name}`);
  }
  const t = targetNode.getTranslation();
  const rt = referenceNode.getTranslation();
  const q = targetNode.getRotation();
  const rq = referenceNode.getRotation();
  const s = targetNode.getScale();
  const rs = referenceNode.getScale();
  const dt = Math.hypot(...t.map((value, i) => value - rt[i]));
  const dot = Math.min(1, Math.abs(q.reduce((sum, value, i) => sum + value * rq[i], 0)));
  const dr = 2 * Math.acos(dot);
  const ds = Math.max(...s.map((value, i) => Math.abs(value - rs[i])));
  maxTranslationDelta = Math.max(maxTranslationDelta, dt);
  maxRotationDelta = Math.max(maxRotationDelta, dr);
  maxScaleDelta = Math.max(maxScaleDelta, ds);
  if (dt > 0.01 || dr > 0.005 || ds > 0.005) {
    throw new Error(`rest pose incompatível em ${name}: Δt=${dt.toFixed(5)}, Δr=${dr.toFixed(5)}rad, Δs=${ds.toFixed(5)}`);
  }
}

const targetIBM = targetSkin.getInverseBindMatrices()?.getArray();
const referenceIBM = referenceSkin.getInverseBindMatrices()?.getArray();
if (!targetIBM || !referenceIBM || targetIBM.length !== referenceIBM.length) {
  throw new Error('inverse-bind matrices ausentes ou com dimensões diferentes');
}
const maxIBMDelta = Math.max(...Array.from(targetIBM, (value, index) => Math.abs(value - referenceIBM[index])));
if (maxIBMDelta > 1e-4) {
  throw new Error(`inverse-bind incompatível para transferência de canais: max Δ=${maxIBMDelta.toExponential(2)}`);
}
const skinnedNode = (root) => {
  const nodes = root.listNodes().filter((node) => node.getSkin());
  if (nodes.length !== 1) throw new Error(`esperado um node skinned; encontrados ${nodes.length}`);
  return nodes[0];
};
const targetMeshWorld = skinnedNode(targetRoot).getWorldMatrix();
const referenceMeshWorld = skinnedNode(referenceRoot).getWorldMatrix();
const maxMeshWorldDelta = Math.max(...Array.from(targetMeshWorld, (value, index) => Math.abs(value - referenceMeshWorld[index])));
if (maxMeshWorldDelta > 1e-4) throw new Error(`frame global das malhas incompatível: Δ=${maxMeshWorldDelta.toExponential(2)}`);

const upperBody = /^(mixamorig)?(left|right)(shoulder|arm|forearm|hand(index|middle|pinky|ring|thumb)?[1-4]?)$/i;
const clips = clipArg === 'both' ? ['Walk', 'Idle'] : [clipArg];
const findClip = (root, name) => root.listAnimations().find((animation) => animation.getName().toLowerCase() === name.toLowerCase());
const duration = (animation) => Math.max(...animation.listChannels().flatMap((channel) => {
  const input = channel.getSampler()?.getInput()?.getArray();
  return input ? Array.from(input, Number) : [];
}));
const readFloats = (accessor) => {
  const values = accessor.getArray();
  if (!accessor.getNormalized()) return Float32Array.from(values);
  const componentType = accessor.getComponentType();
  const divisor = ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 })[componentType];
  if (!divisor) throw new Error(`normalized accessor com componentType não suportado: ${componentType}`);
  return Float32Array.from(values, (value) => Math.max(-1, value / divisor));
};

let copied = 0;
for (const clipName of clips) {
  const targetAnimation = findClip(targetRoot, clipName);
  const referenceAnimation = findClip(referenceRoot, clipName);
  if (!targetAnimation || !referenceAnimation) throw new Error(`clip ausente em um dos GLBs: ${clipName}`);
  const sourceDuration = duration(referenceAnimation);
  const targetDuration = duration(targetAnimation);
  if (!(sourceDuration > 0 && targetDuration > 0)) throw new Error(`duração inválida em ${clipName}`);
  const referenceChannels = new Map();
  for (const channel of referenceAnimation.listChannels()) {
    const node = channel.getTargetNode();
    if (node && channel.getTargetPath() === 'rotation' && upperBody.test(normalizeName(node.getName()))) {
      referenceChannels.set(normalizeName(node.getName()), channel);
    }
  }
  const targetChannels = targetAnimation.listChannels().filter((channel) => {
    const node = channel.getTargetNode();
    return node && channel.getTargetPath() === 'rotation' && upperBody.test(normalizeName(node.getName()));
  });
  if (targetChannels.length < 8) throw new Error(`${clipName}: poucos canais de rotação upper-body no alvo (${targetChannels.length})`);

  const buffer = targetRoot.listBuffers()[0] || targetDoc.createBuffer('upper-body-animation-data');
  let clipCopied = 0;
  for (const targetChannel of targetChannels) {
    const targetNode = targetChannel.getTargetNode();
    const key = normalizeName(targetNode.getName());
    const referenceChannel = referenceChannels.get(key);
    if (!referenceChannel) throw new Error(`${clipName}: referência sem rotação para ${targetNode.getName()}`);
    const sourceSampler = referenceChannel.getSampler();
    const input = sourceSampler.getInput()?.getArray();
    const output = sourceSampler.getOutput();
    if (!input?.length || !output?.getArray()) throw new Error(`${clipName}: canal fonte incompleto em ${targetNode.getName()}`);
    const times = Float32Array.from(input, (time) => Number(time) * targetDuration / sourceDuration);
    const rotations = readFloats(output);
    if (rotations.length !== times.length * 4) throw new Error(`${clipName}: rotação inválida em ${targetNode.getName()}`);
    const inputAccessor = targetDoc.createAccessor(`${clipName}_${targetNode.getName()}_time`, buffer)
      .setType('SCALAR').setArray(times);
    const outputAccessor = targetDoc.createAccessor(`${clipName}_${targetNode.getName()}_rotation`, buffer)
      .setType('VEC4').setArray(rotations);
    targetChannel.getSampler().setInput(inputAccessor).setOutput(outputAccessor)
      .setInterpolation(sourceSampler.getInterpolation() || 'LINEAR');
    clipCopied++;
  }
  copied += clipCopied;
  console.log(`[tracks] ${clipName}: ${clipCopied} rotações upper-body; duração alvo=${targetDuration.toFixed(4)}s, referência=${sourceDuration.toFixed(4)}s`);
}

await io.write(outputPath, targetDoc);
console.log(`[tracks] joints=${jointNames.length}; rig Δmax: trans=${maxTranslationDelta.toFixed(6)}, rot=${maxRotationDelta.toFixed(6)}rad, escala=${maxScaleDelta.toFixed(6)}`);
console.log(`[tracks] IBM Δ=${maxIBMDelta.toExponential(2)}, meshWorld Δ=${maxMeshWorldDelta.toExponential(2)}; geometria e pesos mantidos do alvo; canais copiados=${copied}; output=${outputPath}`);
