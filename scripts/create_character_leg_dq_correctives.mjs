// Build local pose-space lower-limb corrective shapes for a glTF LBS skin.
// For each sampled Walk/Idle pose, the mesh is compared with a dual-quaternion
// blend; only vertices influenced by leg/foot joints receive morph targets.
// Geometry, rig, weights and original clips are preserved.
// Optional regions isolate the calf/cuff; mixed-cuff includes blended ankle
// transition vertices but keeps fully foot/toe-weighted support points fixed.
// Usage: node scripts/create_character_leg_dq_correctives.mjs <input.glb> <output.glb> [strength=0.2] [all|lower-leg-cuff|mixed-cuff]
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { access, rename, rm, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { chromium } from 'playwright';

const [input, output, strengthArgument = '0.2', regionArgument = 'all'] = process.argv.slice(2);
if (!input || !output || input === '--help') {
  console.log('Uso: node scripts/create_character_leg_dq_correctives.mjs <input.glb> <output.glb> [strength=0.2] [all|lower-leg-cuff|mixed-cuff]');
  process.exit(input ? 0 : 2);
}
const correctiveStrength = Number(strengthArgument);
if (!(correctiveStrength > 0 && correctiveStrength <= 1)) throw new Error('strength deve estar entre 0 e 1');
if (!['all', 'lower-leg-cuff', 'mixed-cuff'].includes(regionArgument)) throw new Error('region deve ser all, lower-leg-cuff ou mixed-cuff');
if (resolve(input) === resolve(output)) throw new Error('a saída precisa ser um arquivo separado');
try { await access(output); throw new Error(`a saída já existe: ${output}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const document = await io.read(input);
const root = document.getRoot();
const skin = root.listSkins()[0];
const skinnedNode = root.listNodes().find((node) => node.getSkin() && node.getMesh());
const gltfMesh = skinnedNode?.getMesh();
const primitive = gltfMesh?.listPrimitives()[0];
if (root.listSkins().length !== 1 || skin?.listJoints().length !== 65 || !primitive || !skinnedNode || root.listNodes().filter((node) => node.getSkin() && node.getMesh()).length !== 1) {
  throw new Error('esperado um mesh skinned com uma skin e 65 joints');
}
if (primitive.getMode() !== Primitive.Mode.TRIANGLES || primitive.listTargets().length) throw new Error('esperada malha triangular sem morph targets prévios');
for (const semantic of ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']) if (!primitive.getAttribute(semantic)) throw new Error(`atributo ausente: ${semantic}`);
if (primitive.getAttribute('JOINTS_1') || primitive.getAttribute('WEIGHTS_1')) throw new Error('mais de quatro influences não suportadas');
const hash = (array) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const originalHashes = Object.fromEntries(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].map((semantic) => [semantic, hash(primitive.getAttribute(semantic)?.getArray())]));
const originalIndicesHash = hash(primitive.getIndices().getArray());

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR = join(ROOT, 'node_modules', 'three');
const html = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/vendor/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/vendor/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '/vendor/examples/jsm/libs/meshopt_decoder.module.js';
const correctiveStrength = ${JSON.stringify(correctiveStrength)};
const correctiveRegion = ${JSON.stringify(regionArgument)};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/model.glb');
const model = gltf.scene;
const meshes = [];
model.traverse((object) => { if (object.isSkinnedMesh) meshes.push(object); });
if (meshes.length !== 1) throw new Error('esperado exatamente um SkinnedMesh');
const mesh = meshes[0], geometry = mesh.geometry;
const position = geometry.getAttribute('position'), skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
const index = geometry.index;
const legIndices = new Set(mesh.skeleton.bones.map((bone, i) => /^(mixamorig)?(left|right)(upleg|leg|foot|toe)/i.test(bone.name.replaceAll(':', '')) ? i : -1).filter((i) => i >= 0));
if (legIndices.size < 8) throw new Error('cadeias de pernas/pés incompletas');
const lowerLegIndices = new Set(mesh.skeleton.bones.map((bone, i) => /^(mixamorig)?(left|right)leg$/i.test(bone.name.replaceAll(':', '')) ? i : -1).filter((i) => i >= 0));
const footIndices = new Set(mesh.skeleton.bones.map((bone, i) => /^(mixamorig)?(left|right)(foot|toe)/i.test(bone.name.replaceAll(':', '')) ? i : -1).filter((i) => i >= 0));
if (correctiveRegion !== 'all' && (lowerLegIndices.size !== 2 || footIndices.size < 4)) throw new Error(correctiveRegion + ' exige duas juntas Leg e quatro juntas Foot/Toe');
const clips = ['walk', 'idle'].map((name) => gltf.animations.find((clip) => clip.name.toLowerCase() === name)).filter(Boolean);
if (clips.length !== 2) throw new Error('clips Walk e Idle são necessários');
const phasesFor = (clip) => clip.name.toLowerCase() === 'walk'
  ? Array.from({ length: 9 }, (_, i) => i / 8)
  : [0, 0.25, 0.5, 0.75, 1];
const matrixAt = (boneIndex) => new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, boneIndex * 16);
const rigidTransform = (matrix) => {
  const translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  matrix.decompose(translation, rotation, scale);
  rotation.normalize();
  const dual = new THREE.Quaternion(translation.x, translation.y, translation.z, 0).multiply(rotation);
  dual.set(dual.x * 0.5, dual.y * 0.5, dual.z * 0.5, dual.w * 0.5);
  return { real: rotation, dual };
};
const poseData = [];
for (const clip of clips) {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.reset(); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  for (const phase of phasesFor(clip)) {
    mixer.stopAllAction(); mixer.time = 0;
    const poseAction = mixer.clipAction(clip); poseAction.reset(); poseAction.setLoop(THREE.LoopOnce, 1); poseAction.clampWhenFinished = true; poseAction.play();
    mixer.setTime(clip.duration * phase);
    model.updateMatrixWorld(true);
    mesh.skeleton.update();
    const boneMatrices = mesh.skeleton.bones.map((_, boneIndex) => {
      const transform = matrixAt(boneIndex);
      // Match SkinnedMesh.applyBoneTransform(): jointMatrix = boneWorld * inverseBind.
      // Skinning is performed in bind space, then returned to mesh-local space.
      return transform;
    });
    const duals = boneMatrices.map(rigidTransform);
    const offsets = [];
    const p = new THREE.Vector3();
    const bindLinear = mesh.bindMatrix;
    for (let vertex = 0; vertex < position.count; vertex++) {
      let legSupport = 0, lowerLegSupport = 0, footSupport = 0;
      const influences = [];
      for (let slot = 0; slot < 4; slot++) {
        const bone = skinIndex.getComponent(vertex, slot), weight = skinWeight.getComponent(vertex, slot);
        if (weight <= 1e-8) continue;
        influences.push([bone, weight]);
        if (legIndices.has(bone)) legSupport += weight;
        if (lowerLegIndices.has(bone)) lowerLegSupport += weight;
        if (footIndices.has(bone)) footSupport += weight;
      }
      if (legSupport < 0.015) continue;
      if (correctiveRegion === 'lower-leg-cuff' && (lowerLegSupport < 0.2 || footSupport > 0.2)) continue;
      if (correctiveRegion === 'mixed-cuff' && (lowerLegSupport < 0.02 || footSupport >= 0.95)) continue;
      p.fromBufferAttribute(position, vertex).applyMatrix4(bindLinear);
      const elements = new Float64Array(16);
      for (const [bone, weight] of influences) {
        const e = boneMatrices[bone].elements;
        for (let i = 0; i < 16; i++) elements[i] += e[i] * weight;
      }
      const blended = new THREE.Matrix4().fromArray(elements);
      const lbs = p.clone().applyMatrix4(blended).applyMatrix4(mesh.bindMatrixInverse);

      let reference = null, rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0;
      for (const [bone, weight] of influences) {
        const { real, dual } = duals[bone];
        if (!reference) reference = real;
        const sign = reference.dot(real) < 0 ? -1 : 1;
        rx += real.x * weight * sign; ry += real.y * weight * sign; rz += real.z * weight * sign; rw += real.w * weight * sign;
        dx += dual.x * weight * sign; dy += dual.y * weight * sign; dz += dual.z * weight * sign; dw += dual.w * weight * sign;
      }
      const length = Math.hypot(rx, ry, rz, rw);
      if (length < 1e-8) continue;
      const real = new THREE.Quaternion(rx / length, ry / length, rz / length, rw / length);
      const dual = new THREE.Quaternion(dx / length, dy / length, dz / length, dw / length);
      const dot = real.dot(dual);
      dual.set(dual.x - real.x * dot, dual.y - real.y * dot, dual.z - real.z * dot, dual.w - real.w * dot);
      const dualTranslation = dual.clone().multiply(real.clone().conjugate());
      const dq = p.clone().applyQuaternion(real).add(new THREE.Vector3(2 * dualTranslation.x, 2 * dualTranslation.y, 2 * dualTranslation.z)).applyMatrix4(mesh.bindMatrixInverse);
      const outputDelta = dq.sub(lbs).multiplyScalar(correctiveStrength);
      if (outputDelta.lengthSq() < 1e-12) continue;
      // Morph deltas are in mesh-local coordinates. Convert through the same
      // bind-space LBS transform used by Three.js before solving the inverse.
      const localLinear = mesh.bindMatrixInverse.clone().multiply(blended).multiply(mesh.bindMatrix);
      const linear = new THREE.Matrix3().setFromMatrix4(localLinear);
      if (Math.abs(linear.determinant()) < 1e-8) continue;
      const sourceDelta = outputDelta.applyMatrix3(linear.invert());
      if (sourceDelta.lengthSq() > 1e-12) offsets.push(vertex, sourceDelta.x, sourceDelta.y, sourceDelta.z);
    }
    poseData.push({ clipName: clip.name, duration: clip.duration, phase, offsets });
  }
}
const grouped = Object.groupBy(poseData, (item) => item.clipName);
window.__dqCorrectiveCapture = { vertexCount: position.count, clips: Object.entries(grouped).map(([clipName, samples]) => ({ clipName, duration: samples[0].duration, samples })) };
window.__dqCorrectiveReady = true;
</script>`;

const modelBytes = readFileSync(input);
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); return; }
  if (pathname === '/model.glb') { response.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': modelBytes.length }); response.end(modelBytes); return; }
  if (pathname.startsWith('/vendor/')) {
    const file = resolve(VENDOR, pathname.slice('/vendor/'.length));
    if (!file.startsWith(VENDOR + sep)) { response.writeHead(403); response.end(); return; }
    try { const bytes = readFileSync(file); response.writeHead(200, { 'Content-Type': extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream' }); response.end(bytes); }
    catch { response.writeHead(404); response.end('Not found'); }
    return;
  }
  response.writeHead(404); response.end('Not found');
});
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
let capture, browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load', timeout: 30000 });
  try {
    await Promise.race([
      page.waitForFunction(() => window.__dqCorrectiveReady === true, null, { timeout: 180000 }),
      new Promise((_, reject) => page.once('pageerror', reject)),
      new Promise((_, reject) => page.on('console', (message) => { if (message.type() === 'error') reject(new Error(message.text())); })),
    ]);
  } catch (error) {
    throw new Error(`${error.message}; erros do renderer: ${errors.join('; ') || 'nenhum erro de console capturado'}`);
  }
  capture = await page.evaluate(() => window.__dqCorrectiveCapture);
  if (errors.length) throw new Error(`erro ao calcular DQ no renderer: ${errors.join('; ')}`);
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
if (capture.vertexCount !== primitive.getAttribute('POSITION').getCount() || capture.clips.length !== 2) throw new Error('captura do renderer não corresponde ao GLB');

const vertexCount = capture.vertexCount;
const samples = capture.clips.flatMap((clip) => clip.samples.map((sample) => ({ ...sample, clipName: clip.clipName, duration: clip.duration })));
const targetNames = samples.map((sample) => `${sample.clipName}_DQ_${Math.round(sample.phase * 100)}`);
const targetOffset = new Map(samples.map((sample, index) => [`${sample.clipName}:${sample.phase}`, index]));
const buffer = root.listBuffers()[0];
let maxOffset = 0, editedVertexUnion = new Set();
for (let index = 0; index < samples.length; index++) {
  const dense = new Float32Array(vertexCount * 3), offsets = samples[index].offsets;
  for (let offset = 0; offset < offsets.length; offset += 4) {
    const vertex = offsets[offset], x = offsets[offset + 1], y = offsets[offset + 2], z = offsets[offset + 3];
    dense[vertex * 3] = x; dense[vertex * 3 + 1] = y; dense[vertex * 3 + 2] = z;
    maxOffset = Math.max(maxOffset, Math.hypot(x, y, z)); editedVertexUnion.add(vertex);
  }
  const accessor = document.createAccessor(targetNames[index] + '_POSITION').setType('VEC3').setArray(dense).setBuffer(buffer);
  primitive.addTarget(document.createPrimitiveTarget().setAttribute('POSITION', accessor));
}
gltfMesh.setWeights(new Array(samples.length).fill(0));
gltfMesh.setExtras({ ...(gltfMesh.getExtras() ?? {}), targetNames });
skinnedNode.setWeights(new Array(samples.length).fill(0));
for (const clip of capture.clips) {
  const clipNode = root.listAnimations().find((animation) => animation.getName().toLowerCase() === clip.clipName.toLowerCase());
  if (!clipNode) throw new Error(`clip ausente ao criar canal DQ: ${clip.clipName}`);
  const phaseSamples = clip.samples;
  const inputs = new Float32Array(phaseSamples.map((sample) => sample.phase * clip.duration));
  const outputs = new Float32Array(phaseSamples.length * samples.length);
  for (let key = 0; key < phaseSamples.length; key++) {
    const index = targetOffset.get(`${clip.clipName}:${phaseSamples[key].phase}`);
    outputs[key * samples.length + index] = 1;
  }
  const inputAccessor = document.createAccessor(`${clip.clipName}_DQ_Times`).setType('SCALAR').setArray(inputs).setBuffer(buffer);
  const outputAccessor = document.createAccessor(`${clip.clipName}_DQ_Weights`).setType('SCALAR').setArray(outputs).setBuffer(buffer);
  const sampler = document.createAnimationSampler(`${clip.clipName} dual quaternion corrective`).setInput(inputAccessor).setOutput(outputAccessor).setInterpolation('LINEAR');
  clipNode.addSampler(sampler);
  clipNode.addChannel(document.createAnimationChannel(`${clip.clipName} dual quaternion corrective`).setTargetNode(skinnedNode).setTargetPath('weights').setSampler(sampler));
}

const staging = output.replace(/\.glb$/i, '.staging.glb');
if (staging === output) throw new Error('saída precisa terminar com .glb');
try { await access(staging); throw new Error(`arquivo temporário já existe: ${staging}`); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
try {
  await io.write(staging, document);
  const check = await io.read(staging), checkedRoot = check.getRoot(), checkedPrimitive = checkedRoot.listMeshes()[0].listPrimitives()[0];
  for (const [semantic, expected] of Object.entries(originalHashes)) if (hash(checkedPrimitive.getAttribute(semantic)?.getArray()) !== expected) throw new Error(`${semantic} mudou inesperadamente`);
  if (hash(checkedPrimitive.getIndices().getArray()) !== originalIndicesHash) throw new Error('índices/topologia mudaram');
  if (checkedPrimitive.listTargets().length !== samples.length) throw new Error('quantidade de morph targets divergente');
  await rename(staging, output);
} catch (error) { await rm(staging, { force: true }); throw error; }
console.log(JSON.stringify({
  input, output, sampledClips: capture.clips.map(({ clipName, duration, samples: clipSamples }) => ({ clipName, duration, phases: clipSamples.map((sample) => sample.phase) })),
  correctiveTargets: samples.length, affectedVerticesUnion: editedVertexUnion.size, maxSourceOffset: +maxOffset.toFixed(6), correctiveStrength, correctiveRegion: regionArgument,
  geometryWeightsTopologyRigBindAndOriginalJointClipsPreserved: true, outputBytes: (await stat(output)).size,
}, null, 2));
