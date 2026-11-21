// Rebase arm animation channels toward the character's own bind pose.
// This limits retargeting offsets that turn the wrists/elbows behind the torso
// while preserving each model's geometry, bind matrices, legs, and root motion.
// Usage:
// node scripts/rebase_character_arm_animation.mjs <input.glb> <output.glb> [walkBlend=0.3] [idleBlend=0.65] [handBlend=0.8]
// Blend is the fraction moved toward bind pose (0 keeps source, 1 freezes arm).
import { access, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, walkBlendArg = '0.3', idleBlendArg = '0.65', handBlendArg = '0.8'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/rebase_character_arm_animation.mjs <input.glb> <output.glb> [walkBlend=0.3] [idleBlend=0.65] [handBlend=0.8]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('A saída deve ser um novo arquivo versionado.');
const blendByClip = { Walk: Number(walkBlendArg), Idle: Number(idleBlendArg) };
const handBlend = Number(handBlendArg);
for (const [clip, blend] of Object.entries(blendByClip)) {
  if (!Number.isFinite(blend) || blend < 0 || blend > 0.9) throw new Error(`${clip}: blend precisa estar entre 0 e 0.9`);
}
if (!Number.isFinite(handBlend) || handBlend < 0 || handBlend > 0.9) throw new Error('Hand blend precisa estar entre 0 e 0.9');
try { await access(output); throw new Error(`A saída já existe: ${output}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const root = document.getRoot();
const skins = root.listSkins();
if (skins.length !== 1) throw new Error(`Esperada uma skin, recebidas ${skins.length}`);
const skin = skins[0];
const joints = skin.listJoints();
const byName = new Map(joints.map((joint) => [joint.getName(), joint]));
if (byName.size !== joints.length) throw new Error('Nomes de joints duplicados.');

const hash = (array) => array ? createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') : null;
const meshSignature = () => root.listNodes().filter((node) => node.getMesh()).map((node) => ({
  node: node.getName(),
  skin: node.getSkin()?.getName() ?? null,
  primitives: node.getMesh().listPrimitives().map((primitive) => ({
    mode: primitive.getMode(),
    attributes: Object.fromEntries(primitive.listSemantics().sort().map((semantic) => [semantic, hash(primitive.getAttribute(semantic)?.getArray())])),
    indices: hash(primitive.getIndices()?.getArray()),
  })),
}));
const meshBefore = JSON.stringify(meshSignature());
const bindBefore = JSON.stringify({
  joints: joints.map((joint) => [joint.getName(), joint.getTranslation(), joint.getRotation(), joint.getScale()]),
  inverseBind: hash(skin.getInverseBindMatrices()?.getArray()),
});

const armName = /^mixamorig:?((Left|Right)(Shoulder|Arm|ForeArm|Hand))$/i;
const normalize = (q) => {
  const length = Math.hypot(...q);
  if (!(length > 1e-8)) throw new Error('Quaternion inválido.');
  return q.map((value) => value / length);
};
const slerp = (fromRaw, toRaw, amount) => {
  const from = normalize(fromRaw), to = normalize(toRaw);
  let dot = from.reduce((sum, value, index) => sum + value * to[index], 0);
  let target = to;
  if (dot < 0) { dot = -dot; target = to.map((value) => -value); }
  dot = Math.max(-1, Math.min(1, dot));
  if (dot > 0.9995) return normalize(from.map((value, index) => value + amount * (target[index] - value)));
  const angle = Math.acos(dot), sine = Math.sin(angle);
  const a = Math.sin((1 - amount) * angle) / sine;
  const b = Math.sin(amount * angle) / sine;
  return normalize(from.map((value, index) => a * value + b * target[index]));
};

const reports = [];
for (const [clipName, blend] of Object.entries(blendByClip)) {
  const clip = root.listAnimations().find((animation) => animation.getName().toLowerCase() === clipName.toLowerCase());
  if (!clip) throw new Error(`Clip ${clipName} ausente.`);
  let changedChannels = 0, changedKeys = 0;
  for (const channel of clip.listChannels()) {
    const joint = channel.getTargetNode();
    const name = joint?.getName() ?? '';
    if (channel.getTargetPath() !== 'rotation' || !armName.test(name)) continue;
    const sampler = channel.getSampler();
    if (sampler.getInterpolation() === 'CUBICSPLINE') throw new Error(`${clipName}/${name}: CUBICSPLINE requer tratamento de tangentes.`);
    const source = sampler.getOutput();
    if (source.getType() !== 'VEC4' || source.getCount() < 2) throw new Error(`${clipName}/${name}: rotação não é uma curva VEC4 válida.`);
    const rest = joint.getRotation();
    const values = [];
    const boneBlend = /Hand$/i.test(name) ? handBlend : blend;
    for (let key = 0; key < source.getCount(); key++) {
      const quaternion = [];
      source.getElement(key, quaternion);
      values.push(...slerp(quaternion, rest, boneBlend));
      changedKeys++;
    }
    const accessor = document.createAccessor(`${clipName}_${name}_rebase_${changedChannels}`, root.listBuffers()[0])
      .setType('VEC4')
      .setArray(new Float32Array(values));
    sampler.setOutput(accessor);
    changedChannels++;
  }
  if (changedChannels < 8) throw new Error(`${clipName}: só ${changedChannels} canais de braço foram corrigidos.`);
  reports.push({ clip: clipName, bodyBlendTowardBindPose: blend, handBlendTowardBindPose: handBlend, changedChannels, changedKeys });
}

const staging = output.replace(/\.glb$/i, '.staging.glb');
if (staging === output) throw new Error('A saída precisa terminar em .glb');
try { await access(staging); throw new Error(`Arquivo temporário já existe: ${staging}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
try {
  await io.write(staging, document);
  const check = await io.read(staging);
  const checkRoot = check.getRoot();
  const checkSkin = checkRoot.listSkins()[0];
  if (JSON.stringify(checkRoot.listNodes().filter((node) => node.getMesh()).map((node) => ({
    node: node.getName(), skin: node.getSkin()?.getName() ?? null,
    primitives: node.getMesh().listPrimitives().map((primitive) => ({
      mode: primitive.getMode(),
      attributes: Object.fromEntries(primitive.listSemantics().sort().map((semantic) => [semantic, hash(primitive.getAttribute(semantic)?.getArray())])),
      indices: hash(primitive.getIndices()?.getArray()),
    })),
  }))) !== meshBefore) throw new Error('A malha, topologia, UV, pesos ou atributos mudaram durante a exportação.');
  const bindAfter = JSON.stringify({
    joints: checkSkin.listJoints().map((joint) => [joint.getName(), joint.getTranslation(), joint.getRotation(), joint.getScale()]),
    inverseBind: hash(checkSkin.getInverseBindMatrices()?.getArray()),
  });
  if (bindAfter !== bindBefore) throw new Error('O rig ou as matrizes inverse-bind foram alterados.');
  for (const report of reports) {
    const clip = checkRoot.listAnimations().find((animation) => animation.getName().toLowerCase() === report.clip.toLowerCase());
    if (clip.listChannels().length !== root.listAnimations().find((animation) => animation.getName().toLowerCase() === report.clip.toLowerCase()).listChannels().length) {
      throw new Error(`${report.clip}: quantidade de canais mudou.`);
    }
  }
  await rename(staging, output);
} catch (error) {
  await rm(staging, { force: true });
  throw error;
}
console.log(JSON.stringify({ input, output, reports, meshAndSkinWeightsPreserved: true, bindPoseAndInverseBindPreserved: true }, null, 2));
