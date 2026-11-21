// Build a pose-space corrective on Ana's existing shirt mesh. The corrective
// follows the chest displacement of the existing RightArm-damped candidate,
// while the original arm animation and all source vertices remain unchanged.
// Usage:
// node scripts/create_character_shoulder_corrective.mjs <base.glb> <damped.glb> <output.glb> <base-model-name> <damped-model-name> [preview-origin] [falloff-radius=0.03]
import { access, rename, rm, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const [basePath, dampedPath, outputPath, baseName, dampedName, origin = 'http://127.0.0.1:4180', radiusArg = '0.03'] = process.argv.slice(2);
if (!basePath || !dampedPath || !outputPath || !baseName || !dampedName) {
  console.error('Uso: node scripts/create_character_shoulder_corrective.mjs <base.glb> <damped.glb> <output.glb> <base-model-name> <damped-model-name> [preview-origin]');
  process.exit(2);
}
const falloffRadius = Number(radiusArg);
if (!(falloffRadius >= 0.005 && falloffRadius <= 0.2)) throw new Error('falloff-radius deve ficar entre 0.005 e 0.2 unidades da malha');
if (basePath === outputPath || dampedPath === outputPath || /[\\/]/.test(baseName) || /[\\/]/.test(dampedName)) {
  throw new Error('a saída deve ser separada e os nomes do viewer não podem conter pastas');
}
try { await access(outputPath); throw new Error(`saída já existe: ${outputPath}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const baseDoc = await io.read(basePath);
const baseRoot = baseDoc.getRoot();
const basePrimitive = baseRoot.listMeshes()[0]?.listPrimitives()[0];
const baseSkin = baseRoot.listSkins()[0];
const baseNode = baseRoot.listNodes().find((node) => node.getSkin() && node.getMesh());
if (!basePrimitive || !baseSkin || !baseNode || baseSkin.listJoints().length !== 65 || baseRoot.listMeshes().length !== 1) {
  throw new Error('GLB base não corresponde à malha/rig Ana esperado');
}

const sha = (array) => array ? createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') : null;
const dampedDoc = await io.read(dampedPath);
const dampedRoot = dampedDoc.getRoot();
const dampedPrimitive = dampedRoot.listMeshes()[0]?.listPrimitives()[0];
const dampedSkin = dampedRoot.listSkins()[0];
for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
  if (sha(basePrimitive.getAttribute(semantic)?.getArray()) !== sha(dampedPrimitive?.getAttribute(semantic)?.getArray())) {
    throw new Error(`${semantic} difere: corretivo cancelado para não misturar malhas`);
  }
}
if (sha(basePrimitive.getIndices()?.getArray()) !== sha(dampedPrimitive.getIndices()?.getArray()) ||
    JSON.stringify(baseSkin.listJoints().map((joint) => joint.getName())) !== JSON.stringify(dampedSkin.listJoints().map((joint) => joint.getName())) ||
    sha(baseSkin.getInverseBindMatrices()?.getArray()) !== sha(dampedSkin.getInverseBindMatrices()?.getArray())) {
  throw new Error('topologia, esqueleto ou bind matrices diferem entre fontes');
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
let capture;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto(`${origin}/char-preview.html?m=${encodeURIComponent(baseName)}&anim=Walk&cam=torso`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
  capture = await page.evaluate(async ({ baseName, dampedName, falloffRadius }) => {
    const THREE = window.__THREE;
    const { GLTFLoader } = await import('./vendor/three/jsm/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('./vendor/three/jsm/libs/meshopt_decoder.module.js');
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const load = (name) => new Promise((resolve, reject) => loader.load(`models/${name}.glb`, resolve, undefined, reject));
    const [base, damped] = await Promise.all([load(baseName), load(dampedName)]);
    const rig = (gltf) => {
      const root = gltf.scene;
      const mesh = [];
      root.traverse((object) => { if (object.isSkinnedMesh) mesh.push(object); });
      if (mesh.length !== 1) throw new Error(`esperava 1 SkinnedMesh, encontrei ${mesh.length}`);
      const clip = gltf.animations.find((item) => /walk/i.test(item.name));
      if (!clip) throw new Error('clip Walk ausente');
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(clip);
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      return { root, mesh: mesh[0], clip, mixer, action };
    };
    const a = rig(base), b = rig(damped);
    const pa = a.mesh.geometry.attributes.position;
    const pb = b.mesh.geometry.attributes.position;
    if (pa.count !== pb.count) throw new Error('contagem de vértices diverge no viewer');
    const index = a.mesh.geometry.index.array;
    const parent = new Uint32Array(pa.count);
    const sizes = new Uint32Array(pa.count);
    for (let i = 0; i < parent.length; i++) { parent[i] = i; sizes[i] = 1; }
    const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== x) { const n = parent[x]; parent[x] = r; x = n; } return r; };
    const join = (x, y) => { let rx = find(x), ry = find(y); if (rx === ry) return; if (sizes[rx] < sizes[ry]) [rx, ry] = [ry, rx]; parent[ry] = rx; sizes[rx] += sizes[ry]; };
    for (let tri = 0; tri < index.length; tri += 3) { join(index[tri], index[tri + 1]); join(index[tri], index[tri + 2]); }
    const roots = [find(103330), find(24034)];
    const rootSizes = roots.map((root) => sizes[root]);
    if (rootSizes[0] !== 539 || rootSizes[1] !== 353 || roots[0] === roots[1]) {
      throw new Error(`ilhas de camiseta divergiram (${rootSizes.join('/')}); não vou editar outra região`);
    }
    const selected = new Set();
    for (let v = 0; v < parent.length; v++) if (roots.includes(find(v))) selected.add(v);
    // Include coincident duplicate indices at shirt/body seams so the corrective
    // cannot open the existing seam when a shape is applied.
    const positionArray = new Float32Array(pa.count * 3);
    for (let v = 0; v < pa.count; v++) {
      positionArray[v * 3] = pa.getX(v);
      positionArray[v * 3 + 1] = pa.getY(v);
      positionArray[v * 3 + 2] = pa.getZ(v);
    }
    const keyAt = (v) => `${Math.round(positionArray[v * 3] * 100000)},${Math.round(positionArray[v * 3 + 1] * 100000)},${Math.round(positionArray[v * 3 + 2] * 100000)}`;
    const byPosition = new Map();
    for (let v = 0; v < pa.count; v++) { const key = keyAt(v); const list = byPosition.get(key) || []; list.push(v); byPosition.set(key, list); }
    const selectedKeys = new Set([...selected].map(keyAt));
    for (const key of selectedKeys) for (const v of byPosition.get(key) || []) selected.add(v);
    const seeds = [...selected].sort((x, y) => x - y);
    const radius = falloffRadius;
    const smoothstep = (x) => x * x * (3 - 2 * x);
    const cellKey = (x, y, z) => `${x},${y},${z}`;
    const cells = new Map();
    for (const v of seeds) {
      const key = cellKey(
        Math.floor(positionArray[v * 3] / radius),
        Math.floor(positionArray[v * 3 + 1] / radius),
        Math.floor(positionArray[v * 3 + 2] / radius),
      );
      const list = cells.get(key) || [];
      list.push(v);
      cells.set(key, list);
    }
    const weights = new Map();
    for (let v = 0; v < pa.count; v++) {
      const gx = Math.floor(positionArray[v * 3] / radius);
      const gy = Math.floor(positionArray[v * 3 + 1] / radius);
      const gz = Math.floor(positionArray[v * 3 + 2] / radius);
      let nearestSquared = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const seed of cells.get(cellKey(gx + dx, gy + dy, gz + dz)) || []) {
          const ox = positionArray[v * 3] - positionArray[seed * 3];
          const oy = positionArray[v * 3 + 1] - positionArray[seed * 3 + 1];
          const oz = positionArray[v * 3 + 2] - positionArray[seed * 3 + 2];
          nearestSquared = Math.min(nearestSquared, ox * ox + oy * oy + oz * oz);
        }
      }
      if (nearestSquared < radius * radius) {
        const t = Math.sqrt(nearestSquared) / radius;
        weights.set(v, selected.has(v) ? 1 : 1 - smoothstep(t));
      } else if (selected.has(v)) {
        weights.set(v, 1);
      }
    }
    const vertices = [...weights.keys()].sort((x, y) => x - y);
    const duration = a.clip.duration;
    if (Math.abs(duration - b.clip.duration) > 1e-5) throw new Error('duração Walk difere entre as duas fontes');
    const phases = [0, 0.25, 0.5, 0.75, 1];
    const samples = [];
    let maxOutputDelta = 0;
    let maxOutputDeltaWorld = 0;
    const previewScale = window.__model.scale.x;
    for (const phase of phases) {
      const time = duration * phase;
      a.mixer.setTime(time); b.mixer.setTime(time);
      a.root.updateMatrixWorld(true); b.root.updateMatrixWorld(true);
      const rows = [];
      for (const v of vertices) {
        const basePoint = new THREE.Vector3().fromBufferAttribute(pa, v);
        const baseOut = a.mesh.applyBoneTransform(v, basePoint.clone());
        const dampedOut = b.mesh.applyBoneTransform(v, new THREE.Vector3().fromBufferAttribute(pb, v));
        const desired = dampedOut.sub(baseOut).multiplyScalar(weights.get(v));
        maxOutputDelta = Math.max(maxOutputDelta, desired.length());
        const worldLinear = new THREE.Matrix3().setFromMatrix4(a.mesh.matrixWorld);
        maxOutputDeltaWorld = Math.max(maxOutputDeltaWorld, desired.clone().applyMatrix3(worldLinear).multiplyScalar(previewScale).length());
        const columns = [];
        for (const [x, y, z] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
          const q = basePoint.clone().add(new THREE.Vector3(x, y, z));
          columns.push(a.mesh.applyBoneTransform(v, q).sub(baseOut));
        }
        const matrix = new THREE.Matrix3().set(
          columns[0].x, columns[1].x, columns[2].x,
          columns[0].y, columns[1].y, columns[2].y,
          columns[0].z, columns[1].z, columns[2].z,
        );
        if (Math.abs(matrix.determinant()) < 1e-6) throw new Error(`skin matrix singular na fase ${phase}, vertex ${v}`);
        const sourceOffset = desired.applyMatrix3(matrix.invert());
        rows.push(sourceOffset.x, sourceOffset.y, sourceOffset.z);
      }
      samples.push({ phase, time, deltas: rows });
    }
    return { vertexCount: pa.count, vertices, phases, duration, rootSizes, selectedCount: vertices.length,
      exactDuplicateExpansion: seeds.length - rootSizes.reduce((sum, n) => sum + n, 0),
      transitionRadius: radius, minMaskWeight: Math.min(...weights.values()),
      maxOutputDelta, maxOutputDeltaWorld, samples };
  }, { baseName, dampedName, falloffRadius });
  if (browserErrors.length) throw new Error(`erro no viewer: ${browserErrors.join('; ')}`);
} finally {
  await browser.close();
}

if (capture.vertexCount !== basePrimitive.getAttribute('POSITION').getCount()) throw new Error('viewer e arquivo têm contagens diferentes');
const maxWorldShift = capture.maxOutputDeltaWorld;
if (!(maxWorldShift > 1e-6 && maxWorldShift < 0.05)) throw new Error(`deslocamento esperado fora de faixa: ${maxWorldShift} m (${capture.maxOutputDelta} unidades nativas)`);

const mesh = baseNode.getMesh();
const primitive = mesh.listPrimitives()[0];
if (primitive.listTargets().length) throw new Error('base já possui morph targets; composição exige auditoria explícita');
const vertexCount = capture.vertexCount;
const targetCount = capture.samples.length;
const selected = capture.vertices;
const buffer = baseRoot.listBuffers()[0];
for (let targetIndex = 0; targetIndex < targetCount; targetIndex++) {
  const dense = new Float32Array(vertexCount * 3);
  const sparse = capture.samples[targetIndex].deltas;
  for (let i = 0; i < selected.length; i++) {
    dense[selected[i] * 3] = sparse[i * 3];
    dense[selected[i] * 3 + 1] = sparse[i * 3 + 1];
    dense[selected[i] * 3 + 2] = sparse[i * 3 + 2];
  }
  const accessor = baseDoc.createAccessor(`ShoulderCorrective_${targetIndex}_POSITION`)
    .setType('VEC3').setArray(dense).setBuffer(buffer);
  primitive.addTarget(baseDoc.createPrimitiveTarget().setAttribute('POSITION', accessor));
}
mesh.setWeights(new Array(targetCount).fill(0));
baseNode.setWeights(new Array(targetCount).fill(0));
mesh.setExtras({ ...(mesh.getExtras() || {}), targetNames: capture.phases.map((phase) => `WalkShoulder_${Math.round(phase * 100)}`) });

const walk = baseRoot.listAnimations().find((animation) => /walk/i.test(animation.getName()));
if (!walk) throw new Error('clip Walk ausente na saída');
const input = baseDoc.createAccessor('ShoulderCorrective_Walk_Times')
  .setType('SCALAR').setArray(Float32Array.from(capture.samples.map((sample) => sample.time))).setBuffer(buffer);
const outputValues = new Float32Array(targetCount * targetCount);
for (let key = 0; key < targetCount; key++) outputValues[key * targetCount + key] = 1;
const output = baseDoc.createAccessor('ShoulderCorrective_Walk_Weights')
  .setType('SCALAR').setArray(outputValues).setBuffer(buffer);
const sampler = baseDoc.createAnimationSampler('Shoulder corrective weights')
  .setInput(input).setOutput(output).setInterpolation('LINEAR');
walk.addSampler(sampler);
walk.addChannel(baseDoc.createAnimationChannel('Walk shirt shoulder corrective')
  .setTargetNode(baseNode).setTargetPath('weights').setSampler(sampler));

const staging = outputPath.replace(/\.glb$/i, '.staging.glb');
if (staging === outputPath) throw new Error('saída precisa terminar em .glb');
try { await access(staging); throw new Error(`staging já existe: ${staging}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
try {
  await io.write(staging, baseDoc);
  const roundTrip = await io.read(staging);
  const outMesh = roundTrip.getRoot().listMeshes()[0];
  const outPrimitive = outMesh.listPrimitives()[0];
  if (outPrimitive.listTargets().length !== targetCount) throw new Error('quantidade de morph targets mudou no export');
  if (sha(outPrimitive.getAttribute('POSITION')?.getArray()) !== sha(basePrimitive.getAttribute('POSITION')?.getArray()) ||
      sha(outPrimitive.getAttribute('WEIGHTS_0')?.getArray()) !== sha(basePrimitive.getAttribute('WEIGHTS_0')?.getArray()) ||
      sha(outPrimitive.getIndices()?.getArray()) !== sha(basePrimitive.getIndices()?.getArray())) {
    throw new Error('malha base, pesos ou topologia mudaram');
  }
  const outWalk = roundTrip.getRoot().listAnimations().find((animation) => /walk/i.test(animation.getName()));
  if (!outWalk?.listChannels().some((channel) => channel.getTargetPath() === 'weights')) throw new Error('canal do corretivo não persistiu');
  await rename(staging, outputPath);
} catch (error) {
  await rm(staging, { force: true });
  throw error;
}
console.log(JSON.stringify({
  output: outputPath,
  base: basename(basePath),
  dampedReference: basename(dampedPath),
  vertices: capture.vertexCount,
  correctedVertices: capture.selectedCount,
  transitionRadiusInSourceSpace: capture.transitionRadius,
  duplicateSeamVerticesIncluded: capture.exactDuplicateExpansion,
  sourceShirtIslands: capture.rootSizes,
  walkDurationSeconds: +capture.duration.toFixed(6),
  correctivePhases: capture.phases,
  maxPredictedSurfaceShiftMeters: +maxWorldShift.toFixed(6),
  preserved: 'same base POSITION/NORMAL/UV/JOINTS/WEIGHTS/index/rig/IBMs; only adds 5 pose-space morph targets and Walk weights channel',
  bytes: (await stat(outputPath)).size,
}, null, 2));
