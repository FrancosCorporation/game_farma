#!/usr/bin/env node
// Localized geometric low-pass for a runtime-derived pants vertex mask.
// Usage: node scripts/smooth_character_pants_surface.mjs <input.glb> <mask.json> <output.glb> [factor=0.12] [iterations=2] [maxMoveMm=8]
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, maskPath, output, factorArg = '0.12', iterationsArg = '2', maxMoveMmArg = '8'] = process.argv.slice(2);
if (!input || !maskPath || !output || input === '--help') {
  console.log('Uso: node scripts/smooth_character_pants_surface.mjs <input.glb> <mask.json> <output.glb> [factor=0.12] [iterations=2] [maxMoveMm=8]');
  process.exit(input ? 0 : 2);
}
const factor = Number(factorArg), iterations = Number(iterationsArg);
const maxMoveMm = Number(maxMoveMmArg);
if (!(factor > 0 && factor <= 0.3) || !Number.isInteger(iterations) || iterations < 1 || iterations > 8 || !(maxMoveMm > 0 && maxMoveMm <= 20)) {
  throw new Error('factor deve estar em (0, 0.3], iterations entre 1 e 8, maxMoveMm entre 0 e 20');
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(input);
const maskData = JSON.parse(await readFile(maskPath, 'utf8'));
const mask = maskData.mask;
const primitiveEntries = doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((primitive) => ({ mesh, primitive })));
if (primitiveEntries.length !== 1) throw new Error(`esperada uma primitive, encontrada ${primitiveEntries.length}`);
const { primitive } = primitiveEntries[0];
if ((primitive.getMode() ?? Primitive.Mode.TRIANGLES) !== Primitive.Mode.TRIANGLES) throw new Error('a malha não usa TRIANGLES');
const position = primitive.getAttribute('POSITION');
const indexAccessor = primitive.getIndices();
const vertexCount = position.getCount();
if (!Array.isArray(mask) || mask.length !== vertexCount || maskData.vertexCount !== vertexCount) {
  throw new Error(`máscara incompatível: vertices=${mask?.length}, accessor=${vertexCount}`);
}

const oldIndices = indexAccessor.getArray();
const indices = oldIndices ? Uint32Array.from(oldIndices) : Uint32Array.from({ length: vertexCount }, (_, i) => i);
if (indices.length % 3 !== 0 || [...indices].some((index) => index >= vertexCount)) throw new Error('índices inválidos antes do smoothing');
const source = new Float64Array(vertexCount * 3);
const element = [0, 0, 0];
for (let i = 0; i < vertexCount; i++) {
  position.getElement(i, element);
  source.set(element, i * 3);
}

const neighbors = Array.from({ length: vertexCount }, () => new Set());
const edgeUse = new Map();
const addEdge = (a, b) => {
  if (a === b) return;
  neighbors[a].add(b); neighbors[b].add(a);
  const lo = Math.min(a, b), hi = Math.max(a, b), key = `${lo},${hi}`;
  edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
};
for (let f = 0; f < indices.length; f += 3) {
  const a = indices[f], b = indices[f + 1], c = indices[f + 2];
  addEdge(a, b); addEdge(b, c); addEdge(c, a);
}

const selected = Uint8Array.from(mask, (value) => value ? 1 : 0);
const hasOpenBoundary = new Uint8Array(vertexCount);
for (const [key, count] of edgeUse) {
  if (count !== 1) continue;
  const comma = key.indexOf(',');
  hasOpenBoundary[Number(key.slice(0, comma))] = 1;
  hasOpenBoundary[Number(key.slice(comma + 1))] = 1;
}
// Keep open edges and the one-ring around material/region borders fixed. This
// prevents the local filter from moving trouser hems or pulling pants across skin.
const editable = new Uint8Array(vertexCount);
let selectedCount = 0, editableCount = 0;
for (let i = 0; i < vertexCount; i++) {
  if (!selected[i]) continue;
  selectedCount++;
  if (hasOpenBoundary[i]) continue;
  let interior = true;
  for (const j of neighbors[i]) if (!selected[j]) { interior = false; break; }
  if (interior && neighbors[i].size >= 3) { editable[i] = 1; editableCount++; }
}
if (editableCount < 100) throw new Error(`máscara interior insuficiente: ${editableCount} vértices editáveis`);

let current = source.slice();
for (let pass = 0; pass < iterations; pass++) {
  const next = current.slice();
  for (let i = 0; i < vertexCount; i++) {
    if (!editable[i]) continue;
    let x = 0, y = 0, z = 0, n = 0;
    for (const j of neighbors[i]) { x += current[j * 3]; y += current[j * 3 + 1]; z += current[j * 3 + 2]; n++; }
    if (!n) continue;
    const k = i * 3, t = factor;
    next[k] = current[k] + t * (x / n - current[k]);
    next[k + 1] = current[k + 1] + t * (y / n - current[k + 1]);
    next[k + 2] = current[k + 2] + t * (z / n - current[k + 2]);
  }
  current = next;
}

let sumSquares = 0, maxMove = 0, movedCount = 0, limitedCount = 0;
const dirty = new Uint8Array(vertexCount);
for (let i = 0; i < vertexCount; i++) {
  const k = i * 3;
  let dx = current[k] - source[k], dy = current[k + 1] - source[k + 1], dz = current[k + 2] - source[k + 2];
  let d = Math.hypot(dx, dy, dz);
  const limit = maxMoveMm / 1000;
  if (d > limit) {
    const scale = limit / d;
    dx *= scale; dy *= scale; dz *= scale; d = limit;
    current[k] = source[k] + dx; current[k + 1] = source[k + 1] + dy; current[k + 2] = source[k + 2] + dz;
    limitedCount++;
  }
  if (d > 1e-8) { dirty[i] = 1; movedCount++; sumSquares += d * d; maxMove = Math.max(maxMove, d); }
}
if (!movedCount) throw new Error('nenhum vértice foi alterado');

// Recompute area-weighted geometric normals only for vertices touching edited
// faces; preserve every other authored normal and avoid Int8 truncation.
const normalsAccessor = primitive.getAttribute('NORMAL');
if (!normalsAccessor) throw new Error('NORMAL ausente');
const normal = new Float64Array(vertexCount * 3);
const originalNormal = [0, 0, 0];
const affected = new Uint8Array(vertexCount);
for (let f = 0; f < indices.length; f += 3) {
  const a = indices[f], b = indices[f + 1], c = indices[f + 2];
  if (!dirty[a] && !dirty[b] && !dirty[c]) continue;
  affected[a] = affected[b] = affected[c] = 1;
}
// Accumulate every incident face for each affected vertex, including faces
// just outside the moved region. A partial fan creates a shading seam.
for (let f = 0; f < indices.length; f += 3) {
  const a = indices[f], b = indices[f + 1], c = indices[f + 2];
  if (!affected[a] && !affected[b] && !affected[c]) continue;
  const ax = current[a * 3], ay = current[a * 3 + 1], az = current[a * 3 + 2];
  const ux = current[b * 3] - ax, uy = current[b * 3 + 1] - ay, uz = current[b * 3 + 2] - az;
  const vx = current[c * 3] - ax, vy = current[c * 3 + 1] - ay, vz = current[c * 3 + 2] - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  for (const i of [a, b, c]) if (affected[i]) {
    const k = i * 3;
    normal[k] += nx; normal[k + 1] += ny; normal[k + 2] += nz;
  }
}
// Restore authored normals at vertices outside the affected one-ring before replacing the accessor.
for (let i = 0; i < vertexCount; i++) if (!affected[i]) {
  normalsAccessor.getElement(i, originalNormal);
  normal.set(originalNormal, i * 3);
}
const floatNormals = new Float32Array(normal.length);
let zeroNormals = 0, normalCount = 0;
for (let i = 0; i < vertexCount; i++) {
  const k = i * 3;
  if (!affected[i]) continue;
  const length = Math.hypot(normal[k], normal[k + 1], normal[k + 2]);
  if (length < 1e-12) { zeroNormals++; continue; }
  floatNormals[k] = normal[k] / length;
  floatNormals[k + 1] = normal[k + 1] / length;
  floatNormals[k + 2] = normal[k + 2] / length;
  normalCount++;
}
for (let i = 0; i < vertexCount; i++) if (!affected[i]) {
  const k = i * 3;
  floatNormals[k] = normal[k]; floatNormals[k + 1] = normal[k + 1]; floatNormals[k + 2] = normal[k + 2];
}

const hashArray = (array) => createHash('sha256').update(Array.from(array).join(',')).digest('hex');
const indexHash = hashArray(indices);
const joints = primitive.getAttribute('JOINTS_0')?.getArray();
const weights = primitive.getAttribute('WEIGHTS_0')?.getArray();
const jointsHash = joints ? hashArray(joints) : '';
const weightsHash = weights ? hashArray(weights) : '';
position.setArray(new Float32Array(current)).setNormalized(false);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vertexCount; i++) for (let axis = 0; axis < 3; axis++) {
  const value = current[i * 3 + axis]; min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
}
position.set('min', min).set('max', max);
normalsAccessor.setArray(floatNormals).setNormalized(false);
normalsAccessor.set('min', [-1, -1, -1]).set('max', [1, 1, 1]);
await io.write(output, doc);

const checkDoc = await io.read(output);
const checkPrimitive = checkDoc.getRoot().listMeshes()[0].listPrimitives()[0];
const checkIndices = checkPrimitive.getIndices().getArray();
const checkJoints = checkPrimitive.getAttribute('JOINTS_0')?.getArray();
const checkWeights = checkPrimitive.getAttribute('WEIGHTS_0')?.getArray();
if (checkPrimitive.getAttribute('POSITION').getCount() !== vertexCount || checkIndices.length !== indices.length) throw new Error('contagem mudou na gravação');
if (hashArray(checkIndices) !== indexHash || (checkJoints && hashArray(checkJoints) !== jointsHash) || (checkWeights && hashArray(checkWeights) !== weightsHash)) throw new Error('topologia ou skinning mudaram na gravação');
for (let i = 0; i < vertexCount; i++) {
  checkPrimitive.getAttribute('POSITION').getElement(i, element);
  if (!element.every(Number.isFinite)) throw new Error(`posição não finita no vértice ${i}`);
}
const rms = Math.sqrt(sumSquares / movedCount);
console.log(`[pants-smooth] mask=${selectedCount} interior=${editableCount} moved=${movedCount} capped=${limitedCount} normals=${normalCount} zeroNormals=${zeroNormals}`);
console.log(`[pants-smooth] factor=${factor} passes=${iterations} rms=${(rms * 1000).toFixed(3)} mm source max=${(maxMove * 1000).toFixed(3)} mm source (limit=${maxMoveMm} mm); runtime≈${(rms * 1.72 * 1000).toFixed(3)} / ${(maxMove * 1.72 * 1000).toFixed(3)} mm`);
console.log(`[pants-smooth] topology/JOINTS/WEIGHTS preserved; output=${output} bytes=${(await stat(output)).size}`);
