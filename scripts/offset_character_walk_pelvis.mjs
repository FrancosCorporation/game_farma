// Apply a small, explicit vertical pelvis correction to Walk only.
// Usage: input.glb separate-output.glb offsetYmeters
import { createHash } from 'node:crypto';
import { access, rename, rm, stat, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

const [input, output, offsetArg] = process.argv.slice(2);
const offsetY = Number(offsetArg);
if (!input || !output || !Number.isFinite(offsetY) || Math.abs(offsetY) > 0.02 || input === output) {
  throw new Error('Uso: node scripts/offset_character_walk_pelvis.mjs input.glb saida.glb offsetY-em-metros (|offset| <= 0,02)');
}
try {
  await access(output);
  throw new Error(`a saída já existe: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const root = document.getRoot();
const skins = root.listSkins();
if (skins.length !== 1 || skins[0].listJoints().length !== 65) throw new Error('Rig fora do contrato mixamo-standard-65');
const walk = root.listAnimations().find(animation => animation.getName().toLowerCase() === 'walk');
if (!walk) throw new Error('Clip Walk ausente');
const hipsChannel = walk.listChannels().find(channel =>
  channel.getTargetNode()?.getName().replaceAll(':', '') === 'mixamorigHips' && channel.getTargetPath() === 'translation');
if (!hipsChannel || hipsChannel.getSampler().getInterpolation() === 'CUBICSPLINE') throw new Error('Track Hips.position do Walk inválida');
const nodes = new Map(root.listNodes().map(node => {
  const object = new THREE.Object3D();
  object.name = node.getName();
  object.position.fromArray(node.getTranslation());
  object.quaternion.fromArray(node.getRotation());
  object.scale.fromArray(node.getScale());
  return [node, object];
}));
for (const node of root.listNodes()) for (const child of node.listChildren()) nodes.get(node).add(nodes.get(child));
const scene = new THREE.Group();
for (const child of (root.getDefaultScene() || root.listScenes()[0]).listChildren()) scene.add(nodes.get(child));
scene.updateMatrixWorld(true);
const hipsObject = nodes.get(hipsChannel.getTargetNode());
if (!hipsObject?.parent) throw new Error('Hips sem parent para converter deslocamento vertical');
const origin = hipsObject.parent.worldToLocal(new THREE.Vector3(0, 0, 0));
const shifted = hipsObject.parent.worldToLocal(new THREE.Vector3(0, offsetY, 0));
const localDelta = shifted.sub(origin);
const accessor = hipsChannel.getSampler().getOutput();
const values = Array.from(accessor.getArray());
if (!values.length || values.length % 3 || values.some(value => !Number.isFinite(value))) throw new Error('Keyframes do Hips inválidos');
if (root.getAsset().extras?.walkPelvisOffsetY !== undefined) throw new Error('a correção já foi aplicada neste asset');

const hash = array => array ? createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') : null;
const geometrySignature = doc => JSON.stringify(doc.getRoot().listMeshes().map(mesh => mesh.listPrimitives().map(primitive => ({
  indices: hash(primitive.getIndices()?.getArray()),
  attributes: primitive.listSemantics().map(semantic => [semantic, hash(primitive.getAttribute(semantic)?.getArray())]),
}))));
const skinSignature = doc => JSON.stringify(doc.getRoot().listSkins().map(skin => [
  skin.listJoints().map(joint => joint.getName()), hash(skin.getInverseBindMatrices()?.getArray()),
]));
const channelSignature = doc => JSON.stringify(doc.getRoot().listAnimations().map(animation => [animation.getName(), animation.listChannels().map(channel => {
  const sampler = channel.getSampler();
  const isHips = animation.getName() === walk.getName() && channel.getTargetNode()?.getName().replaceAll(':', '') === 'mixamorigHips' && channel.getTargetPath() === 'translation';
  return [channel.getTargetNode()?.getName(), channel.getTargetPath(), sampler.getInterpolation(), hash(sampler.getInput().getArray()), isHips ? 'expected-hip-y-offset' : hash(sampler.getOutput().getArray())];
})]));
const beforeGeometry = geometrySignature(document);
const beforeSkin = skinSignature(document);
const beforeChannels = channelSignature(document);
for (let i = 0; i < values.length; i += 3) {
  values[i] += localDelta.x;
  values[i + 1] += localDelta.y;
  values[i + 2] += localDelta.z;
}
accessor.setArray(new Float32Array(values));
root.getAsset().extras = { ...(root.getAsset().extras || {}), walkPelvisOffsetY: offsetY };

const staging = output + '.staging.glb';
try {
  await access(staging);
  throw new Error(`arquivo temporário já existe: ${staging}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
try {
  await io.write(staging, document);
  const check = await io.read(staging);
  if (geometrySignature(check) !== beforeGeometry || skinSignature(check) !== beforeSkin || channelSignature(check) !== beforeChannels) {
    throw new Error('malha, skin, bind ou demais tracks mudaram');
  }
  const outWalk = check.getRoot().listAnimations().find(animation => animation.getName().toLowerCase() === 'walk');
  const outChannel = outWalk.listChannels().find(channel => channel.getTargetNode()?.getName().replaceAll(':', '') === 'mixamorigHips' && channel.getTargetPath() === 'translation');
  const outValues = Array.from(outChannel.getSampler().getOutput().getArray());
  // FBX-origin Mixamo rigs store joint translations around ±100 source units;
  // GLB Float32 round-trips at that magnitude need a slightly wider tolerance.
  if (outValues.length !== values.length || outValues.some((value, index) => Math.abs(value - values[index]) > 5e-5)) throw new Error('correção do Hips não persistiu');
  if (check.getRoot().getAsset().extras?.walkPelvisOffsetY !== offsetY) throw new Error('metadado walkPelvisOffsetY não persistiu');
  await rename(staging, output);
} catch (error) {
  await rm(staging, { force: true });
  throw error;
}
await writeFile(output + '.offset.json', JSON.stringify({
  input, output, offsetY, localDelta: localDelta.toArray(), affected: 'Walk/mixamorigHips.translation along world Y only',
  keyframes: values.length / 3,
  meshSkinBindAndOtherAnimationChannelsPreserved: true,
  outputBytes: (await stat(output)).size,
}, null, 2));
console.log(JSON.stringify({ output, offsetY, localDelta: localDelta.toArray(), keyframes: values.length / 3, bytes: (await stat(output)).size }));
