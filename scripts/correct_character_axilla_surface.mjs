// Surface-paired axilla weight correction for Ana. It uses the already
// corrected left side of the SAME mesh as an anatomical guide for the right
// chest/axilla, while requiring close reflected positions and matching
// surface normals. The arm animation and geometry are not damped or rebuilt.
// Output is always a separate GLB.
//
// Usage:
// node scripts/correct_character_axilla_surface.mjs <input.glb> <output.glb> [strength=0.7] [maxMirrorDistance=0.008]
import { createHash } from 'node:crypto';
import { access, rename, rm, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, strengthArg = '0.7', maxDistanceArg = '0.008'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/correct_character_axilla_surface.mjs <input.glb> <output.glb> [strength=0.7] [maxMirrorDistance=0.008]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída precisa ser um arquivo separado');
const strength = Number(strengthArg);
const maxDistance = Number(maxDistanceArg);
if (!(strength > 0 && strength <= 1)) throw new Error('strength deve ficar em (0, 1]');
if (!(maxDistance >= 0.003 && maxDistance <= 0.02)) throw new Error('maxMirrorDistance deve ficar entre 3 e 20 mm');
try { await access(output); throw new Error(`a saída já existe: ${output}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const root = document.getRoot();
const skins = root.listSkins();
const nodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skins.length !== 1 || skins[0].listJoints().length !== 65 || nodes.length !== 1) {
  throw new Error('esperado o GLB skinned da Ana com uma skin e 65 joints');
}
const skin = skins[0];
const primitive = nodes[0].getMesh().listPrimitives()[0];
const position = primitive.getAttribute('POSITION');
const normal = primitive.getAttribute('NORMAL');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
const indices = primitive.getIndices();
if (!position || !normal || !joints || !weights || !indices || primitive.getAttribute('JOINTS_1')) {
  throw new Error('faltam POSITION/NORMAL/JOINTS_0/WEIGHTS_0/indices ou há mais de quatro influences');
}
if (!(weights.getArray() instanceof Uint8Array) || !weights.getNormalized()) {
  throw new Error('entrada divergente: esperado WEIGHTS_0 Uint8 normalizado');
}
const names = skin.listJoints().map((joint) => joint.getName());
const leftArm = names.indexOf('mixamorig:LeftArm');
const rightArm = names.indexOf('mixamorig:RightArm');
if (leftArm < 0 || rightArm < 0) throw new Error('LeftArm/RightArm ausente');
const torsoNames = ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Spine3'];
const sidePairs = new Map([
  ['mixamorig:LeftShoulder', 'mixamorig:RightShoulder'],
  ['mixamorig:LeftArm', 'mixamorig:RightArm'],
  ['mixamorig:LeftForeArm', 'mixamorig:RightForeArm'],
  ['mixamorig:LeftHand', 'mixamorig:RightHand'],
]);
const hash = (array) => array ? createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') : null;
const accessorHash = (accessor) => hash(accessor?.getArray());
const beforePosition = accessorHash(position);
const beforeIndex = accessorHash(indices);
const beforeNormal = accessorHash(normal);
const beforeUV = accessorHash(primitive.getAttribute('TEXCOORD_0'));

const count = position.getCount();
const jointNames = names;
const readPoint = (accessor, vertex) => { const out = []; accessor.getElement(vertex, out); return out; };
const influences = (vertex) => {
  const jointIds = readPoint(joints, vertex);
  const values = readPoint(weights, vertex);
  const map = new Map();
  for (let slot = 0; slot < 4; slot++) {
    if (values[slot] > 0) map.set(jointNames[jointIds[slot]], (map.get(jointNames[jointIds[slot]]) ?? 0) + values[slot]);
  }
  return map;
};
const torsoMass = (map) => torsoNames.reduce((sum, name) => sum + (map.get(name) ?? 0), 0);
const leftToRight = (name) => sidePairs.get(name) ?? name;

// Index source-side chest/axilla surface points in reflected 3D cells.
// Only points with torso support are valid guides; arm/sleeve-only surfaces
// cannot pull the target chest toward the wrong influence profile.
const cellSize = maxDistance;
const cellKey = (p) => p.map((value) => Math.floor(value / cellSize)).join(',');
const bins = new Map();
for (let vertex = 0; vertex < count; vertex++) {
  const p = readPoint(position, vertex);
  if (p[0] < 0.045 || p[2] < 0.30 || p[2] > 0.84) continue;
  const map = influences(vertex);
  const armMass = map.get('mixamorig:LeftArm') ?? 0;
  const trunkMass = torsoMass(map);
  // The left chest patch is the only source of torso guidance. Preserve the
  // axillary transition itself as a gradient instead of treating it as a cut.
  if (trunkMass < 0.30 || armMass > 0.72) continue;
  const n = readPoint(normal, vertex);
  // Store left-side points in their real positive-X cells. The right-side
  // query reflects its X coordinate into this space exactly once.
  const key = cellKey(p);
  const list = bins.get(key) ?? [];
  list.push({ vertex, point: p, normal: n, map, armMass, trunkMass });
  bins.set(key, list);
}

const search = (targetVertex) => {
  const p = readPoint(position, targetVertex);
  const n = readPoint(normal, targetVertex);
  const reflected = [-p[0], p[1], p[2]];
  const cell = reflected.map((value) => Math.floor(value / cellSize));
  const candidates = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    for (const source of bins.get(`${cell[0] + dx},${cell[1] + dy},${cell[2] + dz}`) ?? []) {
      const distance = Math.hypot(reflected[0] - source.point[0], reflected[1] - source.point[1], reflected[2] - source.point[2]);
      if (distance > maxDistance) continue;
      const mirroredDot = (-n[0]) * source.normal[0] + n[1] * source.normal[1] + n[2] * source.normal[2];
      if (mirroredDot < 0.45) continue;
      candidates.push({ ...source, distance, normalDot: mirroredDot });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, 4);
};

const quantize = (map) => {
  const entries = [...map.entries()].filter(([, value]) => value > 1e-6).sort((a, b) => b[1] - a[1]);
  const selected = entries.slice(0, 4);
  const total = selected.reduce((sum, [, value]) => sum + value, 0);
  if (!(total > 0)) throw new Error('perfil de pesos sem massa');
  const exact = selected.map(([, value]) => value / total * 255);
  const bytes = exact.map(Math.floor);
  const remainder = 255 - bytes.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - bytes[index] })).sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) bytes[order[i].index]++;
  return { names: selected.map(([name]) => name), bytes };
};

const originalJointArray = joints.getArray();
const originalWeightArray = weights.getArray();
const newJointArray = originalJointArray.slice();
const newWeightArray = originalWeightArray.slice();
const edits = [];
const editedGroups = new Map();
const pointKey = (p) => p.map((value) => Math.round(value * 100000)).join(',');
for (let vertex = 0; vertex < count; vertex++) {
  const p = readPoint(position, vertex);
  if (p[0] >= -0.045 || p[2] < 0.30 || p[2] > 0.84) continue;
  const current = influences(vertex);
  const currentArm = current.get('mixamorig:RightArm') ?? 0;
  if (currentArm < 0.18) continue;
  const matches = search(vertex);
  if (!matches.length) continue;
  const best = matches[0];
  const reflectedArm = matches.reduce((sum, item) => {
    const w = 1 / Math.max(item.distance, 0.0005) ** 2;
    return sum + w * (item.map.get('mixamorig:LeftArm') ?? 0);
  }, 0) / matches.reduce((sum, item) => sum + 1 / Math.max(item.distance, 0.0005) ** 2, 0);
  const reflectedTrunk = matches.reduce((sum, item) => {
    const w = 1 / Math.max(item.distance, 0.0005) ** 2;
    return sum + w * torsoMass(item.map);
  }, 0) / matches.reduce((sum, item) => sum + 1 / Math.max(item.distance, 0.0005) ** 2, 0);
  const mismatch = currentArm - reflectedArm;
  if (mismatch < 0.16 || reflectedTrunk < 0.35) continue;
  const distanceT = Math.max(0, Math.min(1, (best.distance - 0.0015) / (maxDistance - 0.0015)));
  const distanceConfidence = 1 - distanceT * distanceT * (3 - 2 * distanceT);
  const mismatchT = Math.max(0, Math.min(1, (mismatch - 0.10) / 0.45));
  const mismatchConfidence = mismatchT * mismatchT * (3 - 2 * mismatchT);
  const amount = strength * distanceConfidence * mismatchConfidence;
  if (amount < 0.05) continue;
  const targetArm = currentArm - mismatch * amount;
  const delta = currentArm - targetArm;

  const sourceProfile = new Map();
  for (const item of matches) {
    const w = 1 / Math.max(item.distance, 0.0005) ** 2;
    for (const [name, value] of item.map) {
      const targetName = leftToRight(name);
      if (torsoNames.includes(targetName) || targetName === 'mixamorig:RightShoulder') {
        sourceProfile.set(targetName, (sourceProfile.get(targetName) ?? 0) + w * value);
      }
    }
  }
  const sourceTotal = [...sourceProfile.values()].reduce((sum, value) => sum + value, 0);
  if (!(sourceTotal > 0)) continue;

  const updated = new Map(current);
  updated.set('mixamorig:RightArm', targetArm);
  for (const [name, value] of sourceProfile) {
    updated.set(name, (updated.get(name) ?? 0) + delta * value / sourceTotal);
  }
  const q = quantize(updated);
  for (let slot = 0; slot < 4; slot++) {
    const jointName = q.names[slot] ?? q.names.at(-1);
    const jointIndex = names.indexOf(jointName);
    if (jointIndex < 0) throw new Error(`bone ${jointName} não existe no rig`);
    newJointArray[vertex * 4 + slot] = jointIndex;
    newWeightArray[vertex * 4 + slot] = q.bytes[slot] ?? 0;
  }
  const record = { vertex, key: pointKey(p), distance: best.distance, normalDot: best.normalDot, before: currentArm, mirrored: reflectedArm, after: targetArm, amount };
  edits.push(record);
  const group = editedGroups.get(record.key) ?? [];
  group.push(record);
  editedGroups.set(record.key, group);
}

if (edits.length < 100) throw new Error(`somente ${edits.length} vértices tiveram par de superfície confiável; nenhum candidato gravado`);
// Coincident copies represent seams between already-existing surface pieces.
// Reject any edit that would give duplicate positions visibly different arm
// influence, rather than silently opening a seam at animation time.
let duplicateGroups = 0;
let worstDuplicateDifference = 0;
for (const group of editedGroups.values()) {
  if (group.length < 2) continue;
  duplicateGroups++;
  const values = group.map((item) => item.after);
  const spread = Math.max(...values) - Math.min(...values);
  worstDuplicateDifference = Math.max(worstDuplicateDifference, spread);
  if (spread > 0.08) throw new Error(`cópias coincidentes divergem em ${spread.toFixed(3)} de RightArm; correção cancelada`);
}

const graphSignature = (doc) => {
  const r = doc.getRoot();
  const parents = new Map();
  for (const node of r.listNodes()) for (const child of node.listChildren()) parents.set(child, node);
  return JSON.stringify({
    nodes: r.listNodes().map((node) => ({ name: node.getName(), parent: parents.get(node)?.getName() ?? null, translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() })),
    skins: r.listSkins().map((item) => ({ name: item.getName(), joints: item.listJoints().map((joint) => joint.getName()), ibm: hash(item.getInverseBindMatrices()?.getArray()) })),
    animations: r.listAnimations().map((animation) => ({ name: animation.getName(), channels: animation.listChannels().map((channel) => ({ node: channel.getTargetNode()?.getName() ?? null, path: channel.getTargetPath(), input: hash(channel.getSampler()?.getInput()?.getArray()), output: hash(channel.getSampler()?.getOutput()?.getArray()) })) })),
  });
};
const signature = graphSignature(document);
joints.setArray(newJointArray);
weights.setArray(newWeightArray).setNormalized(true);
const staging = output.replace(/\.glb$/i, '.staging.glb');
if (staging === output) throw new Error('a saída precisa terminar em .glb');
try { await access(staging); throw new Error(`arquivo temporário já existe: ${staging}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
try {
  await io.write(staging, document);
  const check = await io.read(staging);
  const checkRoot = check.getRoot();
  const outPrimitive = checkRoot.listMeshes()[0].listPrimitives()[0];
  if (accessorHash(outPrimitive.getAttribute('POSITION')) !== beforePosition || accessorHash(outPrimitive.getIndices()) !== beforeIndex ||
      accessorHash(outPrimitive.getAttribute('NORMAL')) !== beforeNormal || accessorHash(outPrimitive.getAttribute('TEXCOORD_0')) !== beforeUV) {
    throw new Error('geometria, normais ou UVs mudaram; candidato rejeitado');
  }
  if (graphSignature(check) !== signature) throw new Error('hierarquia, bind ou clips mudaram; candidato rejeitado');
  const outWeights = outPrimitive.getAttribute('WEIGHTS_0');
  const outJoints = outPrimitive.getAttribute('JOINTS_0');
  let maxSumError = 0;
  for (let vertex = 0; vertex < outWeights.getCount(); vertex++) {
    const ws = [], js = [];
    outWeights.getElement(vertex, ws); outJoints.getElement(vertex, js);
    const sum = ws.reduce((a, b) => a + b, 0);
    maxSumError = Math.max(maxSumError, Math.abs(1 - sum));
    if (js.some((joint) => joint >= names.length) || ws.some((weight) => !Number.isFinite(weight) || weight < 0) || Math.abs(1 - sum) > 1.01 / 255) {
      throw new Error(`pesos inválidos no vértice ${vertex}`);
    }
  }
  await rename(staging, output);
  const deltas = edits.map((item) => item.before - item.after).sort((a, b) => a - b);
  const quantile = (q) => deltas[Math.floor((deltas.length - 1) * q)];
  console.log(JSON.stringify({
    input, output, strength, maxDistance,
    verticesChanged: edits.length,
    duplicatePositionGroups: duplicateGroups,
    worstDuplicateArmWeightSpread: +worstDuplicateDifference.toFixed(4),
    armWeightTransferred: { p50: +quantile(0.5).toFixed(4), p90: +quantile(0.9).toFixed(4), p99: +quantile(0.99).toFixed(4) },
    mirrorMatchDistanceMeters: { p50: +[...edits].sort((a,b)=>a.distance-b.distance)[Math.floor((edits.length-1)*0.5)].distance.toFixed(5), p95: +[...edits].sort((a,b)=>a.distance-b.distance)[Math.floor((edits.length-1)*0.95)].distance.toFixed(5) },
    preserved: ['POSITION', 'indices', 'NORMAL', 'TEXCOORD_0', 'rig', 'inverseBindMatrices', 'animationClips'],
    maxWeightSumError: maxSumError,
    outputBytes: (await stat(output)).size,
  }, null, 2));
} catch (error) {
  await rm(staging, { force: true });
  throw error;
}
