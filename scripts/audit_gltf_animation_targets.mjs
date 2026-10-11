#!/usr/bin/env node
// Diagnose root/axis tracks and rotation ranges in character clips.
// Usage: node scripts/audit_gltf_animation_targets.mjs <character.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const input = process.argv[2];
if (!input || input === '--help') {
  console.log('Uso: node scripts/audit_gltf_animation_targets.mjs <character.glb>');
  process.exit(input ? 0 : 2);
}
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = new Set(skin?.listJoints().map((joint) => joint.getName()) ?? []);
const readAccessor = (accessor) => {
  const array = accessor?.getArray();
  if (!array) return [];
  if (!accessor.getNormalized()) return Array.from(array, Number);
  const divisors = ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 })[accessor.getComponentType()];
  if (!divisors) throw new Error(`componentType normalizado não suportado: ${accessor.getComponentType()}`);
  const signed = accessor.getComponentType() === 5120 || accessor.getComponentType() === 5122;
  return Array.from(array, (value) => signed ? Math.max(-1, Number(value) / divisors) : Number(value) / divisors);
};
const parentByNode = new Map();
for (const node of root.listNodes()) for (const child of node.listChildren()) parentByNode.set(child, node);
console.log(`model=${input} skins=${root.listSkins().length} joints=${joints.size}`);
for (const animation of root.listAnimations()) {
  const byTarget = new Map();
  const nonJoint = [];
  const changingRotations = [];
  const restDeltas = [];
  for (const channel of animation.listChannels()) {
    const node = channel.getTargetNode();
    const name = node?.getName() ?? '<none>';
    const path = channel.getTargetPath();
    const key = `${name}.${path}`;
    byTarget.set(key, (byTarget.get(key) ?? 0) + 1);
    const sampler = channel.getSampler();
    const inputArray = sampler?.getInput()?.getArray();
    const outputAccessor = sampler?.getOutput();
    const outputArray = readAccessor(outputAccessor);
    const inputSize = sampler?.getInput()?.getType() === 'SCALAR' ? 1 : 1;
    const outputSize = outputAccessor?.getType() === 'VEC4' ? 4
      : outputAccessor?.getType() === 'VEC3' ? 3 : 1;
    const times = inputArray ? Array.from(inputArray) : [];
    const values = outputArray ? Array.from(outputArray) : [];
    const interpolation = sampler?.getInterpolation() || 'LINEAR';
    const cubic = interpolation === 'CUBICSPLINE';
    const valueStride = outputSize * (cubic ? 3 : 1);
    const valueAt = (key) => values.slice(key * valueStride + (cubic ? outputSize : 0), key * valueStride + (cubic ? 2 : 1) * outputSize);
    const firstValue = times.length ? valueAt(0) : [];
    const lastValue = times.length ? valueAt(times.length - 1) : [];
    const summary = {
      node: name,
      parent: node ? parentByNode.get(node)?.getName() ?? null : null,
      path,
      interpolation,
      keys: times.length / inputSize,
      time: times.length ? [Number(times[0].toFixed(4)), Number(times.at(-1).toFixed(4))] : null,
      first: firstValue.map((value) => Number(value.toFixed(4))),
      last: lastValue.map((value) => Number(value.toFixed(4))),
    };
    if (!joints.has(name)) nonJoint.push(summary);
    if (node && firstValue.length === outputSize) {
      const rest = path === 'translation' ? node.getTranslation()
        : path === 'rotation' ? node.getRotation()
          : path === 'scale' ? node.getScale() : [];
      let delta = 0;
      if (path === 'rotation' && rest.length === 4) {
        const dot = Math.min(1, Math.abs(rest.reduce((sum, value, i) => sum + value * firstValue[i], 0)));
        delta = 2 * Math.acos(dot);
      } else if (rest.length === firstValue.length) {
        delta = Math.hypot(...rest.map((value, i) => value - firstValue[i]));
      }
      if (delta > 1e-3) restDeltas.push({ node: name, path, delta: Number(delta.toFixed(4)), rest, firstValue });
    }
    if (path === 'rotation' && times.length > 1) {
      let maxAngle = 0;
      for (let key = 1; key < times.length; key++) {
        const q0 = valueAt(0), q = valueAt(key);
        const dot = Math.min(1, Math.abs(q0.reduce((sum, value, i) => sum + value * q[i], 0)));
        maxAngle = Math.max(maxAngle, 2 * Math.acos(dot));
      }
      changingRotations.push({ node: name, keys: times.length, maxFromFirstRad: Number(maxAngle.toFixed(3)) });
    }
  }
  const duration = Math.max(...animation.listChannels().flatMap((channel) => {
    const array = channel.getSampler()?.getInput()?.getArray();
    return array?.length ? [array.at(-1)] : [0];
  }));
  console.log(`\nclip=${animation.getName()} duration=${duration.toFixed(4)} channels=${animation.listChannels().length}`);
  console.log('channelTargets:', JSON.stringify([...byTarget.entries()].slice(0, 24)));
  console.log('nonJointTracks:', JSON.stringify(nonJoint));
  console.log('tracksNotAtRestAtT0:', JSON.stringify(restDeltas.sort((a, b) => b.delta - a.delta).slice(0, 24)));
  console.log('largestBoneRotations:', JSON.stringify(changingRotations.sort((a, b) => b.maxFromFirstRad - a.maxFromFirstRad).slice(0, 16)));
}
