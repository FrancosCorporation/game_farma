#!/usr/bin/env node
// Safely remove unreferenced vertices from a single skinned GLB primitive.
// The remap is derived only from the primitive's index buffer; all attributes
// (including JOINTS/WEIGHTS and morph targets) are compacted with the same map.
// Usage: node scripts/compact_gltf_unused_vertices.mjs <input.glb> <output.glb>
import { access, readFile, stat } from 'node:fs/promises';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { compactPrimitive } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/compact_gltf_unused_vertices.mjs <input.glb> <output.glb>');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída precisa ser um arquivo separado');
try {
  await access(output);
  throw new Error(`a saída já existe; escolha outro caminho: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const sourceBytes = await readFile(input);
const doc = await io.read(input);
const root = doc.getRoot();
const sourceSkinCount = root.listSkins().length;
const sourceAnimationCount = root.listAnimations().length;
const skinnedNodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skinnedNodes.length !== 1) throw new Error(`esperado 1 node skinned; encontrados ${skinnedNodes.length}`);
const primitives = skinnedNodes[0].getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error(`esperada 1 primitive; encontradas ${primitives.length}`);
const primitive = primitives[0];
if ((primitive.getMode() ?? Primitive.Mode.TRIANGLES) !== Primitive.Mode.TRIANGLES) {
  throw new Error('a primitive precisa usar TRIANGLES');
}
const position = primitive.getAttribute('POSITION');
const indices = primitive.getIndices();
if (!position || !indices) throw new Error('POSITION e índices explícitos são obrigatórios');
const sourceVertexCount = position.getCount();
const sourceIndices = indices.getArray().slice();
const sourceIndicesCount = indices.getCount();
const remap = new Uint32Array(sourceVertexCount).fill(0xffffffff);
let compactVertexCount = 0;
for (let offset = 0; offset < indices.getCount(); offset++) {
  const index = indices.getScalar(offset);
  if (!Number.isInteger(index) || index < 0 || index >= sourceVertexCount) {
    throw new Error(`índice fora do accessor POSITION em ${offset}: ${index}`);
  }
  if (remap[index] === 0xffffffff) remap[index] = compactVertexCount++;
}
if (!compactVertexCount) throw new Error('primitive sem vértices referenciados');
const unusedBefore = sourceVertexCount - compactVertexCount;

const snapshotAttribute = (accessor) => ({
  type: accessor.getType(),
  componentType: accessor.getComponentType(),
  normalized: accessor.getNormalized(),
  count: accessor.getCount(),
  elementSize: accessor.getElementSize(),
  values: accessor.getArray().slice(),
});
const sourceAttributes = primitive.listSemantics().map((semantic) => ({
  semantic,
  snapshot: snapshotAttribute(primitive.getAttribute(semantic)),
}));
const sourceTargets = primitive.listTargets().map((target) => target.listSemantics().map((semantic) => ({
  semantic,
  snapshot: snapshotAttribute(target.getAttribute(semantic)),
})));
const orientedTriangleKeys = (indexValues) => {
  if (indexValues.length % 3 !== 0) throw new Error('índices não formam triângulos completos');
  const keys = [];
  for (let offset = 0; offset < indexValues.length; offset += 3) {
    const a = indexValues[offset], b = indexValues[offset + 1], c = indexValues[offset + 2];
    // Triangle list compression may reorder triangles or rotate their first
    // corner. Accept cyclic rotations, but never a winding reversal.
    keys.push([`${a},${b},${c}`, `${b},${c},${a}`, `${c},${a},${b}`].sort()[0]);
  }
  return keys.sort();
};
const assertMappedAttribute = (source, target, mapping, destinationCount, label) => {
  if (!source || !target || source.type !== target.getType()
      || source.componentType !== target.getComponentType()
      || source.normalized !== target.getNormalized()
      || target.getCount() !== destinationCount) {
    throw new Error(`${label}: metadados/count do accessor divergiram após compactação`);
  }
  const targetValues = target.getArray();
  for (let oldIndex = 0; oldIndex < source.count; oldIndex++) {
    const newIndex = mapping[oldIndex];
    if (newIndex === 0xffffffff) continue;
    const offset = oldIndex * source.elementSize;
    const targetOffset = newIndex * source.elementSize;
    if (source.values.slice(offset, offset + source.elementSize)
      .some((value, component) => value !== targetValues[targetOffset + component])) {
      throw new Error(`${label}: valor divergiu no vértice original ${oldIndex}`);
    }
  }
};

compactPrimitive(primitive, remap, compactVertexCount);
const compactIndices = primitive.getIndices();
for (let offset = 0; offset < sourceIndicesCount; offset++) {
  const expected = remap[sourceIndices[offset]];
  if (compactIndices.getScalar(offset) !== expected) {
    throw new Error(`sequência de triângulos divergiu no índice ${offset}`);
  }
}
for (const { semantic, snapshot } of sourceAttributes) {
  assertMappedAttribute(snapshot, primitive.getAttribute(semantic), remap, compactVertexCount, semantic);
}
for (const [targetIndex, target] of primitive.listTargets().entries()) {
  for (const { semantic, snapshot } of sourceTargets[targetIndex]) {
    assertMappedAttribute(snapshot, target.getAttribute(semantic), remap, compactVertexCount,
      `target${targetIndex}.${semantic}`);
  }
}

const compactSnapshots = primitive.listSemantics().map((semantic) => ({
  semantic,
  snapshot: snapshotAttribute(primitive.getAttribute(semantic)),
}));
const compactIndexValues = compactIndices.getArray().slice();
const compactTriangleKeys = orientedTriangleKeys(compactIndexValues);
const compactTargetSnapshots = primitive.listTargets().map((target) => target.listSemantics().map((semantic) => ({
  semantic,
  snapshot: snapshotAttribute(target.getAttribute(semantic)),
})));
await io.write(output, doc);
const verified = await io.read(output);
const outputPrimitive = verified.getRoot().listNodes()
  .find((node) => node.getSkin() && node.getMesh()).getMesh().listPrimitives()[0];
const outputPosition = outputPrimitive.getAttribute('POSITION');
const outputIndices = outputPrimitive.getIndices();
if (outputPosition.getCount() !== compactVertexCount || outputIndices.getCount() !== sourceIndicesCount) {
  throw new Error('round-trip do arquivo alterou a contagem compactada; saída rejeitada');
}
const outputTriangleKeys = orientedTriangleKeys(outputIndices.getArray());
if (outputTriangleKeys.length !== compactTriangleKeys.length
    || outputTriangleKeys.some((key, index) => key !== compactTriangleKeys[index])) {
  throw new Error('round-trip alterou os triângulos/winding; saída rejeitada');
}
const identityMap = Uint32Array.from({ length: compactVertexCount }, (_, index) => index);
for (const { semantic, snapshot } of compactSnapshots) {
  assertMappedAttribute(snapshot, outputPrimitive.getAttribute(semantic), identityMap,
    compactVertexCount, semantic);
}
if (outputPrimitive.listTargets().length !== compactTargetSnapshots.length) {
  throw new Error('round-trip alterou a contagem de morph targets; saída rejeitada');
}
for (const [targetIndex, target] of outputPrimitive.listTargets().entries()) {
  for (const { semantic, snapshot } of compactTargetSnapshots[targetIndex]) {
    assertMappedAttribute(snapshot, target.getAttribute(semantic), identityMap,
      compactVertexCount, `target${targetIndex}.${semantic}`);
  }
}
if (verified.getRoot().listSkins().length !== sourceSkinCount
    || verified.getRoot().listAnimations().length !== sourceAnimationCount) {
  throw new Error('round-trip alterou skins/animações; saída rejeitada');
}
console.log(JSON.stringify({
  input,
  inputSha256: (await import('node:crypto')).createHash('sha256').update(sourceBytes).digest('hex'),
  output,
  outputBytes: (await stat(output)).size,
  verticesBefore: sourceVertexCount,
  verticesAfter: outputPosition.getCount(),
  unreferencedRemoved: unusedBefore,
  indexedTrianglesPreserved: outputTriangleKeys.length,
  indexedCornersBeforeCompression: sourceIndicesCount,
  attributesVerified: primitive.listSemantics(),
  morphTargetsVerified: sourceTargets.length,
  skinCountPreserved: sourceSkinCount,
  animationCountPreserved: sourceAnimationCount,
}, null, 2));
