// Local diagnostic for isolating torso vertices from arm-chain motion.
// Uses only the existing Ana mesh and keeps a soft transition according to
// the vertex's existing trunk support. It does not alter topology or clips.
// Usage: node scripts/cap_character_torso_arm_influence.mjs <input.glb> <output.glb> [armCap=0.10]
import { access, rename, rm } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, capArg = '0.10'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/cap_character_torso_arm_influence.mjs <input.glb> <output.glb> [armCap=0.10]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída precisa ser separada');
const cap = Number(capArg);
if (!(cap >= 0.05 && cap <= 0.25)) throw new Error('armCap precisa ficar entre 0,05 e 0,25');
try { await access(output); throw new Error(`a saída já existe: ${output}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const root = document.getRoot();
const skin = root.listSkins()[0];
const skinnedNode = root.listNodes().find((node) => node.getSkin() && node.getMesh());
if (root.listSkins().length !== 1 || skin.listJoints().length !== 65 || !skinnedNode || root.listNodes().filter((node) => node.getSkin() && node.getMesh()).length !== 1) {
  throw new Error('esperado um único mesh skinned da Ana com 65 joints');
}
const primitive = skinnedNode.getMesh().listPrimitives()[0];
const position = primitive.getAttribute('POSITION');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
if (!position || !joints || !weights || primitive.getAttribute('JOINTS_1') || !(weights.getArray() instanceof Uint8Array) || !weights.getNormalized()) {
  throw new Error('esperados POSITION, JOINTS_0 e WEIGHTS_0 Uint8 normalizado');
}
const names = skin.listJoints().map((joint) => joint.getName());
const torsoNames = ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Spine3'];
const armPattern = /^mixamorig:(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/;
const read = (accessor, vertex) => { const values = []; accessor.getElement(vertex, values); return values; };
const sourceJoints = joints.getArray();
const sourceWeights = weights.getArray();
const nextJoints = sourceJoints.slice();
const nextWeights = sourceWeights.slice();
const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
const quantize = (map) => {
  const entries = [...map.entries()].filter(([, value]) => value > 1e-6).sort((a, b) => b[1] - a[1]);
  const selected = entries.slice(0, 4);
  const total = selected.reduce((sum, [, value]) => sum + value, 0);
  if (!(total > 0)) throw new Error('perfil vazio ao redistribuir os pesos');
  const exact = selected.map(([, value]) => value / total * 255);
  const bytes = exact.map(Math.floor);
  const residual = 255 - bytes.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - bytes[index] })).sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < residual; i++) bytes[order[i].index]++;
  return { names: selected.map(([name]) => name), bytes };
};
let edited = 0, changedArmMass = 0, maxWeightError = 0;
const before = [];
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const point = read(position, vertex);
  if (point[2] < 0.28 || point[2] > 0.84) continue;
  const js = read(joints, vertex), ws = read(weights, vertex);
  const profile = new Map();
  for (let slot = 0; slot < 4; slot++) if (ws[slot] > 0) {
    const name = names[js[slot]];
    profile.set(name, (profile.get(name) ?? 0) + ws[slot]);
  }
  const torsoMass = torsoNames.reduce((sum, name) => sum + (profile.get(name) ?? 0), 0);
  const armNames = [...profile.keys()].filter((name) => armPattern.test(name));
  const armMass = armNames.reduce((sum, name) => sum + profile.get(name), 0);
  if (torsoMass < 0.30 || armMass <= cap + 0.02) continue;
  const mask = smoothstep(0.28, 0.78, torsoMass);
  if (mask < 0.02) continue;
  const targetArmMass = armMass + (Math.min(cap, armMass) - armMass) * mask;
  const delta = armMass - targetArmMass;
  if (delta < 0.002) continue;
  const next = new Map(profile);
  for (const name of armNames) next.set(name, profile.get(name) * targetArmMass / armMass);
  for (const name of torsoNames) {
    const mass = profile.get(name) ?? 0;
    if (mass > 0) next.set(name, mass + delta * mass / torsoMass);
  }
  const quantized = quantize(next);
  const quantizedTotal = quantized.bytes.reduce((sum, value) => sum + value, 0);
  maxWeightError = Math.max(maxWeightError, Math.abs(255 - quantizedTotal));
  for (let slot = 0; slot < 4; slot++) {
    const name = quantized.names[slot] ?? quantized.names.at(-1);
    nextJoints[vertex * 4 + slot] = names.indexOf(name);
    nextWeights[vertex * 4 + slot] = quantized.bytes[slot] ?? 0;
  }
  before.push({ vertex, armMass, targetArmMass, torsoMass });
  changedArmMass += delta;
  edited++;
}
if (edited < 100) throw new Error(`somente ${edited} vértices; candidato não gravado`);
for (const { vertex } of before) {
  const sum = nextWeights[vertex * 4] + nextWeights[vertex * 4 + 1] + nextWeights[vertex * 4 + 2] + nextWeights[vertex * 4 + 3];
  if (sum !== 255) throw new Error(`soma inválida em ${vertex}: ${sum}/255`);
}
joints.setArray(nextJoints);
weights.setArray(nextWeights).setNormalized(true);
const staging = output.replace(/\.glb$/i, '.staging.glb');
if (staging === output) throw new Error('a saída precisa terminar em .glb');
try { await access(staging); throw new Error(`arquivo temporário já existe: ${staging}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
try {
  await io.write(staging, document);
  const check = await io.read(staging);
  const outPrimitive = check.getRoot().listMeshes()[0].listPrimitives()[0];
  if (outPrimitive.getAttribute('POSITION').getCount() !== position.getCount() || outPrimitive.getIndices().getCount() !== primitive.getIndices().getCount()) throw new Error('topologia divergiu após escrita');
  await rename(staging, output);
} catch (error) { await rm(staging, { force: true }); throw error; }
console.log(JSON.stringify({ input, output, editedVertices: edited, cap, meanArmMassBefore: +(before.reduce((sum, item) => sum + item.armMass, 0) / edited).toFixed(3), meanArmMassAfter: +(before.reduce((sum, item) => sum + item.targetArmMass, 0) / edited).toFixed(3), meanTorsoSupport: +(before.reduce((sum, item) => sum + item.torsoMass, 0) / edited).toFixed(3), totalArmMassRedistributed: +changedArmMass.toFixed(2), geometryTopologyBindAndClipsPreserved: true }, null, 2));
