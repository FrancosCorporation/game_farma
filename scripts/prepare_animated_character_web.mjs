// Prepare a Mixamo-style character GLB for the FarmaCheck web runtime.
// Usage: node scripts/prepare_animated_character_web.mjs <input.glb> <output.glb> <walkSpeed> <walkAdvance> [triangleRatio]
import { stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  meshopt, prune, simplify, textureCompress, weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [input, output, speedArg, advanceArg, ratioArg] = process.argv.slice(2);
if (!input || !output || input === '--help' || speedArg == null || advanceArg == null) {
  console.log('Uso: node scripts/prepare_animated_character_web.mjs <input.glb> <output.glb> <walkSpeed> <walkAdvance> [triangleRatio=0.3]');
  process.exit(input ? 0 : 2);
}

const walkSpeed = Number(speedArg);
const walkAdvance = Number(advanceArg);
const ratio = Number(ratioArg ?? 0.3);
if (!(walkSpeed >= 0.5 && walkSpeed <= 2.5)) throw new Error('walkSpeed deve ficar entre 0.5 e 2.5 m/s');
if (!(walkAdvance >= 0.3 && walkAdvance <= 2.5)) throw new Error('walkAdvance deve ficar entre 0.3 e 2.5 m/loop');
if (!(ratio > 0 && ratio <= 1)) throw new Error('triangleRatio deve ficar em (0, 1]');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
const before = { animations: root.listAnimations().length, hips: {} };
const qNormalize = (q) => {
  const length = Math.hypot(...q);
  if (!Number.isFinite(length) || length < 1e-8) throw new Error('quaternion Hips inválido');
  return q.map((v) => v / length);
};
const qMultiply = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qInverse = (q) => [-q[0], -q[1], -q[2], q[3]];
const angularDistance = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, v, i) => sum + v * b[i], 0))));

for (const clipName of ['Walk', 'Idle']) {
  const matches = root.listAnimations().filter((a) => a.getName().toLowerCase() === clipName.toLowerCase());
  if (matches.length !== 1) throw new Error(`esperado um clip ${clipName}; encontrados ${matches.length}`);
  const hipsNode = matches[0].listChannels().find((ch) =>
    ch.getTargetPath() === 'translation' && /(^|:)Hips$/i.test(ch.getTargetNode()?.getName() || ''))?.getTargetNode();
  if (!hipsNode) throw new Error(`${clipName}: joint Hips não encontrado`);
  const channels = matches[0].listChannels().filter((ch) =>
    ch.getTargetPath() === 'translation' && /(^|:)Hips$/i.test(ch.getTargetNode()?.getName() || ''));
  if (channels.length !== 1) throw new Error(`${clipName}: esperado um canal translation do Hips; encontrados ${channels.length}`);

  const sampler = channels[0].getSampler();
  const inputAccessor = sampler.getInput();
  const outputAccessor = sampler.getOutput();
  const times = inputAccessor.getArray();
  const values = outputAccessor.getArray();
  if (!times?.length || !values?.length) throw new Error(`${clipName}: canal Hips sem keyframes`);
  const factor = sampler.getInterpolation() === 'CUBICSPLINE' ? 3 : 1;
  if (values.length !== times.length * 3 * factor) throw new Error(`${clipName}: accessor translation do Hips inválido`);
  const firstOffset = factor === 3 ? 3 : 0;
  const sourceFirst = Array.from(values.slice(firstOffset, firstOffset + 3));
  const fixed = Array.from(hipsNode.getTranslation());
  if (fixed.length !== 3 || fixed.some((v) => !Number.isFinite(v))) throw new Error(`${clipName}: translação de repouso do Hips inválida`);
  const displacement = [0, 0, 0];
  const mutable = new Float32Array(values);
  for (let i = 0; i < times.length; i++) {
    const offset = i * 3 * factor;
    const valueOffset = offset + firstOffset;
    for (let axis = 0; axis < 3; axis++) {
      displacement[axis] = Math.max(displacement[axis], Math.abs(values[valueOffset + axis] - fixed[axis]));
      mutable[valueOffset + axis] = fixed[axis];
      if (factor === 3) {
        mutable[offset + axis] = 0; // in-tangent
        mutable[offset + 6 + axis] = 0; // out-tangent
      }
    }
  }
  outputAccessor.setArray(mutable);
  before.hips[clipName] = {
    keyframes: times.length,
    maxDisplacementSourceUnits: Math.hypot(...displacement),
    pinnedAt: fixed,
    sourceFirst,
  };

  // Rebase the animated Hips orientation onto its GLB bind pose. FBX imports
  // can carry a constant ~90° axis offset in every sample; preserving it makes
  // an otherwise upright character lie on its side as soon as a clip starts.
  const rotationChannels = matches[0].listChannels().filter((ch) =>
    ch.getTargetPath() === 'rotation' && /(^|:)Hips$/i.test(ch.getTargetNode()?.getName() || ''));
  if (rotationChannels.length !== 1) throw new Error(`${clipName}: esperado um canal rotation do Hips; encontrados ${rotationChannels.length}`);
  const rotationSampler = rotationChannels[0].getSampler();
  const rotationTimes = rotationSampler.getInput()?.getArray();
  const rotationAccessor = rotationSampler.getOutput();
  const rotationValues = rotationAccessor?.getArray();
  const rotationFactor = rotationSampler.getInterpolation() === 'CUBICSPLINE' ? 3 : 1;
  if (rotationAccessor?.getType() !== 'VEC4' || !rotationTimes?.length || rotationValues?.length !== rotationTimes.length * 4 * rotationFactor) {
    throw new Error(`${clipName}: accessor rotation do Hips inválido`);
  }
  const rotationFirstOffset = rotationFactor === 3 ? 4 : 0;
  const sourceFirstRotation = qNormalize(Array.from(rotationValues.slice(rotationFirstOffset, rotationFirstOffset + 4)));
  const restRotation = qNormalize(Array.from(hipsNode.getRotation()));
  const correction = qMultiply(restRotation, qInverse(sourceFirstRotation));
  const adjustedRotations = new Float32Array(rotationValues);
  for (let i = 0; i < rotationTimes.length; i++) {
    const base = i * 4 * rotationFactor;
    if (rotationFactor === 3) {
      for (const offset of [base, base + 8]) {
        const tangent = qMultiply(correction, Array.from(rotationValues.slice(offset, offset + 4)));
        adjustedRotations.set(tangent, offset);
      }
    }
    const valueOffset = base + rotationFirstOffset;
    const value = qNormalize(Array.from(rotationValues.slice(valueOffset, valueOffset + 4)));
    adjustedRotations.set(qNormalize(qMultiply(correction, value)), valueOffset);
  }
  rotationAccessor.setArray(adjustedRotations);
  before.hips[clipName].rotation = {
    rest: restRotation,
    sourceFirst: sourceFirstRotation,
    initialOffsetRadians: angularDistance(restRotation, sourceFirstRotation),
  };
}

const asset = root.getAsset();
asset.extras = { ...(asset.extras || {}), walkSpeed, walkAdvance };

console.log(`[prepare] input=${input}`);
console.log(`[prepare] Hips antes do pin=${JSON.stringify(before.hips)}`);
console.log(`[prepare] simplify ratio=${ratio} · textura WebP até 2048 · meshopt`);
await doc.transform(
  prune(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }),
  textureCompress({ targetFormat: 'webp', resize: [2048, 2048], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
);
await io.write(output, doc);
console.log(`[prepare] output=${output} bytes=${(await stat(output)).size}`);
