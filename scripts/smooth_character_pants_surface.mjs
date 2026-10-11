#!/usr/bin/env node
// Localized geometric low-pass for a runtime-derived pants vertex mask.
// Usage: node scripts/smooth_character_pants_surface.mjs <input.glb> <mask.json> <output.glb> [factor=0.12] [iterations=2] [maxMoveMm=8] [normals=recompute|preserve]
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, maskPath, output, factorArg = '0.12', iterationsArg = '2', maxMoveMmArg = '8', normalMode = 'recompute'] = process.argv.slice(2);
if (!input || !maskPath || !output || input === '--help') {
  console.log('Uso: node scripts/smooth_character_pants_surface.mjs <input.glb> <mask.json> <output.glb> [factor=0.12] [iterations=2] [maxMoveMm=8] [normals=recompute|preserve]');
  process.exit(input ? 0 : 2);
}
const factor = Number(factorArg), iterations = Number(iterationsArg);
const maxMoveMm = Number(maxMoveMmArg);
if (!(factor > 0 && factor <= 0.3) || !Number.isInteger(iterations) || iterations < 1 || iterations > 8 || !(maxMoveMm > 0 && maxMoveMm <= 20) || !['recompute', 'preserve'].includes(normalMode)) {
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

const jointsAccessor = primitive.getAttribute('JOINTS_0');
const weightsAccessor = primitive.getAttribute('WEIGHTS_0');
const normalsAccessor = primitive.getAttribute('NORMAL');
if (!jointsAccessor || !weightsAccessor || !normalsAccessor) throw new Error('JOINTS_0, WEIGHTS_0 e NORMAL são obrigatórios');
const rawJoints = new Array(4), rawWeights = new Array(4), rawNormal = [0, 0, 0];
const skin = Array.from({ length: vertexCount }, () => new Map());
const authoredNormals = new Float64Array(vertexCount * 3);
for (let i = 0; i < vertexCount; i++) {
  jointsAccessor.getElement(i, rawJoints); weightsAccessor.getElement(i, rawWeights); normalsAccessor.getElement(i, rawNormal);
  for (let k = 0; k < 4; k++) skin[i].set(rawJoints[k], (skin[i].get(rawJoints[k]) ?? 0) + rawWeights[k]);
  authoredNormals.set(rawNormal, i * 3);
}
const compatibleCopies = (a, b) => {
  let l1 = 0;
  const keys = new Set([...skin[a].keys(), ...skin[b].keys()]);
  for (const joint of keys) l1 += Math.abs((skin[a].get(joint) ?? 0) - (skin[b].get(joint) ?? 0));
  const ao = a * 3, bo = b * 3;
  const dot = authoredNormals[ao] * authoredNormals[bo] + authoredNormals[ao + 1] * authoredNormals[bo + 1] + authoredNormals[ao + 2] * authoredNormals[bo + 2];
  return l1 <= 0.05 && dot >= 0.97;
};

// Build virtual geometric vertices for co-located UV/normal seams. We keep
// the original indexed vertices and attributes, but smooth their common point
// together when skinning and authored normals agree.
const buckets = new Map();
for (let i = 0; i < vertexCount; i++) {
  const k = i * 3;
  const key = [0, 1, 2].map((axis) => Math.round(source[k + axis] * 10000)).join(',');
  let bucket = buckets.get(key); if (!bucket) buckets.set(key, bucket = []);
  bucket.push(i);
}
const groups = [];
const vertexGroup = new Int32Array(vertexCount);
let duplicateGroups = 0, groupedCopies = 0;
for (const bucket of buckets.values()) {
  const partitions = [];
  for (const i of bucket) {
    let partition = null;
    for (const candidate of partitions) {
      const j = candidate[0], a = i * 3, b = j * 3;
      if (Math.hypot(source[a] - source[b], source[a + 1] - source[b + 1], source[a + 2] - source[b + 2]) <= 0.00025 && compatibleCopies(i, j)) { partition = candidate; break; }
    }
    if (partition) partition.push(i); else partitions.push([i]);
  }
  for (const members of partitions) {
    const groupId = groups.length;
    groups.push(members);
    for (const i of members) vertexGroup[i] = groupId;
    if (members.length > 1) { duplicateGroups++; groupedCopies += members.length; }
  }
}

const groupCount = groups.length;
const groupSource = new Float64Array(groupCount * 3);
const groupNormal = new Float64Array(groupCount * 3);
const groupSelected = new Uint8Array(groupCount);
for (let g = 0; g < groupCount; g++) {
  const members = groups[g], k = g * 3;
  for (const i of members) {
    groupSource[k] += source[i * 3]; groupSource[k + 1] += source[i * 3 + 1]; groupSource[k + 2] += source[i * 3 + 2];
    groupNormal[k] += authoredNormals[i * 3]; groupNormal[k + 1] += authoredNormals[i * 3 + 1]; groupNormal[k + 2] += authoredNormals[i * 3 + 2];
    if (mask[i]) groupSelected[g] = 1;
  }
  for (let axis = 0; axis < 3; axis++) { groupSource[k + axis] /= members.length; groupNormal[k + axis] /= members.length; }
  const length = Math.hypot(groupNormal[k], groupNormal[k + 1], groupNormal[k + 2]) || 1;
  for (let axis = 0; axis < 3; axis++) groupNormal[k + axis] /= length;
}

const neighbors = Array.from({ length: groupCount }, () => new Set());
const edgeUse = new Map();
const addEdge = (a, b) => {
  if (a === b) return;
  neighbors[a].add(b); neighbors[b].add(a);
  const lo = Math.min(a, b), hi = Math.max(a, b), key = `${lo},${hi}`;
  edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
};
for (let f = 0; f < indices.length; f += 3) {
  const a = vertexGroup[indices[f]], b = vertexGroup[indices[f + 1]], c = vertexGroup[indices[f + 2]];
  addEdge(a, b); addEdge(b, c); addEdge(c, a);
}

const hasOpenBoundary = new Uint8Array(groupCount);
for (const [key, count] of edgeUse) {
  if (count !== 1) continue;
  const comma = key.indexOf(',');
  hasOpenBoundary[Number(key.slice(0, comma))] = 1;
  hasOpenBoundary[Number(key.slice(comma + 1))] = 1;
}
// Keep true hems/boundaries and the one-ring around the mask edge fixed.
const editable = new Uint8Array(groupCount);
let selectedCount = 0, editableCount = 0, partialMaskGroups = 0;
for (let g = 0; g < groupCount; g++) {
  const members = groups[g];
  const selectedMembers = members.reduce((sum, i) => sum + (mask[i] ? 1 : 0), 0);
  if (!selectedMembers) continue;
  selectedCount += members.length;
  if (selectedMembers !== members.length) partialMaskGroups++;
  if (hasOpenBoundary[g]) continue;
  let interior = true;
  for (const j of neighbors[g]) if (!groupSelected[j]) { interior = false; break; }
  if (interior && neighbors[g].size >= 3) { editable[g] = 1; editableCount++; }
}
if (editableCount < 100) throw new Error(`máscara interior insuficiente: ${editableCount} grupos editáveis`);

let current = groupSource.slice();
for (let pass = 0; pass < iterations; pass++) {
  const next = current.slice();
  for (let g = 0; g < groupCount; g++) {
    if (!editable[g]) continue;
    let x = 0, y = 0, z = 0, n = 0;
    for (const j of neighbors[g]) { x += current[j * 3]; y += current[j * 3 + 1]; z += current[j * 3 + 2]; n++; }
    if (!n) continue;
    const k = g * 3, t = factor;
    next[k] = current[k] + t * (x / n - current[k]);
    next[k + 1] = current[k + 1] + t * (y / n - current[k + 1]);
    next[k + 2] = current[k + 2] + t * (z / n - current[k + 2]);
  }
  current = next;
}

const outputPositions = source.slice();
let sumSquares = 0, maxMove = 0, movedCount = 0, limitedCount = 0;
const dirtyGroup = new Uint8Array(groupCount);
for (let g = 0; g < groupCount; g++) {
  const k = g * 3;
  let dx = current[k] - groupSource[k], dy = current[k + 1] - groupSource[k + 1], dz = current[k + 2] - groupSource[k + 2];
  let d = Math.hypot(dx, dy, dz);
  const limit = maxMoveMm / 1000;
  if (d > limit) {
    const scale = limit / d;
    dx *= scale; dy *= scale; dz *= scale; d = limit;
    current[k] = groupSource[k] + dx; current[k + 1] = groupSource[k + 1] + dy; current[k + 2] = groupSource[k + 2] + dz;
    limitedCount++;
  }
  if (d <= 1e-8) continue;
  dirtyGroup[g] = 1; movedCount++; sumSquares += d * d; maxMove = Math.max(maxMove, d);
  for (const i of groups[g]) outputPositions.set(current.subarray(k, k + 3), i * 3);
}
if (!movedCount) throw new Error('nenhum vértice foi alterado');

// Recompute the complete geometric fan across co-located copies, then assign
// the result to every copy so UV seams stay continuous in both position/normal.
const normal = new Float64Array(groupCount * 3);
const affected = new Uint8Array(groupCount);
for (let f = 0; f < indices.length; f += 3) {
  const a = vertexGroup[indices[f]], b = vertexGroup[indices[f + 1]], c = vertexGroup[indices[f + 2]];
  if (!dirtyGroup[a] && !dirtyGroup[b] && !dirtyGroup[c]) continue;
  affected[a] = affected[b] = affected[c] = 1;
}
for (let f = 0; f < indices.length; f += 3) {
  const a = vertexGroup[indices[f]], b = vertexGroup[indices[f + 1]], c = vertexGroup[indices[f + 2]];
  if (!affected[a] && !affected[b] && !affected[c]) continue;
  const ax = current[a * 3], ay = current[a * 3 + 1], az = current[a * 3 + 2];
  const ux = current[b * 3] - ax, uy = current[b * 3 + 1] - ay, uz = current[b * 3 + 2] - az;
  const vx = current[c * 3] - ax, vy = current[c * 3 + 1] - ay, vz = current[c * 3 + 2] - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const faceLength = Math.hypot(nx, ny, nz);
  if (faceLength < 1e-12) continue;
  for (const g of new Set([a, b, c])) {
    const k = g * 3;
    const sign = nx * groupNormal[k] + ny * groupNormal[k + 1] + nz * groupNormal[k + 2] < 0 ? -1 : 1;
    normal[k] += sign * nx; normal[k + 1] += sign * ny; normal[k + 2] += sign * nz;
  }
}
const floatNormals = new Float32Array(vertexCount * 3);
let zeroNormals = 0, normalCount = 0;
for (let i = 0; i < vertexCount; i++) {
  const g = vertexGroup[i], k = g * 3, dst = i * 3;
  if (!affected[g]) { floatNormals.set(authoredNormals.subarray(dst, dst + 3), dst); continue; }
  const length = Math.hypot(normal[k], normal[k + 1], normal[k + 2]);
  if (length < 1e-12) {
    floatNormals.set(authoredNormals.subarray(dst, dst + 3), dst); zeroNormals++; continue;
  }
  floatNormals[dst] = normal[k] / length;
  floatNormals[dst + 1] = normal[k + 1] / length;
  floatNormals[dst + 2] = normal[k + 2] / length;
  normalCount++;
}

const hashArray = (array) => createHash('sha256').update(Array.from(array).join(',')).digest('hex');
const indexHash = hashArray(indices);
const joints = primitive.getAttribute('JOINTS_0')?.getArray();
const weights = primitive.getAttribute('WEIGHTS_0')?.getArray();
const jointsHash = joints ? hashArray(joints) : '';
const weightsHash = weights ? hashArray(weights) : '';
position.setArray(new Float32Array(outputPositions)).setNormalized(false);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vertexCount; i++) for (let axis = 0; axis < 3; axis++) {
  const value = outputPositions[i * 3 + axis]; min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
}
position.set('min', min).set('max', max);
if (normalMode === 'recompute') {
  normalsAccessor.setArray(floatNormals).setNormalized(false);
  normalsAccessor.set('min', [-1, -1, -1]).set('max', [1, 1, 1]);
}
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
console.log(`[pants-smooth] positional weld groups=${duplicateGroups} copies=${groupedCopies} partialMaskGroups=${partialMaskGroups}`);
console.log(`[pants-smooth] selectedVertices=${selectedCount} editableGroups=${editableCount} movedGroups=${movedCount} capped=${limitedCount} normals=${normalCount} zeroNormals=${zeroNormals}`);
console.log(`[pants-smooth] factor=${factor} passes=${iterations} rms=${(rms * 1000).toFixed(3)} mm source max=${(maxMove * 1000).toFixed(3)} mm source (limit=${maxMoveMm} mm); runtime≈${(rms * 1.72 * 1000).toFixed(3)} / ${(maxMove * 1.72 * 1000).toFixed(3)} mm`);
console.log(`[pants-smooth] normals=${normalMode}; topology/JOINTS/WEIGHTS preserved; output=${output} bytes=${(await stat(output)).size}`);
