// Static character LOD: keep vertex values, account for normal and UV interpolation.
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
const [input, output, targetArg = '30000', errorArg = '0.001'] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: canonical.glb candidate.glb [triangle target] [appearance error]');
const target = Number(targetArg), errorLimit = Number(errorArg);
if (!Number.isFinite(target) || target < 1000) throw new Error('Invalid triangle target');
if (!Number.isFinite(errorLimit) || errorLimit <= 0 || errorLimit > 1) throw new Error('Invalid error limit');
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
if (doc.getRoot().listSkins().length || doc.getRoot().listAnimations().length) {
  throw new Error('Static sources only: rigged/animated characters require their own workflow');
}
const primitives = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives());
if (!primitives.length) throw new Error('No mesh primitives');
for (const p of primitives) {
  if (p.getMode() !== Primitive.Mode.TRIANGLES || p.listTargets().length) {
    throw new Error('Only triangle primitives without morph targets are supported');
  }
}
await doc.transform(weld());
const count = () => primitives.reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
const before = count(), ratio = Math.min(1, target / before), reports = [];
for (const p of primitives) {
  const position = p.getAttribute('POSITION'), normal = p.getAttribute('NORMAL'), uv = p.getAttribute('TEXCOORD_0');
  if (!position || !normal || position.getType() !== 'VEC3' || normal.getType() !== 'VEC3') {
    throw new Error('POSITION and NORMAL VEC3 required');
  }
  const vertices = position.getCount();
  if (normal.getCount() !== vertices || (uv && (uv.getType() !== 'VEC2' || uv.getCount() !== vertices))) {
    throw new Error('Attribute dimensions/counts do not match');
  }
  const positions = new Float32Array(vertices * 3), stride = uv ? 5 : 3;
  const attributes = new Float32Array(vertices * stride);
  const pos = [], n = [], tex = [];
  for (let i = 0; i < vertices; i++) {
    position.getElement(i, pos); normal.getElement(i, n);
    positions.set(pos, i * 3); attributes.set(n, i * stride);
    if (uv) { uv.getElement(i, tex); attributes.set(tex, i * stride + 3); }
  }
  const sourceIndices = p.getIndices(), indices = new Uint32Array(sourceIndices.getArray());
  if (indices.length % 3) throw new Error('Triangle index count is not divisible by three');
  const requested = Math.max(3, Math.floor(indices.length * ratio / 3) * 3);
  const [reduced, appearanceError] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, attributes, stride, Array(stride).fill(1), null, requested, errorLimit,
  );
  p.setIndices(doc.createAccessor('lod-indices').setType('SCALAR')
    .setBuffer(sourceIndices.getBuffer()).setArray(reduced));
  compactPrimitive(p);
  reports.push({ attributes: uv ? ['NORMAL', 'TEXCOORD_0'] : ['NORMAL'],
    trianglesBefore: indices.length / 3, triangles: reduced.length / 3, appearanceError });
}
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'high',
  quantizePosition: 16, quantizeTexcoord: 16, quantizeNormal: 12 }));
const triangles = count();
await io.write(output, doc);
writeFileSync(output.replace(/\.glb$/, '.report.json'), JSON.stringify({ source: input,
  status: 'provisional_mesh_not_rigged', method: 'attribute-aware index-only; NORMAL+UV weights1',
  trianglesBefore: before, triangles, target, errorLimit, primitives: reports }, null, 2) + '\n');
console.log('Candidate:', output, 'triangles:', triangles, 'target:', target, 'errorLimit:', errorLimit);
