// Remove duplicate/zero-area faces from a static LOD without moving its vertices.
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) throw new Error('Usage: input.glb distinct-output.glb');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
if (doc.getRoot().listSkins().length || doc.getRoot().listAnimations().length) throw new Error('Static sources only');
const reports = [];
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
  if (p.getMode() !== Primitive.Mode.TRIANGLES || p.listTargets().length) throw new Error('Triangles without morphs required');
  const pos = p.getAttribute('POSITION'), indices = p.getIndices();
  if (!pos || !indices) throw new Error('Indexed positions required');
  const source = indices.getArray(), kept = [], seen = new Set();
  let duplicates = 0, degenerates = 0;
  const a = [], b = [], c = [];
  for (let i = 0; i < source.length; i += 3) {
    const ids = [source[i], source[i + 1], source[i + 2]];
    if (ids.some(n => !Number.isInteger(n) || n < 0 || n >= pos.getCount())) throw new Error('Invalid triangle index');
    pos.getElement(ids[0], a); pos.getElement(ids[1], b); pos.getElement(ids[2], c);
    const u = b.map((n, j) => n - a[j]), v = c.map((n, j) => n - a[j]);
    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    if (new Set(ids).size < 3 || cross.reduce((sum, n) => sum + n*n, 0) < 1e-24) { degenerates++; continue; }
    const key = [...ids].sort((x,y) => x-y).join(',');
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key); kept.push(...ids);
  }
  indices.setArray(new source.constructor(kept));
  compactPrimitive(p);
  reports.push({ trianglesBefore: source.length/3, triangles: kept.length/3, duplicates, degenerates });
}
await doc.transform(prune());
await io.write(output, doc);
writeFileSync(output.replace(/\.glb$/, '.cleanup.json'), JSON.stringify({ input, reports }, null, 2));
console.log(JSON.stringify(reports));
