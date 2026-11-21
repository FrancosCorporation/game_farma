// Reduce only the Walk knee rotations relative to their own bind pose.
// Produces a separate GLB so the source clip and rig remain available.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const [input, output, factorArgument = '0.55', sideArgument = 'both'] = process.argv.slice(2);
const factor = Number(factorArgument);
if (!input || !output || resolve(input) === resolve(output)) {
  throw new Error('Usage: node scripts/attenuate_character_walk_knees.mjs input.glb separate-output.glb [factor=.55] [both|left|right]');
}
if (!Number.isFinite(factor) || factor < 0.3 || factor > 0.9) throw new Error('factor must be within [0.3, 0.9]');
if (!['both', 'left', 'right'].includes(sideArgument)) throw new Error('side must be one of: both, left, right');
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
const walk = root.listAnimations().find((animation) => animation.getName() === 'Walk');
if (!walk) throw new Error('Walk clip not found');
const targetSides = sideArgument === 'both' ? ['Left', 'Right'] : [sideArgument[0].toUpperCase() + sideArgument.slice(1)];
const targets = new Set(targetSides.map((side) => `mixamorig:${side}Leg.rotation`));
const targetChannels = walk.listChannels().filter((channel) => targets.has(`${channel.getTargetNode()?.getName()}.${channel.getTargetPath()}`));
if (targetChannels.length !== targetSides.length) throw new Error(`Expected ${targetSides.length} knee rotation track(s) for ${sideArgument}; found ${targetChannels.length}`);
const hash = (array) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const key = (channel) => `${channel.getTargetNode().getName()}.${channel.getTargetPath()}`;
const signature = (document) => JSON.stringify({
  nodes: document.getRoot().listNodes().map((node) => [node.getName(), node.getTranslation(), node.getRotation(), node.getScale(), node.listChildren().map((child) => child.getName())]),
  skins: document.getRoot().listSkins().map((skin) => [skin.listJoints().map((joint) => joint.getName()), hash(skin.getInverseBindMatrices().getArray())]),
  meshes: document.getRoot().listMeshes().map((mesh) => mesh.listPrimitives().map((primitive) => [hash(primitive.getIndices().getArray()), primitive.listSemantics().map((semantic) => [semantic, hash(primitive.getAttribute(semantic).getArray())])])),
  textures: document.getRoot().listTextures().map((texture) => hash(texture.getImage())),
  clips: document.getRoot().listAnimations().map((animation) => [animation.getName(), animation.listChannels().map((channel) => [key(channel), channel.getSampler().getInterpolation(), hash(channel.getSampler().getInput().getArray()), targets.has(key(channel)) && animation.getName() === 'Walk' ? 'target-track' : hash(channel.getSampler().getOutput().getArray())])]),
});
const beforeSignature = signature(doc);
const changes = [];

for (const channel of targetChannels) {
  if (channel.getTargetPath() !== 'rotation') throw new Error(`Unexpected target path: ${key(channel)}`);
  const node = channel.getTargetNode();
  const sourceSampler = channel.getSampler();
  if (sourceSampler.getInterpolation() !== 'LINEAR') throw new Error(`Unsupported interpolation on ${key(channel)}`);
  const inputAccessor = sourceSampler.getInput();
  const sourceOutput = sourceSampler.getOutput();
  if (sourceOutput.getType() !== 'VEC4' || sourceOutput.getCount() !== inputAccessor.getCount()) throw new Error(`Malformed quaternion track: ${key(channel)}`);
  const rest = new THREE.Quaternion().fromArray(node.getRotation()).normalize();
  const data = new Float32Array(sourceOutput.getCount() * 4);
  let maxAngleBeforeDegrees = 0;
  let maxAngleAfterDegrees = 0;
  for (let index = 0; index < sourceOutput.getCount(); index++) {
    const animated = new THREE.Quaternion().fromArray(sourceOutput.getElement(index, [])).normalize();
    const beforeDegrees = 2 * Math.acos(Math.min(1, Math.abs(rest.dot(animated)))) * 180 / Math.PI;
    maxAngleBeforeDegrees = Math.max(maxAngleBeforeDegrees, beforeDegrees);
    const reduced = rest.clone().slerp(animated, factor).normalize();
    if (index > 0) {
      const previous = new THREE.Quaternion().fromArray(Array.from(data.slice((index - 1) * 4, index * 4)));
      if (previous.dot(reduced) < 0) reduced.set(-reduced.x, -reduced.y, -reduced.z, -reduced.w);
    }
    reduced.toArray(data, index * 4);
    maxAngleAfterDegrees = Math.max(maxAngleAfterDegrees, 2 * Math.acos(Math.min(1, Math.abs(rest.dot(reduced)))) * 180 / Math.PI);
  }
  const outputAccessor = doc.createAccessor(`${node.getName()}WalkKneeAttenuated`, root.listBuffers()[0])
    .setType('VEC4').setNormalized(false).setArray(data);
  const sampler = doc.createAnimationSampler().setInput(inputAccessor).setOutput(outputAccessor).setInterpolation(sourceSampler.getInterpolation());
  walk.addSampler(sampler);
  channel.setSampler(sampler);
  changes.push({ track: key(channel), samples: sourceOutput.getCount(), maxAngleBeforeDegrees, maxAngleAfterDegrees, factor });
}

const staged = `${output}.staging.glb`;
await io.write(staged, doc);
const reread = await io.read(staged);
const afterSignature = signature(reread);
if (afterSignature !== beforeSignature) {
  const before = JSON.parse(beforeSignature), after = JSON.parse(afterSignature);
  const mismatches = Object.keys(before).filter((section) => JSON.stringify(before[section]) !== JSON.stringify(after[section]));
  throw new Error(`Unexpected change outside Walk knee channels: ${mismatches.join(', ')}`);
}
for (const channel of reread.getRoot().listAnimations().find((animation) => animation.getName() === 'Walk').listChannels()) {
  const source = targetChannels.find((item) => key(item) === key(channel));
  if (!source) continue;
  const originalTimes = source.getSampler().getInput().getArray();
  const rereadTimes = channel.getSampler().getInput().getArray();
  if (originalTimes.length !== rereadTimes.length || originalTimes.some((time, index) => Math.abs(time - rereadTimes[index]) > 1e-6)) throw new Error(`Walk timestamps changed on ${key(channel)}`);
  for (const value of channel.getSampler().getOutput().getArray()) if (!Number.isFinite(value)) throw new Error(`Non-finite rotation on ${key(channel)}`);
}
await rename(staged, output);
const report = {
  input,
  output,
  sourceSha256: createHash('sha256').update(await readFile(input)).digest('hex'),
  factor,
  sides: targetSides,
  changes,
  timestampsAndAllNonTargetChannelsPreserved: true,
  meshBindRigIdleAndOtherWalkTracksUnchanged: true,
};
await writeFile(`${output}.audit.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
