import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';

let meshoptFn = null;
try { const f = await import('@gltf-transform/functions'); meshoptFn = f.meshopt; } catch (e) { console.log('functions pkg ausente'); }

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read('/tmp/opencode/ana_clean.glb');
const root = doc.getRoot();
const node = root.listNodes().find(n => n.getMesh()?.getName() === 'Mesh_0');
const S = node.getScale()[0], T = node.getTranslation();
const prim = node.getMesh().listPrimitives()[0];

const rawPos = prim.getAttribute('POSITION').getArray();
const nv = rawPos.length / 3;
const pos = new Float32Array(nv * 3);
for (let i = 0; i < nv * 3; i++) pos[i] = rawPos[i] / 32767;
const idx = prim.getIndices().getArray();

// grupos de vertices duplicados (mesma posicao quantizada) - costuras UV
const groupMap = new Map();
const gid = new Int32Array(nv);
for (let i = 0; i < nv; i++) {
  const key = rawPos[i * 3] + ',' + rawPos[i * 3 + 1] + ',' + rawPos[i * 3 + 2];
  let g = groupMap.get(key);
  if (g === undefined) { g = groupMap.size; groupMap.set(key, g); }
  gid[i] = g;
}
const ngroups = groupMap.size;
console.log('verts:', nv, '| grupos (soldados):', ngroups);

function computeSums() {
  const sums = new Float64Array(nv * 3);
  const cnt = new Uint32Array(nv);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    for (let k = 0; k < 3; k++) {
      sums[a * 3 + k] += pos[b * 3 + k] + pos[c * 3 + k];
      sums[b * 3 + k] += pos[a * 3 + k] + pos[c * 3 + k];
      sums[c * 3 + k] += pos[a * 3 + k] + pos[b * 3 + k];
    }
    cnt[a] += 2; cnt[b] += 2; cnt[c] += 2;
  }
  return [sums, cnt];
}

function smoothPass(lambda, regionFn) {
  const [sums, cnt] = computeSums();
  const tent = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const wy = pos[i * 3 + 1] * S + T[1];
    const active = cnt[i] && (!regionFn || regionFn(wy));
    for (let k = 0; k < 3; k++) {
      tent[i * 3 + k] = active ? pos[i * 3 + k] + lambda * (sums[i * 3 + k] / cnt[i] - pos[i * 3 + k]) : pos[i * 3 + k];
    }
  }
  const gsum = new Float64Array(ngroups * 3), gcnt = new Uint32Array(ngroups);
  for (let i = 0; i < nv; i++) {
    const g = gid[i];
    for (let k = 0; k < 3; k++) gsum[g * 3 + k] += tent[i * 3 + k];
    gcnt[g]++;
  }
  let moved = 0;
  for (let i = 0; i < nv; i++) {
    const g = gid[i];
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = gsum[g * 3 + k] / gcnt[g];
    moved++;
  }
  console.log('smoothPass λ=' + lambda, 'verts movidos:', moved);
}

smoothPass(0.35, null);
smoothPass(0.5, wy => wy > 1.42);
smoothPass(0.5, wy => wy > 1.42);

const nrm = new Float32Array(nv * 3);
for (let t = 0; t < idx.length; t += 3) {
  const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
  const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
  const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
  const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
  nrm[a] += fx; nrm[a + 1] += fy; nrm[a + 2] += fz;
  nrm[b] += fx; nrm[b + 1] += fy; nrm[b + 2] += fz;
  nrm[c] += fx; nrm[c + 1] += fy; nrm[c + 2] += fz;
}
for (let i = 0; i < nv; i++) {
  const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
  nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
}

const oldPos = prim.getAttribute('POSITION'), oldNrm = prim.getAttribute('NORMAL');
prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos));
prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm));
oldPos.dispose(); oldNrm.dispose();
if (prim.getAttribute('TANGENT')) { const tg = prim.getAttribute('TANGENT'); prim.setAttribute('TANGENT', null); tg.dispose(); console.log('TANGENT removido'); }

const baseTex = root.listTextures().find(t => t.getName() === 'Image_0');
baseTex.setImage(readFileSync('/tmp/opencode/ana_basecolor_fixed.webp')).setMimeType('image/webp');
const nrmTex = root.listTextures().find(t => t.getName() === 'Image_2');
if (nrmTex) { nrmTex.setImage(readFileSync('/tmp/opencode/ana_normal_fixed.webp')).setMimeType('image/webp'); console.log('normal map achatado aplicado'); }
const mat = root.listMaterials().find(m => m.getName() === 'Material_0');
mat.setMetallicFactor(0).setRoughnessFactor(0.8);
console.log('textura base trocada + metallic=0, roughness=0.8');

await io.write('/tmp/opencode/ana_base_fixed.glb', doc);
console.log('OK: /tmp/opencode/ana_base_fixed.glb');
