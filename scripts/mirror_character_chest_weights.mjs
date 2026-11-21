// Reapply the measured LeftArm -> Spine1 chest-weight falloff to matching
// mirrored vertices of the same mesh. Uses exact pre/post GLBs as the mask
// reference, then changes only JOINTS_0/WEIGHTS_0 on a separate target copy.
// Usage: node scripts/mirror_character_chest_weights.mjs <reference-base.glb> <reference-fixed.glb> <target.glb> <output.glb> [maxMirrorDistance=0.003] [region=all|shoulder-fragments|shoulder-chest-only] [recipient=mixamorig:Spine1] [strength=1]
import { createHash } from 'node:crypto';
import { access, rename, rm, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [referenceBasePath, referenceFixedPath, targetPath, outputPath, maxDistanceArg = '0.003', regionArg = 'all', recipientName = 'mixamorig:Spine1', strengthArg = '1'] = process.argv.slice(2);
if (!referenceBasePath || !referenceFixedPath || !targetPath || !outputPath || referenceBasePath === '--help') {
  console.log('Uso: node scripts/mirror_character_chest_weights.mjs <reference-base.glb> <reference-fixed.glb> <target.glb> <output.glb> [maxMirrorDistance=0.003] [region=all|shoulder-fragments|shoulder-chest-only] [recipient=mixamorig:Spine1] [strength=1]');
  process.exit(referenceBasePath ? 0 : 2);
}
if (new Set([referenceBasePath, referenceFixedPath, targetPath]).has(outputPath)) throw new Error('a saída precisa ser separada das três entradas');
const maxMirrorDistance = Number(maxDistanceArg);
if (!(maxMirrorDistance >= 0.001 && maxMirrorDistance <= 0.02)) throw new Error('distância de espelho deve ficar entre 1 e 20 mm');
if (!['all', 'shoulder-fragments', 'shoulder-chest-only'].includes(regionArg)) throw new Error('região deve ser all, shoulder-fragments ou shoulder-chest-only');
const strength = Number(strengthArg);
if (!(strength > 0 && strength <= 1)) throw new Error('strength deve estar em (0, 1]');
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
  const skinnedNodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
  const primitives = skinnedNodes[0]?.getMesh()?.listPrimitives() ?? [];
  if (skins.length !== 1 || skins[0].listJoints().length !== 65 || skinnedNodes.length !== 1 || primitives.length !== 1) {
    throw new Error(`${path}: esperado um mesh, uma skin e 65 joints`);
  }
  const primitive = primitives[0];
  const position = primitive.getAttribute('POSITION');
  const joints = primitive.getAttribute('JOINTS_0');
  const weights = primitive.getAttribute('WEIGHTS_0');
  if (!position || !joints || !weights || position.getCount() !== joints.getCount() || position.getCount() !== weights.getCount()) {
    throw new Error(`${path}: atributos de geometria/skinning ausentes ou divergentes`);
  }
  return { path, document, root, primitive, position, joints, weights, jointNames: skins[0].listJoints().map((joint) => joint.getName()) };
};
const [referenceBase, referenceFixed, target] = await Promise.all([
  load(referenceBasePath), load(referenceFixedPath), load(targetPath),
]);
const sha = (array) => createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const accessorHash = (accessor) => accessor ? sha(accessor.getArray()) : null;
const positionHash = accessorHash(referenceBase.position);
const indexHash = accessorHash(referenceBase.primitive.getIndices());
for (const model of [referenceFixed, target]) {
  if (model.position.getCount() !== referenceBase.position.getCount() || accessorHash(model.position) !== positionHash) {
    throw new Error(`${model.path}: geometria POSITION diverge da referência; pareamento por índice cancelado`);
  }
  if (accessorHash(model.primitive.getIndices()) !== indexHash) throw new Error(`${model.path}: topologia diverge da referência`);
  if (JSON.stringify(model.jointNames) !== JSON.stringify(referenceBase.jointNames)) throw new Error(`${model.path}: ordem/nome dos bones diverge`);
}
const nameToIndex = new Map(target.jointNames.map((name, index) => [name, index]));
const refLeftArm = referenceBase.jointNames.indexOf('mixamorig:LeftArm');
const refSpine1 = referenceBase.jointNames.indexOf('mixamorig:Spine1');
const targetRightArm = nameToIndex.get('mixamorig:RightArm');
const targetRecipient = nameToIndex.get(recipientName);
if ([refLeftArm, refSpine1, targetRightArm, targetRecipient].some((index) => index == null || index < 0)) {
  throw new Error('joints necessários à transferência não existem nos rigs');
}

// This model has two disconnected shoulder/axilla mesh islands already in the
// source asset. Let visual QA isolate their historical mirrored weight profile
// from the much larger upper-arm region. The representative vertex indices are
// guarded by the exact POSITION and topology hashes above.
let isInTargetRegion = null;
if (regionArg !== 'all') {
  const indices = target.primitive.getIndices();
  if (!indices || target.position.getCount() <= 103330) throw new Error('a topologia não contém os índices de referência do ombro');
  const parent = new Uint32Array(target.position.getCount());
  const sizes = new Uint32Array(target.position.getCount());
  for (let vertex = 0; vertex < parent.length; vertex++) { parent[vertex] = vertex; sizes[vertex] = 1; }
  const find = (vertex) => {
    let root = vertex;
    while (parent[root] !== root) { parent[root] = parent[parent[root]]; root = parent[root]; }
    return root;
  };
  const union = (a, b) => {
    a = find(a); b = find(b);
    if (a === b) return;
    if (sizes[a] < sizes[b]) [a, b] = [b, a];
    parent[b] = a; sizes[a] += sizes[b];
  };
  for (let offset = 0; offset + 2 < indices.getCount(); offset += 3) {
    const a = indices.getScalar(offset), b = indices.getScalar(offset + 1), c = indices.getScalar(offset + 2);
    union(a, b); union(a, c);
  }
  const roots = [find(103330), find(24034)];
  if (sizes[roots[0]] !== 539 || sizes[roots[1]] !== 353 || roots[0] === roots[1]) {
    throw new Error(`ilhas do ombro divergiram da referência (tamanhos ${sizes[roots[0]]}/${sizes[roots[1]]}); operação cancelada`);
  }
  const selectedRoots = regionArg === 'shoulder-chest-only' ? [roots[0]] : roots;
  isInTargetRegion = (vertex) => selectedRoots.includes(find(vertex));
}
if (!(target.weights.getArray() instanceof Uint8Array) || !target.weights.getNormalized()) {
  throw new Error('target precisa usar WEIGHTS_0 Uint8 normalizado; abortado sem alterar arquivo');
}

const getInfluences = (model, index) => {
  const indices = [];
  const values = [];
  model.joints.getElement(index, indices);
  model.weights.getElement(index, values);
  const masses = new Map();
  for (let slot = 0; slot < 4; slot++) {
    const name = model.jointNames[indices[slot]];
    masses.set(name, (masses.get(name) ?? 0) + values[slot]);
  }
  return { indices, values, masses };
};

// Build a sparse source field from the exact known-good pre/post reweight pair.
const patchPoints = [];
for (let vertex = 0; vertex < referenceBase.position.getCount(); vertex++) {
  const before = getInfluences(referenceBase, vertex).masses;
  const after = getInfluences(referenceFixed, vertex).masses;
  const beforeArm = before.get('mixamorig:LeftArm') ?? 0;
  const movedFromArm = beforeArm - (after.get('mixamorig:LeftArm') ?? 0);
  const movedToSpine = (after.get('mixamorig:Spine1') ?? 0) - (before.get('mixamorig:Spine1') ?? 0);
  if (movedFromArm <= 0.005 || movedToSpine < movedFromArm * 0.9 || beforeArm < 0.02) continue;
  const point = [];
  referenceBase.position.getElement(vertex, point);
  patchPoints.push({ point, transferFraction: Math.min(1, movedFromArm / beforeArm) });
}
if (patchPoints.length < 1000) throw new Error(`referência do patch pequena/incompatível: ${patchPoints.length} vértices`);

// Spatial hash lets the same-mesh reflection remain bounded and inspectable.
const cellSize = maxMirrorDistance;
const cellKey = (point) => point.map((value) => Math.floor(value / cellSize)).join(',');
const bins = new Map();
for (const item of patchPoints) {
  const key = cellKey(item.point);
  if (!bins.has(key)) bins.set(key, []);
  bins.get(key).push(item);
}

const jointArray = target.joints.getArray().slice();
const weightArray = target.weights.getArray().slice();
const edited = [];
const quantize = (values) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) throw new Error('vértice alvo sem peso');
  const scaled = values.map((value) => Math.max(0, value / total * 255));
  const bytes = scaled.map(Math.floor);
  const remaining = 255 - bytes.reduce((sum, value) => sum + value, 0);
  const order = scaled.map((value, index) => ({ index, remainder: value - bytes[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < remaining; index++) bytes[order[index].index]++;
  return bytes;
};

for (let vertex = 0; vertex < target.position.getCount(); vertex++) {
  if (isInTargetRegion && !isInTargetRegion(vertex)) continue;
  const point = [];
  target.position.getElement(vertex, point);
  const targetPoint = [-point[0], point[1], point[2]];
  const cell = targetPoint.map((value) => Math.floor(value / cellSize));
  let best = null;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    for (const candidate of bins.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`) ?? []) {
      const distance = Math.hypot(
        targetPoint[0] - candidate.point[0],
        targetPoint[1] - candidate.point[1],
        targetPoint[2] - candidate.point[2],
      );
      if (distance <= maxMirrorDistance && (!best || distance < best.distance)) best = { ...candidate, distance };
    }
  }
  if (!best) continue;

  const { indices, values, masses } = getInfluences(target, vertex);
  const rightArmMass = masses.get('mixamorig:RightArm') ?? 0;
  if (rightArmMass < 0.05 || best.transferFraction <= 0.01) continue;
  let armSlot = indices.findIndex((index) => target.jointNames[index] === 'mixamorig:RightArm');
  let recipientSlot = indices.findIndex((index) => target.jointNames[index] === recipientName);
  if (armSlot < 0) continue;
  if (recipientSlot < 0) {
    recipientSlot = values.findIndex((value) => value < 1e-6);
    if (recipientSlot < 0) throw new Error(`não há slot livre para ${recipientName} no vértice espelhado ${vertex}`);
    jointArray[vertex * 4 + recipientSlot] = targetRecipient;
    values[recipientSlot] = 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  for (let slot = 0; slot < 4; slot++) values[slot] /= total;
  // Re-find the arm slot after any slot assignment and transfer the same
  // fraction used by the proven left-side correction.
  armSlot = indices.findIndex((index) => target.jointNames[index] === 'mixamorig:RightArm');
  if (armSlot < 0) throw new Error(`RightArm slot was lost at vertex ${vertex}`);
  const moved = values[armSlot] * best.transferFraction * strength;
  values[armSlot] -= moved;
  values[recipientSlot] += moved;
  const quantized = quantize(values);
  for (let slot = 0; slot < 4; slot++) weightArray[vertex * 4 + slot] = quantized[slot];
  edited.push({ vertex, distance: best.distance, fraction: best.transferFraction, moved });
}
const minimumEdited = regionArg === 'all' ? 1500 : 50;
if (edited.length < minimumEdited) throw new Error(`correspondências válidas insuficientes: ${edited.length}; nenhum candidato gravado`);

const hashArray = (array) => array ? sha(array) : null;
const graphSignature = (document) => {
  const root = document.getRoot();
  const parents = new Map();
  for (const node of root.listNodes()) for (const child of node.listChildren()) parents.set(child, node);
  return JSON.stringify({
    nodes: root.listNodes().map((node) => ({
      name: node.getName(), parent: parents.get(node)?.getName() ?? null,
      translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
    })),
    skins: root.listSkins().map((skin) => ({
      name: skin.getName(), joints: skin.listJoints().map((joint) => joint.getName()),
      skeleton: skin.getSkeleton()?.getName() ?? null,
      ibm: hashArray(skin.getInverseBindMatrices()?.getArray()),
    })),
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(), channels: animation.listChannels().map((channel) => ({
        node: channel.getTargetNode()?.getName() ?? null, path: channel.getTargetPath(),
        interpolation: channel.getSampler()?.getInterpolation() ?? null,
        input: hashArray(channel.getSampler()?.getInput()?.getArray()),
        output: hashArray(channel.getSampler()?.getOutput()?.getArray()),
      })),
    })),
    meshes: root.listMeshes().map((mesh) => ({
      name: mesh.getName(), primitives: mesh.listPrimitives().map((primitive) => ({
        mode: primitive.getMode(), indices: hashArray(primitive.getIndices()?.getArray()),
        attributes: Object.fromEntries(primitive.listSemantics().filter((name) => !['JOINTS_0', 'WEIGHTS_0'].includes(name))
          .map((name) => [name, hashArray(primitive.getAttribute(name)?.getArray())]).sort(([a], [b]) => a.localeCompare(b))),
      })),
    })),
  });
};
const targetSignature = graphSignature(target.document);
const beforePositionHash = accessorHash(target.position);
const beforeIndicesHash = accessorHash(target.primitive.getIndices());
target.joints.setArray(jointArray);
target.weights.setArray(weightArray).setNormalized(true);
const stagingPath = outputPath.replace(/\.glb$/i, '.staging.glb');
if (stagingPath === outputPath) throw new Error('saída precisa terminar com .glb');
try {
  await access(stagingPath);
  throw new Error(`arquivo temporário já existe: ${stagingPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
try {
  await io.write(stagingPath, target.document);
  const outputDocument = await io.read(stagingPath);
  const outputRoot = outputDocument.getRoot();
  const outputPrimitive = outputRoot.listMeshes()[0].listPrimitives()[0];
  const outputPosition = outputPrimitive.getAttribute('POSITION');
  const outputJoints = outputPrimitive.getAttribute('JOINTS_0');
  const outputWeights = outputPrimitive.getAttribute('WEIGHTS_0');
  if (accessorHash(outputPosition) !== beforePositionHash || accessorHash(outputPrimitive.getIndices()) !== beforeIndicesHash) {
    throw new Error('POSITION/topologia mudaram; candidato rejeitado');
  }
  if (graphSignature(outputDocument) !== targetSignature) throw new Error('bind, rig ou animações mudaram; candidato rejeitado');
  if (outputJoints.getCount() !== target.joints.getCount() || outputWeights.getCount() !== target.weights.getCount()) {
    throw new Error('contagem de vértices mudou');
  }
  const jointCheck = [];
  const weightCheck = [];
  for (let index = 0; index < outputWeights.getCount(); index++) {
    outputJoints.getElement(index, jointCheck);
    outputWeights.getElement(index, weightCheck);
    if (jointCheck.some((value) => value >= target.jointNames.length)) throw new Error(`joint inválido no vértice ${index}`);
    const total = weightCheck.reduce((sum, value) => sum + value, 0);
    if (weightCheck.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(total - 1) > 1.01 / 255) {
      throw new Error(`pesos inválidos no vértice ${index}: soma=${total}`);
    }
  }
  await rename(stagingPath, outputPath);
} catch (error) {
  await rm(stagingPath, { force: true });
  throw error;
}

const sortedDistances = edited.map((item) => item.distance).sort((a, b) => a - b);
const sortedTransferFractions = edited.map((item) => item.fraction).sort((a, b) => a - b);
console.log(JSON.stringify({
  referenceBase: referenceBasePath, referenceFixed: referenceFixedPath,
  target: targetPath, output: outputPath, region: regionArg,
  recipient: recipientName, strength,
  referencePatchVertices: patchPoints.length,
  mirroredRightVerticesChanged: edited.length,
  mirrorDistanceMeters: {
    p50: Number(sortedDistances[Math.floor(sortedDistances.length * 0.5)].toFixed(5)),
    p95: Number(sortedDistances[Math.floor(sortedDistances.length * 0.95)].toFixed(5)),
    max: Number(sortedDistances.at(-1).toFixed(5)),
  },
  transferFractionMedian: Number(sortedTransferFractions[Math.floor(edited.length * 0.5)].toFixed(3)),
  totalArmWeightShift: Number(edited.reduce((sum, item) => sum + item.moved, 0).toFixed(3)),
  preserved: 'mesh POSITION/topologia, normals, UVs, rig/IBMs e animações idênticos; JOINTS_0 só ganha slot livre para o osso destinatário quando necessário',
  outputBytes: (await stat(outputPath)).size,
}, null, 2));
