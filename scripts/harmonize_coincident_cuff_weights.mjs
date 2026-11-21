#!/usr/bin/env node
// Experimental, non-destructive test for UV-seam vertices that occupy the
// same lower-leg position/normal but carry conflicting skin weights.
// Usage: node scripts/harmonize_coincident_cuff_weights.mjs input.glb mask.json output.glb [normalDotMinimum=0.99]
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [input, maskPath, output, normalDotMinArg = '0.99'] = process.argv.slice(2);
if (!input || !maskPath || !output || resolve(input) === resolve(output)) {
  throw new Error('Uso: node scripts/harmonize_coincident_cuff_weights.mjs input.glb mask.json output.glb');
}
const normalDotMinimum = Number(normalDotMinArg);
if (!Number.isFinite(normalDotMinimum) || normalDotMinimum < 0.99 || normalDotMinimum > 1) {
  throw new Error('normalDotMinimum deve ficar entre 0.99 e 1 para evitar fundir costuras angulosas');
}
try { await access(output); throw new Error(`Saída já existe; não será sobrescrita: ${output}`); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const sourceBytes = await readFile(input);
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const maskData = JSON.parse(await readFile(maskPath, 'utf8'));
if (maskData.sourceSha256 !== sourceSha256) throw new Error('A máscara não corresponde ao SHA-256 do GLB de entrada');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
const doc = await io.read(input);
const root = doc.getRoot();
const skinnedNodes = root.listNodes().filter((node) => node.getSkin() && node.getMesh());
if (skinnedNodes.length !== 1 || root.listSkins().length !== 1) throw new Error('Esperado um único mesh skinned/skin');
const primitives = skinnedNodes[0].getMesh().listPrimitives();
if (primitives.length !== 1) throw new Error('Esperada uma primitive skinned');
const primitive = primitives[0];
const position = primitive.getAttribute('POSITION');
const normal = primitive.getAttribute('NORMAL');
const joints = primitive.getAttribute('JOINTS_0');
const weights = primitive.getAttribute('WEIGHTS_0');
if (!position || !normal || !joints || !weights || primitive.getAttribute('JOINTS_1') || primitive.getAttribute('WEIGHTS_1')) {
  throw new Error('POSITION/NORMAL/JOINTS_0/WEIGHTS_0 esperados; conjuntos adicionais não são suportados');
}
if (maskData.vertexCount !== position.getCount() || maskData.mask?.length !== position.getCount()) {
  throw new Error('A contagem da máscara difere do mesh de entrada');
}
if (!weights.getNormalized()) throw new Error('WEIGHTS_0 precisa ser normalizado');

const groups = new Map();
for (let vertex = 0; vertex < position.getCount(); vertex++) {
  const key = position.getElement(vertex, []).map((value) => value.toPrecision(9)).join(',');
  const group = groups.get(key) ?? [];
  group.push(vertex);
  groups.set(key, group);
}

const report = {
  sourceSha256,
  selectedVertices: maskData.selection?.selectedVertices ?? maskData.mask.reduce((sum, value) => sum + (value ? 1 : 0), 0),
  selectedCoincidentGroups: 0,
  selectedWeightDivergentGroups: 0,
  normalDotMinimum,
  skippedNormalMismatchGroups: 0,
  changedGroups: 0,
  changedVertices: 0,
  maxAbsoluteInfluenceDelta: 0,
  changedVertexIndices: [],
};

const influencesFor = (vertex) => {
  const jointSlots = joints.getElement(vertex, []);
  const weightSlots = weights.getElement(vertex, []);
  const result = new Map();
  for (let slot = 0; slot < 4; slot++) {
    if (weightSlots[slot] <= 1e-8) continue;
    const joint = jointSlots[slot];
    result.set(joint, (result.get(joint) ?? 0) + weightSlots[slot]);
  }
  return result;
};

for (const vertices of groups.values()) {
  if (vertices.length < 2 || !vertices.some((vertex) => maskData.mask[vertex])) continue;
  report.selectedCoincidentGroups++;
  const normals = vertices.map((vertex) => normal.getElement(vertex, []));
  const reference = normals[0];
  const aligned = normals.every((value) => {
    const dot = reference.reduce((sum, component, axis) => sum + component * value[axis], 0);
    return dot >= normalDotMinimum;
  });
  if (!aligned) {
    report.skippedNormalMismatchGroups++;
    continue;
  }

  const maps = vertices.map(influencesFor);
  const jointSet = new Set(maps.flatMap((map) => [...map.keys()]));
  const divergent = jointSet.size > 0 && vertices.slice(1).some((_, index) => {
    const left = maps[0], right = maps[index + 1];
    return [...jointSet].some((joint) => Math.abs((left.get(joint) ?? 0) - (right.get(joint) ?? 0)) > 1e-5);
  });
  if (!divergent) continue;
  report.selectedWeightDivergentGroups++;
  if (jointSet.size > 4) throw new Error(`Grupo coincidente ${vertices.join(',')} excede quatro juntas (${jointSet.size})`);

  const average = new Map([...jointSet].map((joint) => [
    joint,
    maps.reduce((sum, map) => sum + (map.get(joint) ?? 0), 0) / vertices.length,
  ]));
  const ordered = [...average.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const jointSlots = [...ordered.map(([joint]) => joint), ...Array(4).fill(0)].slice(0, 4);
  const weightSlots = [...ordered.map(([, weight]) => weight), ...Array(4).fill(0)].slice(0, 4);
  const total = weightSlots.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-4) throw new Error(`Pesos médios não normalizados para grupo ${vertices.join(',')}: ${total}`);

  for (const vertex of vertices) {
    const previous = maps[vertices.indexOf(vertex)];
    for (const joint of jointSet) {
      report.maxAbsoluteInfluenceDelta = Math.max(
        report.maxAbsoluteInfluenceDelta,
        Math.abs((previous.get(joint) ?? 0) - (average.get(joint) ?? 0)),
      );
    }
    joints.setElement(vertex, jointSlots);
    weights.setElement(vertex, weightSlots);
    report.changedVertices++;
    report.changedVertexIndices.push(vertex);
  }
  report.changedGroups++;
}

if (!report.changedGroups) throw new Error('Nenhum grupo UV coincidente com pesos divergentes dentro da máscara');
await io.write(output, doc);
console.log(JSON.stringify({ input, output, ...report }, null, 2));
