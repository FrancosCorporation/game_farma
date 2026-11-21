// Transfer a controlled amount of upper-arm influence to the existing torso
// joint in a narrow chest/axilla band. Geometry, joint indices, skin bind, and
// animation clips remain unchanged. Output is always a separate GLB.
// Usage: node scripts/reweight_character_chest_band.mjs <input.glb> <output.glb> [left|right] [transfer=0.45] [xMin=0.085] [xMax=0.134] [yMin=1.310] [yMax=1.425] [zMin=-0.060] [zMax=0.060]
import { createHash } from 'node:crypto';
import { access, rename, rm, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, sideArg = 'right', transferArg = '0.45', xMinArg = '0.085', xMaxArg = '0.134', yMinArg = '1.310', yMaxArg = '1.425', zMinArg = '-0.060', zMaxArg = '0.060'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/reweight_character_chest_band.mjs <input.glb> <output.glb> [left|right] [transfer=0.45]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída precisa ser um arquivo separado');
const side = sideArg.toLowerCase();
if (!['left', 'right'].includes(side)) throw new Error('lado deve ser left ou right');
const transfer = Number(transferArg);
if (!(transfer > 0 && transfer <= 1)) throw new Error('transfer deve ficar em (0, 1]');
const bounds = [xMinArg, xMaxArg, yMinArg, yMaxArg, zMinArg, zMaxArg].map(Number);
if (bounds.some((value) => !Number.isFinite(value))) throw new Error('limites espaciais precisam ser números');
const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
if (!(xMin >= 0 && xMin < xMax && yMin < yMax && zMin < zMax)) throw new Error('limites espaciais inválidos');
try {
  await access(output);
  throw new Error(`saída já existe; escolha outro caminho: ${output}`);
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
const skinnedNodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skins.length !== 1 || skins[0].listJoints().length !== 65 || skinnedNodes.length !== 1) {
  throw new Error('esperado o GLB Ana com uma skin, 65 joints e um único mesh skinned');
}
const primitives = skinnedNodes[0].getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error(`esperada uma primitive; encontradas ${primitives.length}`);
const primitive = primitives[0];
const position = primitive.getAttribute('POSITION');
const joints = primitive.getAttribute('JOINTS_0');
let weights = primitive.getAttribute('WEIGHTS_0');
if (!position || !joints || !weights || primitive.getAttribute('JOINTS_1') || primitive.getAttribute('WEIGHTS_1')) {
  throw new Error('esperados POSITION, JOINTS_0 e WEIGHTS_0 sem conjuntos adicionais');
}
const jointNames = skins[0].listJoints().map((joint) => joint.getName());
const armIndex = jointNames.indexOf(`mixamorig:${side === 'left' ? 'Left' : 'Right'}Arm`);
const spineIndex = jointNames.indexOf('mixamorig:Spine2');
if (armIndex < 0 || spineIndex < 0) throw new Error('joints-alvo ausentes');

// This source GLB stores its long axis on local Z. The real web preview rotates
// it by -90 degrees around X, scales it to 1.72 m, and centers X/depth.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let index = 0; index < position.getCount(); index++) {
  const point = [];
  position.getElement(index, point);
  for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
}
const height = max[2] - min[2];
if (!(height > 1.5 * (max[1] - min[1]))) {
  throw new Error('orientação da malha não corresponde ao GLB de preview conhecido');
}
const scale = 1.72 / height;
const centerX = (max[0] + min[0]) / 2;
const centerDepth = (max[1] + min[1]) / 2;
const smoothstep = (value) => value * value * (3 - 2 * value);
const band = (value, low, high, feather) => {
  if (value <= low || value >= high) return 0;
  return Math.min(
    smoothstep(Math.min(1, (value - low) / feather)),
    smoothstep(Math.min(1, (high - value) / feather)),
  );
};
const sideSign = side === 'left' ? 1 : -1;

const hashArray = (array) => array ? createHash('sha256')
  .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') : null;
const graphSignature = (doc) => {
  const graph = doc.getRoot();
  const parents = new Map();
  for (const node of graph.listNodes()) for (const child of node.listChildren()) parents.set(child, node);
  return JSON.stringify({
    nodes: graph.listNodes().map((node) => ({
      name: node.getName(), parent: parents.get(node)?.getName() ?? null,
      translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale(),
    })),
    skins: graph.listSkins().map((skin) => ({
      name: skin.getName(), joints: skin.listJoints().map((joint) => joint.getName()),
      skeleton: skin.getSkeleton()?.getName() ?? null,
      inverseBindMatrices: hashArray(skin.getInverseBindMatrices()?.getArray()),
    })),
    animations: graph.listAnimations().map((animation) => ({
      name: animation.getName(), channels: animation.listChannels().map((channel) => ({
        node: channel.getTargetNode()?.getName() ?? null, path: channel.getTargetPath(),
        interpolation: channel.getSampler()?.getInterpolation() ?? null,
        input: hashArray(channel.getSampler()?.getInput()?.getArray()),
        output: hashArray(channel.getSampler()?.getOutput()?.getArray()),
      })),
    })),
    meshes: graph.listMeshes().map((mesh) => ({
      name: mesh.getName(), primitives: mesh.listPrimitives().map((item) => ({
        mode: item.getMode(), indices: hashArray(item.getIndices()?.getArray()),
        attributes: Object.fromEntries(item.listSemantics()
          .filter((name) => name !== 'WEIGHTS_0')
          .map((name) => {
            const accessor = item.getAttribute(name);
            return [name, {
              type: accessor.getType(), componentType: accessor.getComponentType(),
              normalized: accessor.getNormalized(), count: accessor.getCount(),
              values: hashArray(accessor.getArray()),
            }];
          }).sort(([a], [b]) => a.localeCompare(b))),
      })),
    })),
  });
};
const originalSignature = graphSignature(document);
const expectedJoints = new Uint16Array(joints.getCount() * 4);

const originalJointArray = joints.getArray();
const originalWeightArray = weights.getArray();
if (!(originalWeightArray instanceof Uint8Array) || !weights.getNormalized()) {
  throw new Error('este ajuste de precisão foi calibrado para WEIGHTS_0 Uint8 normalizado; entrada divergente');
}
const originalPositionHash = createHash('sha256')
  .update(Buffer.from(position.getArray().buffer, position.getArray().byteOffset, position.getArray().byteLength)).digest('hex');
const changed = [];
const newWeights = originalWeightArray.slice();
const editedVertices = new Set();
const quantizeWeights = (values) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) throw new Error('vértice sem peso');
  const exact = values.map((value) => Math.max(0, value / total * 255));
  const bytes = exact.map(Math.floor);
  let remainder = 255 - bytes.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - bytes[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) bytes[order[i].index]++;
  return bytes;
};
for (let vertex = 0; vertex < weights.getCount(); vertex++) {
  const point = [];
  const vertexJoints = [];
  const vertexWeights = [];
  position.getElement(vertex, point);
  joints.getElement(vertex, vertexJoints);
  weights.getElement(vertex, vertexWeights);
  for (let slot = 0; slot < 4; slot++) expectedJoints[vertex * 4 + slot] = vertexJoints[slot];
  const runtimeX = (point[0] - centerX) * scale;
  const runtimeY = (point[2] - min[2]) * scale;
  const runtimeZ = -(point[1] - centerDepth) * scale;
  const xBand = band(sideSign * runtimeX, xMin, xMax, Math.min(0.012, (xMax - xMin) / 3));
  const yBand = band(runtimeY, yMin, yMax, Math.min(0.018, (yMax - yMin) / 3));
  const zBand = band(runtimeZ, zMin, zMax, Math.min(0.018, (zMax - zMin) / 3));
  const mask = xBand * yBand * zBand;

  let armSlot = -1;
  let spineSlot = -1;
  for (let slot = 0; slot < 4; slot++) {
    if (vertexJoints[slot] === armIndex) armSlot = slot;
    if (vertexJoints[slot] === spineIndex) spineSlot = slot;
  }
  const armWeight = armSlot >= 0 ? vertexWeights[armSlot] : 0;
  if (mask > 0 && armWeight > 0.02) {
    // Keep sleeve/upper-arm vertices intact. The chest-side boundary already
    // has a torso influence; use that as evidence that this vertex belongs to
    // the transition instead of adding Spine2 to pure-arm points.
    if (spineSlot < 0 || vertexWeights[spineSlot] < 0.015) continue;
    const vertexSum = vertexWeights.reduce((sum, value) => sum + value, 0);
    if (!(vertexSum > 0)) throw new Error(`pesos sem massa no vértice ${vertex}`);
    for (let slot = 0; slot < 4; slot++) vertexWeights[slot] /= vertexSum;
    const normalizedArmWeight = vertexWeights[armSlot];
    const torsoSupport = smoothstep(Math.min(1, vertexWeights[spineSlot] / 0.30));
    const amount = transfer * mask * torsoSupport;
    const delta = normalizedArmWeight * amount;
    vertexWeights[armSlot] -= delta;
    vertexWeights[spineSlot] += delta;
    const quantized = quantizeWeights(vertexWeights);
    for (let slot = 0; slot < 4; slot++) newWeights[vertex * 4 + slot] = quantized[slot];
    editedVertices.add(vertex);
    changed.push({ vertex, mask, delta });
    continue;
  }
}
if (changed.length < 100) throw new Error(`máscara atingiu somente ${changed.length} vértices; nada foi gravado`);

weights.setArray(newWeights).setNormalized(true);
const stagingPath = output.replace(/\.glb$/i, '.staging.glb');
if (stagingPath === output) throw new Error('saída precisa terminar com .glb');
try {
  await access(stagingPath);
  throw new Error(`arquivo temporário já existe: ${stagingPath}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
let maxSumError = 0;
try {
  await io.write(stagingPath, document);
  const outputDoc = await io.read(stagingPath);
  const outputRoot = outputDoc.getRoot();
  const outputPrimitive = outputRoot.listMeshes()[0].listPrimitives()[0];
  const outputPosition = outputPrimitive.getAttribute('POSITION');
  const outputJoints = outputPrimitive.getAttribute('JOINTS_0');
  const outputWeights = outputPrimitive.getAttribute('WEIGHTS_0');
  const outputPositionHash = createHash('sha256')
    .update(Buffer.from(outputPosition.getArray().buffer, outputPosition.getArray().byteOffset, outputPosition.getArray().byteLength)).digest('hex');
  if (outputPositionHash !== originalPositionHash) throw new Error('POSITION mudou após reserialização; candidato rejeitado');
  if (outputJoints.getCount() !== joints.getCount() || outputWeights.getCount() !== weights.getCount()) throw new Error('quantidade de vértices mudou');
  for (let vertex = 0; vertex < outputWeights.getCount(); vertex++) {
    const outJoints = [];
    const outWeights = [];
    outputJoints.getElement(vertex, outJoints);
    outputWeights.getElement(vertex, outWeights);
    if (outJoints.some((value, slot) => value !== expectedJoints[vertex * 4 + slot])) throw new Error(`índices JOINTS mudaram no vértice ${vertex}`);
    const total = outWeights.reduce((sum, value) => sum + value, 0);
    maxSumError = Math.max(maxSumError, Math.abs(total - 1));
    const sumTolerance = editedVertices.has(vertex) ? 1e-6 : 1.01 / 255;
    if (outWeights.some((value) => !Number.isFinite(value) || value < -1e-6) || Math.abs(total - 1) > sumTolerance) {
      throw new Error(`pesos inválidos no vértice ${vertex}: soma=${total}`);
    }
  }
  if (originalJointArray.length === 0 || originalWeightArray.length === 0) throw new Error('atributos de skin vazios; saída rejeitada');
  if (graphSignature(outputDoc) !== originalSignature) throw new Error('geometria, bind, hierarquia ou animações mudaram; candidato rejeitado');
  await rename(stagingPath, output);
} catch (error) {
  await rm(stagingPath, { force: true });
  throw error;
}
console.log(JSON.stringify({
  input, output, side, transfer,
  vertices: position.getCount(),
  verticesChanged: changed.length,
  maxWeightShiftPerVertex: Number(Math.max(...changed.map((item) => item.delta)).toFixed(5)),
  totalArmWeightShift: Number(changed.reduce((sum, item) => sum + item.delta, 0).toFixed(5)),
  coordinates: { previewWorldX: [sideSign * xMin, sideSign * xMax], y: [yMin, yMax], z: [zMin, zMax] },
  geometry: 'POSITION hash idêntico; nenhum vértice ou face cortado/trocado',
  jointIndices: 'preservados',
  maxWeightSumError: Number(maxSumError.toExponential(2)),
  outputBytes: (await stat(output)).size,
}, null, 2));
