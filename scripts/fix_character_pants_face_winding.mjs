#!/usr/bin/env node
// Correct only tiny, locally selected triangles whose winding strongly opposes
// the authored smooth normals. UVs, positions, weights, and triangle membership
// stay unchanged.
// Usage: node scripts/fix_character_pants_face_winding.mjs <input.glb> <mask.json> <output.glb> [dotThreshold=-0.35] [maxArea=0.000005]
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, maskPath, output, thresholdArg = '-0.35', maxAreaArg = '0.000005'] = process.argv.slice(2);
if (!input || !maskPath || !output || input === '--help') {
  console.log('Uso: node scripts/fix_character_pants_face_winding.mjs <input.glb> <mask.json> <output.glb> [dotThreshold=-0.35] [maxArea=0.000005]');
  process.exit(input ? 0 : 2);
}
const threshold = Number(thresholdArg), maxArea = Number(maxAreaArg);
if (!(threshold >= -1 && threshold < 0) || !(maxArea > 0)) throw new Error('parâmetros de orientação inválidos');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const data = JSON.parse(await readFile(maskPath, 'utf8'));
const mask = data.mask;
const primitives = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
if (primitives.length !== 1) throw new Error(`esperada uma primitive, encontrada ${primitives.length}`);
const primitive = primitives[0];
if ((primitive.getMode() ?? Primitive.Mode.TRIANGLES) !== Primitive.Mode.TRIANGLES) throw new Error('malha não usa TRIANGLES');
const position = primitive.getAttribute('POSITION');
const normal = primitive.getAttribute('NORMAL');
const indexAccessor = primitive.getIndices();
if (!position || !normal || !indexAccessor || mask?.length !== position.getCount()) throw new Error('máscara ou atributos incompatíveis');

const vertices = position.getCount();
const oldIndices = indexAccessor.getArray();
const indices = Uint32Array.from(oldIndices);
if (indices.length % 3 !== 0) throw new Error('index count não é múltiplo de 3');
const P = new Float64Array(vertices * 3), N = new Float64Array(vertices * 3);
const tmp = [0, 0, 0];
for (let i = 0; i < vertices; i++) {
  position.getElement(i, tmp); P.set(tmp, i * 3);
  normal.getElement(i, tmp); N.set(tmp, i * 3);
}

const fixes = [];
for (let f = 0; f < indices.length; f += 3) {
  const a = indices[f], b = indices[f + 1], c = indices[f + 2];
  if (!mask[a] || !mask[b] || !mask[c]) continue;
  const ab = [0, 1, 2].map((axis) => P[3 * b + axis] - P[3 * a + axis]);
  const ac = [0, 1, 2].map((axis) => P[3 * c + axis] - P[3 * a + axis]);
  const face = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const twiceArea = Math.hypot(...face);
  const area = twiceArea * 0.5;
  if (area > maxArea || twiceArea < 1e-12) continue;
  const averageNormal = [0, 1, 2].map((axis) => (N[3 * a + axis] + N[3 * b + axis] + N[3 * c + axis]) / 3);
  const normalLength = Math.hypot(...averageNormal);
  if (normalLength < 1e-8) continue;
  const dot = face.reduce((sum, value, axis) => sum + value * averageNormal[axis], 0) / (twiceArea * normalLength);
  if (dot >= threshold) continue;
  indices[f + 1] = c;
  indices[f + 2] = b;
  fixes.push({ triangle: f / 3, indices: [a, b, c], dot: +dot.toFixed(4), area: +area.toExponential(4) });
}
if (!fixes.length) throw new Error('nenhum triângulo ultrapassou o gate local de winding');

const canonicalTriangles = (array) => {
  const out = [];
  for (let f = 0; f < array.length; f += 3) out.push([...array.slice(f, f + 3)].sort((a, b) => a - b).join(','));
  return out.sort();
};
const triangleHash = (array) => createHash('sha256').update(canonicalTriangles(array).join('|')).digest('hex');
const expectedTriangleHash = triangleHash(oldIndices);
const joints = primitive.getAttribute('JOINTS_0')?.getArray();
const weights = primitive.getAttribute('WEIGHTS_0')?.getArray();
const hashArray = (array) => array ? createHash('sha256').update(Array.from(array).join(',')).digest('hex') : '';
const jointsHash = hashArray(joints), weightsHash = hashArray(weights);
indexAccessor.setArray(oldIndices.constructor.from(indices));
await io.write(output, doc);

const checkDoc = await io.read(output);
const checkPrimitive = checkDoc.getRoot().listMeshes()[0].listPrimitives()[0];
const checkIndices = checkPrimitive.getIndices().getArray();
if (triangleHash(checkIndices) !== expectedTriangleHash) throw new Error('a membership/contagem dos triângulos mudou');
if (hashArray(checkPrimitive.getAttribute('JOINTS_0')?.getArray()) !== jointsHash || hashArray(checkPrimitive.getAttribute('WEIGHTS_0')?.getArray()) !== weightsHash) throw new Error('JOINTS/WEIGHTS mudaram');
console.log(`[winding] corrigidos=${fixes.length} threshold=${threshold} maxArea=${maxArea} m²`);
console.log(JSON.stringify(fixes, null, 2));
console.log(`[winding] posições/triângulos/skinning preservados; output=${output} bytes=${(await stat(output)).size}`);
