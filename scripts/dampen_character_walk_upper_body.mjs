// Diagnostic-only walk experiment: blend selected Walk rotations toward bind.
// The source GLB is never modified; write a new output file for visual review.
// Usage: node scripts/dampen_character_walk_upper_body.mjs <input.glb> <output.glb> [motionFactor=0.4] [arms|shoulders|upperarm|upperarms|leftupperarm|rightupperarm|head|torso]
import { stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, factorArg = '0.4', targetSetArg = 'arms'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/dampen_character_walk_upper_body.mjs <input.glb> <output.glb> [motionFactor=0.4] [arms|shoulders|upperarm|upperarms|leftupperarm|rightupperarm|head|torso]');
  process.exit(input ? 0 : 2);
}
const motionFactor = Number(factorArg);
if (!(motionFactor >= 0 && motionFactor <= 1)) throw new Error('motionFactor deve ficar entre 0 (bind) e 1 (original)');
const targetSets = {
  arms: { pattern: /^(mixamorig)?(left|right)(shoulder|arm|forearm)$/i, expectedChannels: 6 },
  shoulders: { pattern: /^(mixamorig)?(left|right)shoulder$/i, expectedChannels: 2 },
  upperarm: { pattern: /^(mixamorig)?(left|right)arm$/i, expectedChannels: 2 },
  upperarms: { pattern: /^(mixamorig)?(left|right)(arm|forearm)$/i, expectedChannels: 4 },
  leftupperarm: { pattern: /^(mixamorig)?leftarm$/i, expectedChannels: 1 },
  rightupperarm: { pattern: /^(mixamorig)?rightarm$/i, expectedChannels: 1 },
  head: { pattern: /^(mixamorig)?(neck|head)$/i, expectedChannels: 2 },
  torso: { pattern: /^(mixamorig)?(spine|spine1|spine2|neck|head)$/i, expectedChannels: 5 },
};
const targetSet = targetSets[targetSetArg];
if (!targetSet) throw new Error(`conjunto inválido: ${targetSetArg}; use arms, head ou torso`);
await stat(input);
try {
  await stat(output);
  throw new Error(`saída já existe; escolha outro caminho: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const root = doc.getRoot();
const matches = root.listAnimations().filter((animation) => animation.getName().toLowerCase() === 'walk');
if (matches.length !== 1) throw new Error(`esperado um clip Walk; encontrados ${matches.length}`);
const walk = matches[0];
const normalizeName = (name) => name.replaceAll(':', '').toLowerCase();
const channels = walk.listChannels().filter((channel) => {
  const node = channel.getTargetNode();
  return node && channel.getTargetPath() === 'rotation' && targetSet.pattern.test(normalizeName(node.getName()));
});
if (channels.length !== targetSet.expectedChannels) throw new Error(`esperados ${targetSet.expectedChannels} canais de rotação para ${targetSetArg}; encontrados ${channels.length}`);

const normalize = (q) => {
  const length = Math.hypot(...q);
  if (!(length > 1e-8) || !Number.isFinite(length)) throw new Error('quaternion inválido');
  return q.map((value) => value / length);
};
const multiply = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inverse = (q) => [-q[0], -q[1], -q[2], q[3]];
const slerp = (from, to, amount) => {
  let target = [...to];
  let dot = from.reduce((sum, value, i) => sum + value * target[i], 0);
  if (dot < 0) { target = target.map((value) => -value); dot = -dot; }
  if (dot > 0.9995) return normalize(from.map((value, i) => value + amount * (target[i] - value)));
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinAngle = Math.sin(angle);
  const a = Math.sin((1 - amount) * angle) / sinAngle;
  const b = Math.sin(amount * angle) / sinAngle;
  return normalize(from.map((value, i) => a * value + b * target[i]));
};
const readFloats = (accessor) => {
  const values = accessor.getArray();
  if (!accessor.getNormalized()) return Float32Array.from(values);
  const divisor = ({ 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 })[accessor.getComponentType()];
  if (!divisor) throw new Error(`normalized accessor não suportado: ${accessor.getComponentType()}`);
  return Float32Array.from(values, (value) => Math.max(-1, value / divisor));
};

let changedKeys = 0;
const report = [];
for (const channel of channels) {
  const node = channel.getTargetNode();
  const sampler = channel.getSampler();
  if (sampler.getInterpolation() === 'CUBICSPLINE') throw new Error(`${node.getName()}: CUBICSPLINE não suportado neste experimento`);
  const inputTimes = sampler.getInput()?.getArray();
  const outputAccessor = sampler.getOutput();
  const values = readFloats(outputAccessor);
  if (!inputTimes?.length || values.length !== inputTimes.length * 4) throw new Error(`${node.getName()}: accessor rotation inválido`);
  const bind = normalize(Array.from(node.getRotation()));
  const bindInverse = inverse(bind);
  const identity = [0, 0, 0, 1];
  const blended = new Float32Array(values.length);
  let maxAngleBefore = 0;
  let maxAngleAfter = 0;
  for (let i = 0; i < inputTimes.length; i++) {
    const offset = i * 4;
    const animated = normalize(Array.from(values.slice(offset, offset + 4)));
    const dot = Math.min(1, Math.abs(animated.reduce((sum, value, j) => sum + value * bind[j], 0)));
    maxAngleBefore = Math.max(maxAngleBefore, 2 * Math.acos(dot));
    const delta = normalize(multiply(bindInverse, animated));
    const corrected = normalize(multiply(bind, slerp(identity, delta, motionFactor)));
    blended.set(corrected, offset);
    const afterDot = Math.min(1, Math.abs(corrected.reduce((sum, value, j) => sum + value * bind[j], 0)));
    maxAngleAfter = Math.max(maxAngleAfter, 2 * Math.acos(afterDot));
  }
  outputAccessor.setArray(blended).setNormalized(false);
  changedKeys += inputTimes.length;
  report.push({ bone: node.getName(), keys: inputTimes.length, maxRotationFromBindRad: [Number(maxAngleBefore.toFixed(3)), Number(maxAngleAfter.toFixed(3))] });
}

await io.write(output, doc);
console.log(JSON.stringify({ input, output, motionFactor, targetSet: targetSetArg, channels: report, changedKeys }, null, 2));
