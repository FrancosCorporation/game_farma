// Adiciona olhos dedicados ao GLB ORIGINAL (sem re-exportar o corpo).
// Cada esfera é orientada pela normal da face no ponto da íris (detectada por
// qa_eyepos.mjs): o polo da textura (íris) fica tangente à superfície + POLO_OFF.
// Uso: node scripts/comfy/eyes_add.mjs <src> <dst> <eyes.json> [raio] [polo_off]
// eyes.json: { "L": {"pos":[x,y,z],"normal":[nx,ny,nz]}, "R": {...} }
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const src = process.argv[2];
const dst = process.argv[3];
const eyes = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const R = Number(process.argv[5] || 0.012); // raio da esfera (cobre a íris pintada)
const POLO_OFF = Number(process.argv[6] || 0.001); // quanto o polo sobressai da pálpebra
const IRIS = '/tmp/opencode/iris_ana.png';

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization, KHRMaterialsClearcoat])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(src);
const root = doc.getRoot();

const SEG = 96, RING = 48;
function buildSphere() {
  const positions = [], normals = [], uvs = [], indices = [];
  const vIdx = [];
  positions.push(0, 0, R); normals.push(0, 0, 1); uvs.push(0.5, 1.0);
  vIdx.push(0);
  for (let i = 1; i < RING; i++) {
    const th = i * Math.PI / RING;
    const r = R * Math.sin(th), z = R * Math.cos(th);
    const row = [];
    for (let j = 0; j < SEG; j++) {
      const ph = j * 2 * Math.PI / SEG;
      const idx = positions.length / 3;
      positions.push(r * Math.cos(ph), r * Math.sin(ph), z);
      normals.push(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
      uvs.push(j / SEG, 1 - th / Math.PI);
      row.push(idx);
    }
    vIdx.push(row);
  }
  const bot = positions.length / 3;
  positions.push(0, 0, -R); normals.push(0, 0, -1); uvs.push(0.5, 0.0);
  for (let j = 0; j < SEG; j++) {
    const jn = (j + 1) % SEG;
    indices.push(0, vIdx[0][j], vIdx[0][jn]);
  }
  for (let i = 0; i < RING - 2; i++) {
    for (let j = 0; j < SEG; j++) {
      const jn = (j + 1) % SEG;
      indices.push(vIdx[i][j], vIdx[i][jn], vIdx[i + 1][jn], vIdx[i + 1][j]);
    }
  }
  for (let j = 0; j < SEG; j++) {
    const jn = (j + 1) % SEG;
    indices.push(vIdx[RING - 2][j], vIdx[RING - 2][jn], bot);
  }
  return { positions, normals, uvs, indices };
}

function quatFromZAxis(z) {
  // rotação que leva +Z ao vetor `z` (não normalizado aqui)
  const n = z;
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-6) return [0, 0, 0, 1];
  const nx = n[0] / len, ny = n[1] / len, nz = n[2] / len;
  const cx = 0, cy = 0, cz = 1; // eixo de referência
  const d = cx * nx + cy * ny + cz * nz;
  if (d > 0.9999) return [0, 0, 0, 1];
  if (d < -0.9999) return [1, 0, 0, 0]; // 180° em X
  const axis = [cy * nz - cz * ny, cz * nx - cx * nz, cx * ny - cy * nx];
  const al = Math.hypot(...axis);
  const half = Math.acos(d) / 2;
  const s = Math.sin(half) / al;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

const irisImg = readFileSync(IRIS);
const tex = doc.createTexture('iris_ana').setMimeType('image/png').setImage(irisImg);
const mat = doc.createMaterial('EyePixar')
  .setBaseColorTexture(tex)
  .setDoubleSided(false)
  .setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.55);

function addEye(name, e) {
  const { positions, normals, uvs, indices } = buildSphere();
  const prim = doc.createPrimitive();
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)))
    .setMaterial(mat);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh);
  // centro da esfera: RECUA ao longo do normal para dentro da órbita, e o polo
  // (frente da esfera, na direção do normal) fica POLO_OFF à frente da pálpebra.
  const [nx, ny, nz] = e.normal;
  const len = Math.hypot(nx, ny, nz) || 1;
  const ux = nx / len, uy = ny / len, uz = nz / len;
  const off = R - POLO_OFF;
  node.setTranslation([e.pos[0] - ux * off, e.pos[1] - uy * off, e.pos[2] - uz * off]);
  node.setRotation(quatFromZAxis([ux, uy, uz]));
  return node;
}
const scene = root.listScenes()[0] || doc.createScene();
scene.addChild(addEye('Eye_L', eyes.L));
scene.addChild(addEye('Eye_R', eyes.R));

await io.write(dst, doc);
console.log('[olho] salvo (corpo intocado):', dst, JSON.stringify(eyes));