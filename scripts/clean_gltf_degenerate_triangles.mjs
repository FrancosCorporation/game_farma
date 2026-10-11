#!/usr/bin/env node
// Remove only repeated triangle indices and near-zero-area triangles from a
// separate GLB copy. All vertices, weights, materials, rig, bind, and clips are
// preserved. This is structural cleanup, not a substitute for skinning QA.
// Usage: node scripts/clean_gltf_degenerate_triangles.mjs <input.glb> <output.glb> [areaSquaredThreshold=1e-20]
import { access, stat } from 'node:fs/promises';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, output, thresholdArg = '1e-20'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/clean_gltf_degenerate_triangles.mjs <input.glb> <output.glb> [areaSquaredThreshold=1e-20]');
  process.exit(input ? 0 : 2);
}
if (input === output) throw new Error('a saída não pode sobrescrever a entrada');
try {
  await access(output);
  throw new Error(`a saída já existe; escolha outro caminho: ${output}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const areaThreshold = Number(thresholdArg);
if (!(areaThreshold >= 0 && areaThreshold <= 1e-12)) throw new Error('threshold inválido');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const hashArray = (array) => {
  if (!array) return null;
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64');
};
const nonTopologySignature = (document) => JSON.stringify(document.getRoot().listMeshes().map((mesh) => ({
  name: mesh.getName(), primitives: mesh.listPrimitives().map((primitive) => ({
    mode: primitive.getMode(), material: primitive.getMaterial()?.getName() ?? null,
    attributes: primitive.listSemantics().sort().map((semantic) => {
      const accessor = primitive.getAttribute(semantic);
      return [semantic, accessor.getType(), accessor.getComponentType(), accessor.getNormalized(),
        accessor.getCount(), hashArray(accessor.getArray())];
    }),
  })),
})));
const beforeGeometry = nonTopologySignature(doc);

let removedDegenerate = 0;
let removedDuplicate = 0;
let beforeTriangles = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
    if ((primitive.getMode() ?? Primitive.Mode.TRIANGLES) !== Primitive.Mode.TRIANGLES) continue;
    const position = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    if (!position || !indices) throw new Error(`${mesh.getName()}[${primitiveIndex}]: exige POSITION e indices explícitos`);
    const source = indices.getArray();
    if (!source || indices.getCount() % 3 !== 0) throw new Error('index accessor inválido');
    beforeTriangles += indices.getCount() / 3;
    const retained = [];
    const seen = new Set();
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    for (let offset = 0; offset < source.length; offset += 3) {
      const triangle = [Number(source[offset]), Number(source[offset + 1]), Number(source[offset + 2])];
      if (triangle.some((index) => index < 0 || index >= position.getCount())) {
        throw new Error(`${mesh.getName()}[${primitiveIndex}]: índice fora do range`);
      }
      if (new Set(triangle).size !== 3) { removedDegenerate++; continue; }
      position.getElement(triangle[0], a);
      position.getElement(triangle[1], b);
      position.getElement(triangle[2], c);
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      if (nx * nx + ny * ny + nz * nz <= areaThreshold) { removedDegenerate++; continue; }
      const key = [...triangle].sort((x, y) => x - y).join(':');
      if (seen.has(key)) { removedDuplicate++; continue; }
      seen.add(key);
      retained.push(...triangle);
    }
    if (!retained.length) throw new Error(`${mesh.getName()}[${primitiveIndex}]: limpeza removeria todos os triângulos`);
    const IndexArray = source.constructor;
    indices.setArray(new IndexArray(retained));
  }
}
if (removedDegenerate + removedDuplicate === 0) throw new Error('nenhum triângulo inválido detectado; saída não foi criada');

await io.write(output, doc);
const checked = await io.read(output);
if (nonTopologySignature(checked) !== beforeGeometry) {
  throw new Error('atributos, materiais ou assinatura dos vértices mudaram; saída rejeitada');
}
const afterTriangles = checked.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives())
  .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? 0) / 3, 0);
if (beforeTriangles - afterTriangles !== removedDegenerate + removedDuplicate) {
  throw new Error('a contagem final de triângulos não corresponde ao número removido');
}
console.log(`[topology] removed degenerate=${removedDegenerate} duplicate=${removedDuplicate}; triangles ${beforeTriangles} → ${afterTriangles}`);
console.log(`[topology] all vertex attributes/weights/materials preserved; output=${output} bytes=${(await stat(output)).size}`);
