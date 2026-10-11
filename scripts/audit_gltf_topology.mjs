#!/usr/bin/env node
// Source-level GLB topology audit. Unlike Blender import, this sees duplicate
// triangle indices before an importer silently removes them.
// Usage: node scripts/audit_gltf_topology.mjs <candidate.glb>
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const file = process.argv[2];
if (!file || file === '--help') {
  console.log('Uso: node scripts/audit_gltf_topology.mjs <candidate.glb>');
  process.exit(file ? 0 : 2);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();
const reports = [];
for (const mesh of root.listMeshes()) {
  for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
    const position = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    const mode = primitive.getMode() ?? Primitive.Mode.TRIANGLES;
    const count = indices?.getCount() ?? position?.getCount() ?? 0;
    const report = {
      mesh: mesh.getName(), primitive: primitiveIndex, mode,
      vertices: position?.getCount() ?? 0,
      triangles: mode === Primitive.Mode.TRIANGLES ? Math.floor(count / 3) : 0,
      duplicateTriangles: 0,
      repeatedIndexTriangles: 0,
      zeroAreaTriangles: 0,
      duplicateSamples: [],
      zeroAreaSamples: [],
      outOfRangeIndices: 0,
      unreferencedVertices: 0,
    };
    if (mode !== Primitive.Mode.TRIANGLES || !position) {
      report.unsupported = 'topologia exige POSITION e TRIANGLES';
      reports.push(report);
      continue;
    }
    const referenced = new Uint8Array(position.getCount());
    const triangleKeys = new Map();
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    const readIndex = (offset) => indices ? indices.getScalar(offset) : offset;
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const triangle = [readIndex(offset), readIndex(offset + 1), readIndex(offset + 2)];
      if (triangle.some((index) => index < 0 || index >= position.getCount())) {
        report.outOfRangeIndices++;
        continue;
      }
      for (const index of triangle) referenced[index] = 1;
      if (new Set(triangle).size !== 3) report.repeatedIndexTriangles++;
      const key = [...triangle].sort((x, y) => x - y).join(':');
      const copies = triangleKeys.get(key) ?? 0;
      if (copies) {
        report.duplicateTriangles++;
        if (report.duplicateSamples.length < 10) report.duplicateSamples.push({ indices: triangle, previousCopies: copies });
      }
      triangleKeys.set(key, copies + 1);

      position.getElement(triangle[0], a);
      position.getElement(triangle[1], b);
      position.getElement(triangle[2], c);
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const areaSquared = nx * nx + ny * ny + nz * nz;
      if (areaSquared <= 1e-20) {
        report.zeroAreaTriangles++;
        if (report.zeroAreaSamples.length < 20) {
          report.zeroAreaSamples.push({
            indices: triangle,
            centerRawPosition: [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis]) / 3),
            doubledAreaSquared: areaSquared,
          });
        }
      }
    }
    report.unreferencedVertices = referenced.reduce((sum, value) => sum + (value ? 0 : 1), 0);
    reports.push(report);
  }
}
console.log(JSON.stringify({ file, primitives: reports }, null, 2));
if (reports.some((report) => report.unsupported || report.outOfRangeIndices)) process.exitCode = 1;
