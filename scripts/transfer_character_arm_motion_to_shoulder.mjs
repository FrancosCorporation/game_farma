// Move part of an existing RightArm rotation delta onto its parent RightShoulder
// in a separate candidate. The mesh, skin weights, bind matrices, and other
// animation tracks are preserved. Intended only for the Ana Mixamo walk clip.
// Usage: node scripts/transfer_character_arm_motion_to_shoulder.mjs <base.glb> <arm-damped.glb> <output.glb> [transfer=0.5]
import { createHash } from 'node:crypto';
import { access, rename, rm, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Quaternion } from 'three';

const [basePath, dampedPath, outputPath, transferArg = '0.5'] = process.argv.slice(2);
if (!basePath || !dampedPath || !outputPath || basePath === '--help') {
  console.log('Uso: node scripts/transfer_character_arm_motion_to_shoulder.mjs <base.glb> <arm-damped.glb> <output.glb> [transfer=0.5]');
  process.exit(basePath ? 0 : 2);
}
if (new Set([basePath, dampedPath]).has(outputPath)) throw new Error('a saída precisa ser um arquivo separado');
const transfer = Number(transferArg);
if (!(transfer >= 0 && transfer <= 1)) throw new Error('transfer deve estar entre 0 e 1');
try {
  await access(outputPath);
  throw new Error(`saída já existe; escolha outro caminho: ${outputPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const load = async (path) => {
  const document = await io.read(path);
  const root = document.getRoot();
  const skins = root.listSkins();
  const meshes = root.listMeshes();
  const primitive = meshes[0]?.listPrimitives()[0];
  if (skins.length !== 1 || skins[0].listJoints().length !== 65 || meshes.length !== 1 || !primitive) {
    throw new Error(`${path}: GLB fora do rig esperado da Ana`);
  }
  return { path, document, root, skin: skins[0], primitive };
};
const [base, damped] = await Promise.all([load(basePath), load(dampedPath)]);
const sha = (array) => array ? createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') : null;
const hashAccessor = (primitive, semantic) => sha(primitive.getAttribute(semantic)?.getArray());
for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
  if (hashAccessor(base.primitive, semantic) !== hashAccessor(damped.primitive, semantic)) {
    throw new Error(`${semantic} difere entre base e candidato; transferência de animação cancelada`);
  }
}
if (sha(base.primitive.getIndices()?.getArray()) !== sha(damped.primitive.getIndices()?.getArray())) {
  throw new Error('topologia difere entre base e candidato');
}
if (JSON.stringify(base.skin.listJoints().map((joint) => joint.getName())) !==
    JSON.stringify(damped.skin.listJoints().map((joint) => joint.getName())) ||
    sha(base.skin.getInverseBindMatrices()?.getArray()) !== sha(damped.skin.getInverseBindMatrices()?.getArray())) {
  throw new Error('rig ou inverse bind matrices diferem entre base e candidato');
}

const findTrack = (model, bone) => {
  const animation = model.root.listAnimations().find((clip) => /walk/i.test(clip.getName()));
  if (!animation) throw new Error(`${model.path}: clip Walk ausente`);
  const channel = animation.listChannels().find((item) => item.getTargetNode()?.getName() === `mixamorig:${bone}` && item.getTargetPath() === 'rotation');
  if (!channel) throw new Error(`${model.path}: track de rotação ${bone} ausente no Walk`);
  return { animation, channel, sampler: channel.getSampler() };
};
const baseArm = findTrack(base, 'RightArm');
const dampedArm = findTrack(damped, 'RightArm');
const baseShoulder = findTrack(base, 'RightShoulder');
const dampedShoulder = findTrack(damped, 'RightShoulder');
const sameInput = sha(baseArm.sampler.getInput().getArray()) === sha(dampedArm.sampler.getInput().getArray()) &&
  sha(baseShoulder.sampler.getInput().getArray()) === sha(dampedShoulder.sampler.getInput().getArray()) &&
  sha(baseArm.sampler.getInput().getArray()) === sha(baseShoulder.sampler.getInput().getArray());
if (!sameInput || [baseArm, dampedArm, baseShoulder, dampedShoulder].some(({ sampler }) => sampler.getInterpolation() !== 'LINEAR')) {
  throw new Error('RightArm/RightShoulder precisam compartilhar keyframes LINEAR');
}
const baseArmOut = baseArm.sampler.getOutput().getArray();
const dampedArmOut = dampedArm.sampler.getOutput().getArray();
const shoulderOut = dampedShoulder.sampler.getOutput().getArray().slice();
const keyCount = baseArm.sampler.getInput().getCount();
if ([baseArmOut.length, dampedArmOut.length, shoulderOut.length].some((count) => count !== keyCount * 4)) {
  throw new Error('quantidade de quaternions incompatível');
}
const norm = (q) => Math.hypot(...q);
let maxArmNormError = 0;
let maxShoulderNormError = 0;
for (let key = 0; key < keyCount; key++) {
  const offset = key * 4;
  const qBase = new Quaternion(...baseArmOut.slice(offset, offset + 4)).normalize();
  const qDamped = new Quaternion(...dampedArmOut.slice(offset, offset + 4)).normalize();
  const qShoulder = new Quaternion(...shoulderOut.slice(offset, offset + 4)).normalize();
  // qShoulder * qArm is the orientation of the arm in its parent chain.
  // The removed delta is optionally split onto the parent shoulder.
  const removedDelta = qBase.clone().multiply(qDamped.clone().invert()).normalize();
  const shoulderDelta = new Quaternion().slerp(removedDelta, transfer);
  const qNewShoulder = qShoulder.multiply(shoulderDelta).normalize();
  shoulderOut.set([qNewShoulder.x, qNewShoulder.y, qNewShoulder.z, qNewShoulder.w], offset);
  maxArmNormError = Math.max(maxArmNormError, Math.abs(norm(dampedArmOut.slice(offset, offset + 4)) - 1));
  maxShoulderNormError = Math.max(maxShoulderNormError, Math.abs(norm(shoulderOut.slice(offset, offset + 4)) - 1));
}
dampedShoulder.sampler.getOutput().setArray(shoulderOut);

const stagingPath = outputPath.replace(/\.glb$/i, '.staging.glb');
if (stagingPath === outputPath) throw new Error('saída precisa terminar com .glb');
try {
  await access(stagingPath);
  throw new Error(`arquivo temporário já existe: ${stagingPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
try {
  await io.write(stagingPath, damped.document);
  const outputDoc = await io.read(stagingPath);
  const output = await load(stagingPath);
  for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
    if (hashAccessor(damped.primitive, semantic) !== hashAccessor(output.primitive, semantic)) {
      throw new Error(`${semantic} mudou durante exportação`);
    }
  }
  if (sha(damped.primitive.getIndices()?.getArray()) !== sha(output.primitive.getIndices()?.getArray())) throw new Error('topologia mudou durante exportação');
  const outTrack = findTrack(output, 'RightShoulder');
  if (sha(shoulderOut) !== sha(outTrack.sampler.getOutput().getArray())) throw new Error('track de ombro não persistiu');
  await rename(stagingPath, outputPath);
} catch (error) {
  await rm(stagingPath, { force: true });
  throw error;
}
console.log(JSON.stringify({
  base: basePath, damped: dampedPath, output: outputPath, transfer,
  armKeys: keyCount, shoulderKeysChanged: keyCount,
  mesh: 'POSITION, NORMAL, UV, JOINTS, WEIGHTS, topology and inverse bind matrices preserved',
  maxQuaternionNormError: Math.max(maxArmNormError, maxShoulderNormError),
  outputBytes: (await stat(outputPath)).size,
}, null, 2));
