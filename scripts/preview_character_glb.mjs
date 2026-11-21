// Renderiza um GLB arbitrário em Chromium para inspeção visual sem adicioná-lo
// a public/models nem alterar o personagem ativo.
// Uso: node scripts/preview_character_glb.mjs <candidato.glb> [saida.png]
// Camera arguments accept optional targetX/targetZ after the existing cameraY.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR = join(ROOT, 'node_modules', 'three');
const modelPath = process.argv[2];
const screenshotPath = resolve(process.argv[3] || '/tmp/character-preview.png');
const renderAnimation = process.argv[4] || 'Idle';
const renderPhase = Number(process.argv[5] ?? 0.25);
const renderYaw = Number(process.argv[6] ?? 34);
const onlyMotionBone = (process.env.PREVIEW_ONLY_TRACK || '').replaceAll(':', '').toLowerCase();
const freezeMotionBone = (process.env.PREVIEW_FREEZE_TRACK || '').replaceAll(':', '').toLowerCase();
const batchSpec = process.env.PREVIEW_BATCH ? JSON.parse(readFileSync(process.env.PREVIEW_BATCH, 'utf8')) : null;
const bakeConfig = process.env.PREVIEW_BAKE_CONTACT ? JSON.parse(readFileSync(process.env.PREVIEW_BAKE_CONTACT, 'utf8')) : null;
const gaitConfig = process.env.PREVIEW_BAKE_GAIT ? JSON.parse(readFileSync(process.env.PREVIEW_BAKE_GAIT, 'utf8')) : null;
const poseCorrectiveMaskPath = process.env.PREVIEW_POSE_CORRECTIVE_MASK || '';
const poseCorrectiveStrength = Number(process.env.PREVIEW_POSE_CORRECTIVE_STRENGTH ?? 0.5);
const poseCorrectiveFeatherRings = Number(process.env.PREVIEW_POSE_CORRECTIVE_FEATHER_RINGS ?? 0);
const poseCorrectiveMask = poseCorrectiveMaskPath ? JSON.parse(readFileSync(poseCorrectiveMaskPath, 'utf8')) : null;
const skipAnimationAudit = process.env.PREVIEW_SKIP_ANIMATION_AUDIT === '1';
const previewReadyTimeoutMs = Number(process.env.PREVIEW_READY_TIMEOUT_MS ?? 60000);
const materialMode = process.env.PREVIEW_MATERIAL || 'original';
if (!['original','solid','flat','normal','wire','no-normal-map'].includes(materialMode)) throw new Error('invalid PREVIEW_MATERIAL');
const drawSkeleton = process.env.PREVIEW_SKELETON === '1';
const drawGrid = process.env.PREVIEW_GRID !== '0';
if (batchSpec && drawSkeleton) throw new Error('skeleton overlay supports a single pose only');
if (onlyMotionBone && freezeMotionBone) throw new Error('use PREVIEW_ONLY_TRACK ou PREVIEW_FREEZE_TRACK, não ambos');
const poseOffsetSpec = process.argv[7] ? JSON.parse(process.argv[7]) : {};
const poseOffsets = poseOffsetSpec.bones ?? poseOffsetSpec;
const poseOffsetSpace = poseOffsetSpec.space ?? 'local';
const rayPixels = (process.env.PREVIEW_RAY_PIXELS || '').split(';').filter(Boolean).map((value) => {
  const [x, y] = value.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('PREVIEW_RAY_PIXELS deve ser x,y;x,y');
  return { x, y };
});
const debugVertexIds = (process.env.PREVIEW_DEBUG_VERTEX_IDS || '').split(',').filter(Boolean).map(Number);
if (debugVertexIds.some((value) => !Number.isInteger(value) || value < 0)) throw new Error('PREVIEW_DEBUG_VERTEX_IDS deve ser uma lista de índices não negativos');
const cameraDistance = Number(process.argv[8] ?? 4.35);
const cameraTargetY = Number(process.argv[9] ?? 0.88);
const cameraY = Number(process.argv[10] ?? 1.65);
const cameraTargetX = Number(process.argv[11] ?? 0);
const cameraTargetZ = Number(process.argv[12] ?? 0);
const AUDIT_PHASE_SAMPLES = 120;
if (!['local', 'parent'].includes(poseOffsetSpace)) throw new Error('offset space deve ser local ou parent');
if (!Number.isFinite(cameraDistance) || !(cameraDistance > 0) || !Number.isFinite(cameraTargetX) || !Number.isFinite(cameraTargetY) || !Number.isFinite(cameraTargetZ) || !Number.isFinite(cameraY)) throw new Error('parâmetros de câmera inválidos');
if (!modelPath || modelPath === '--help') {
  console.log('Uso: node scripts/preview_character_glb.mjs <candidato.glb> [saida.png] [Idle|Walk|Rest] [fracao=0.25] [yawGraus=34] [offsetsJson] [cameraDistancia=4.35] [cameraAlvoY=0.88] [cameraY=1.65] [cameraAlvoX=0] [cameraAlvoZ=0]');
  process.exit(modelPath ? 0 : 2);
}
if (!(renderPhase >= 0 && renderPhase <= 1)) throw new Error('fracao da animação deve ficar entre 0 e 1');
if (!Number.isFinite(renderYaw)) throw new Error('yaw da câmera deve ser numérico');
if (extname(modelPath).toLowerCase() !== '.glb') throw new Error('o candidato deve ser um arquivo .glb');
statSync(modelPath); // Falha cedo com uma mensagem de caminho útil.
const modelBytes = readFileSync(modelPath);
const modelSha256 = createHash('sha256').update(modelBytes).digest('hex');
if (!Number.isFinite(poseCorrectiveStrength) || poseCorrectiveStrength < 0 || poseCorrectiveStrength > 1) throw new Error('PREVIEW_POSE_CORRECTIVE_STRENGTH deve ficar entre 0 e 1');
if (!Number.isInteger(poseCorrectiveFeatherRings) || poseCorrectiveFeatherRings < 0 || poseCorrectiveFeatherRings > 5) throw new Error('PREVIEW_POSE_CORRECTIVE_FEATHER_RINGS deve ser inteiro entre 0 e 5');
if (poseCorrectiveMask) {
  if (poseCorrectiveMask.sourceSha256 !== modelSha256) throw new Error(`mask de pose pertence a outro GLB: ${poseCorrectiveMask.sourceSha256} != ${modelSha256}`);
  if (!Number.isInteger(poseCorrectiveMask.vertexCount) || !Array.isArray(poseCorrectiveMask.mask) || poseCorrectiveMask.mask.length !== poseCorrectiveMask.vertexCount) throw new Error('mask de pose inválido ou com vertexCount inconsistente');
  if (!Number.isInteger(poseCorrectiveMask.selection?.selectedVertices)) throw new Error('mask de pose sem contagem de seleção');
}

const html = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GLB candidate preview</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e9eef3}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/vendor/build/three.module.js"}}</script>
<script type="module">
import * as THREE from '/vendor/build/three.module.js';
import { GLTFLoader } from '/vendor/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '/vendor/examples/jsm/libs/meshopt_decoder.module.js';
import { solveLeg, rotateBoneToward } from '/walk-foot.js';
import { bakeWalkContact } from '/contact-bake.js';
import { bakeCharacterGait } from '/gait-bake.js';
const requestedAnimation = ${JSON.stringify(renderAnimation)};
const requestedPhase = ${renderPhase};
const requestedDebugVertexIds = ${JSON.stringify(debugVertexIds)};
const poseCorrectiveSpec = ${JSON.stringify(poseCorrectiveMask ? { ...poseCorrectiveMask, strength: poseCorrectiveStrength, featherRings: poseCorrectiveFeatherRings } : null)};
const skipAnimationAudit = ${skipAnimationAudit};
const onlyBone = ${JSON.stringify(onlyMotionBone)};
const frozenBone = ${JSON.stringify(freezeMotionBone)};
// Mirror the production loader: endpoint/finger tracks are frozen to avoid
// stretching tiny accessory vertices into ribbons during a walk.
const FREEZE_BONES = /(_End)$|^(mixamorig:?|mixamorig)?(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$/;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef3);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.01, 100);
const cameraYaw = THREE.MathUtils.degToRad(${renderYaw});
camera.position.set(Math.sin(cameraYaw) * ${cameraDistance}, ${cameraY}, Math.cos(cameraYaw) * ${cameraDistance});
camera.lookAt(${cameraTargetX}, ${cameraTargetY}, ${cameraTargetZ});
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x748092, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 3.0);
key.position.set(3, 5, 4);
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({color:0xd9e0e7, roughness:0.92}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.008;
scene.add(floor);
const grid = new THREE.GridHelper(8, 16, 0x8996a4, 0xbfc8d1);
grid.position.y = -0.006;
if (${drawGrid}) scene.add(grid);
try {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/model.glb');
  const model = gltf.scene;
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());
  if (size.z > size.y * 1.5) {
    model.rotation.x = -Math.PI / 2;
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    size = box.getSize(new THREE.Vector3());
  }
  const height = Math.max(size.y, 1e-4);
  const scale = 1.72 / height;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  scene.add(model);
  let meshes = 0, skinnedMeshes = 0, materials = 0;
  const skinnedMeshObjects = [];
  model.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) meshes++;
    if (o.isSkinnedMesh) { skinnedMeshes++; skinnedMeshObjects.push(o); }
    if (o.material) materials += Array.isArray(o.material) ? o.material.length : 1;
  });
  const authoredMaterials = new Map();
  model.traverse(o => { if (o.isMesh) authoredMaterials.set(o, o.material); });
  const poseCorrectiveBindings = [];
  const poseCorrectivePatchedMaterials = new WeakSet();
  let poseCorrectiveAudit = { enabled: false };
  if (poseCorrectiveSpec) {
    let matchingMeshes = 0;
    for (const mesh of skinnedMeshObjects) {
      if (poseCorrectiveSpec.meshName && mesh.name !== poseCorrectiveSpec.meshName) continue;
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.index;
      if (position.count !== poseCorrectiveSpec.vertexCount) throw new Error('pose corrective vertexCount incompatível em ' + mesh.name + ': ' + position.count);
      if (!index) throw new Error('pose corrective exige malha indexada: ' + mesh.name);
      const selected = poseCorrectiveSpec.mask.map(Boolean);
      const adjacency = Array.from({ length: position.count }, () => new Set());
      for (let offset = 0; offset < index.count; offset += 3) {
        const a = index.getX(offset), b = index.getX(offset + 1), c = index.getX(offset + 2);
        adjacency[a].add(b); adjacency[a].add(c);
        adjacency[b].add(a); adjacency[b].add(c);
        adjacency[c].add(a); adjacency[c].add(b);
      }
      const selectedVertices = [];
      const influence = new Float32Array(position.count);
      for (let vertex = 0; vertex < selected.length; vertex++) {
        if (!selected[vertex]) continue;
        selectedVertices.push(vertex);
        influence[vertex] = 1;
      }
      if (selectedVertices.length !== poseCorrectiveSpec.selection.selectedVertices) throw new Error('pose corrective seleção diverge: ' + selectedVertices.length);
      const featherRingCounts = [];
      let frontier = selectedVertices;
      for (let ring = 1; ring <= poseCorrectiveSpec.featherRings; ring++) {
        const next = new Set();
        for (const vertex of frontier) {
          for (const neighbor of adjacency[vertex]) if (influence[neighbor] === 0) next.add(neighbor);
        }
        const alpha = (poseCorrectiveSpec.featherRings + 1 - ring) / (poseCorrectiveSpec.featherRings + 1);
        for (const vertex of next) influence[vertex] = alpha;
        featherRingCounts.push(next.size);
        frontier = [...next];
      }
      const affectedVertices = [];
      const requiredVertices = new Set();
      const selectedNeighbors = new Map();
      for (let vertex = 0; vertex < influence.length; vertex++) {
        if (influence[vertex] <= 0) continue;
        affectedVertices.push(vertex);
        const neighbors = [...adjacency[vertex]];
        selectedNeighbors.set(vertex, neighbors);
        requiredVertices.add(vertex);
        for (const neighbor of neighbors) requiredVertices.add(neighbor);
      }
      const isolatedVertices = affectedVertices.filter((vertex) => selectedNeighbors.get(vertex).length === 0);
      const correction = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
      mesh.geometry.setAttribute('poseCorrective', correction);
      poseCorrectiveBindings.push({ mesh, position, selectedVertices, affectedVertices, selectedNeighbors, requiredVertices: [...requiredVertices], influence, featherRingCounts, isolatedVertices, correction });
      matchingMeshes++;
    }
    if (matchingMeshes !== 1) throw new Error('pose corrective esperava uma malha correspondente; encontrou ' + matchingMeshes);
  }
  const installPoseCorrectiveShader = (material) => {
    if (!poseCorrectiveSpec || poseCorrectivePatchedMaterials.has(material)) return;
    const originalCompile = material.onBeforeCompile.bind(material);
    const originalProgramKey = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      originalCompile(shader, renderer);
      if (!shader.vertexShader.includes('#include <common>') || !shader.vertexShader.includes('#include <skinning_vertex>')) throw new Error('shader não oferece os pontos de injeção da skinning pose corrective');
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>' + String.fromCharCode(10) + 'attribute vec3 poseCorrective;');
      shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>' + String.fromCharCode(10) + 'transformed += poseCorrective;');
    };
    material.customProgramCacheKey = () => originalProgramKey() + '|pose-corrective-preview-v1';
    material.needsUpdate = true;
    poseCorrectivePatchedMaterials.add(material);
  };
  const updatePoseCorrective = (animation, phase) => {
    if (!poseCorrectiveSpec) return;
    if (String(animation).toLowerCase() !== 'walk') {
      for (const { correction } of poseCorrectiveBindings) {
        correction.array.fill(0);
        correction.needsUpdate = true;
      }
      poseCorrectiveAudit = {
        enabled: true,
        applied: false,
        reason: 'corrective restricted to Walk; Rest/Idle preserved',
        sourceSha256: poseCorrectiveSpec.sourceSha256,
        animation,
        phase,
        selectedVertices: poseCorrectiveBindings.reduce((sum, binding) => sum + binding.selectedVertices.length, 0),
        affectedVertices: poseCorrectiveBindings.reduce((sum, binding) => sum + binding.affectedVertices.length, 0),
        meanCorrectionMm: 0,
        maxCorrectionMm: 0,
      };
      if (window.__previewData) window.__previewData.poseCorrectiveAudit = poseCorrectiveAudit;
      return;
    }
    let corrected = 0, totalCorrection = 0, maxCorrection = 0;
    const meshWorldLinear = new THREE.Matrix3();
    let isolatedVertices = 0;
    for (const { mesh, position, selectedVertices, affectedVertices, selectedNeighbors, requiredVertices, influence, featherRingCounts, isolatedVertices: isolated, referenceDisplacement, correction } of poseCorrectiveBindings) {
      isolatedVertices += isolated.length;
      const displacement = new Float64Array(position.count * 3);
      const posed = new THREE.Vector3();
      for (const vertex of requiredVertices) {
        mesh.getVertexPosition(vertex, posed);
        const offset = vertex * 3;
        displacement[offset] = posed.x - position.getX(vertex) - referenceDisplacement[offset];
        displacement[offset + 1] = posed.y - position.getY(vertex) - referenceDisplacement[offset + 1];
        displacement[offset + 2] = posed.z - position.getZ(vertex) - referenceDisplacement[offset + 2];
      }
      correction.array.fill(0);
      for (const vertex of affectedVertices) {
        const neighbors = selectedNeighbors.get(vertex);
        if (!neighbors.length) continue;
        const offset = vertex * 3;
        let avgX = 0, avgY = 0, avgZ = 0;
        for (const neighbor of neighbors) {
          const n = neighbor * 3;
          avgX += displacement[n]; avgY += displacement[n + 1]; avgZ += displacement[n + 2];
        }
        const count = neighbors.length;
        const alpha = poseCorrectiveSpec.strength * influence[vertex];
        const dx = alpha * (avgX / count - displacement[offset]);
        const dy = alpha * (avgY / count - displacement[offset + 1]);
        const dz = alpha * (avgZ / count - displacement[offset + 2]);
        correction.setXYZ(vertex, dx, dy, dz);
        const magnitude = new THREE.Vector3(dx, dy, dz).applyMatrix3(meshWorldLinear.setFromMatrix4(mesh.matrixWorld)).length();
        totalCorrection += magnitude;
        maxCorrection = Math.max(maxCorrection, magnitude);
        corrected++;
      }
      correction.needsUpdate = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) installPoseCorrectiveShader(material);
    }
    poseCorrectiveAudit = {
      enabled: true,
      applied: true,
      mode: 'post-skin displacement Laplacian smoothing with graph-ring feather',
      strength: poseCorrectiveSpec.strength,
      featherRings: poseCorrectiveSpec.featherRings,
      featherRingCounts: poseCorrectiveBindings.flatMap((binding) => binding.featherRingCounts),
      sourceSha256: poseCorrectiveSpec.sourceSha256,
      meshName: poseCorrectiveBindings[0]?.mesh.name,
      selectedVertices: poseCorrectiveBindings.reduce((sum, binding) => sum + binding.selectedVertices.length, 0),
      affectedVertices: poseCorrectiveBindings.reduce((sum, binding) => sum + binding.affectedVertices.length, 0),
      correctedVertices: corrected,
      isolatedVertices,
      meanCorrectionMm: corrected ? Number((totalCorrection / corrected * 1000).toFixed(4)) : 0,
      maxCorrectionMm: Number((maxCorrection * 1000).toFixed(4)),
      animation,
      phase,
    };
    if (window.__previewData) window.__previewData.poseCorrectiveAudit = poseCorrectiveAudit;
  };
  const setMaterialMode = (mode) => {
    if (!['original','solid','flat','normal','wire','no-normal-map'].includes(mode)) throw new Error('invalid material mode');
    for (const [mesh, original] of authoredMaterials) {
      const old = mesh.material;
      if (mode === 'original') mesh.material = original;
      else if (mode === 'no-normal-map') {
        mesh.material = Array.isArray(original) ? original.map(m => m.clone()) : original.clone();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { m.normalMap = null; m.bumpMap = null; m.needsUpdate = true; }
      } else mesh.material = mode === 'normal' ? new THREE.MeshNormalMaterial({side:THREE.DoubleSide}) : new THREE.MeshStandardMaterial({color:0xa8b4c7,roughness:.85,metalness:0,side:THREE.DoubleSide,flatShading:mode==='flat',wireframe:mode==='wire'});
      if (poseCorrectiveBindings.some((binding) => binding.mesh === mesh)) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) installPoseCorrectiveShader(material);
      }
      if (old !== original) for (const m of Array.isArray(old) ? old : [old]) m.dispose();
    }
  };
  setMaterialMode(${JSON.stringify(materialMode)});
  const restState = [];
  model.traverse((o) => { if (o.isBone) restState.push({ bone: o, position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone() }); });
  const morphState = [];
  model.traverse((o) => { if (o.morphTargetInfluences) morphState.push({ mesh: o, values: [...o.morphTargetInfluences] }); });
  if (poseCorrectiveSpec) {
    model.updateMatrixWorld(true);
    model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
    for (const binding of poseCorrectiveBindings) {
      binding.referenceDisplacement = new Float64Array(binding.position.count * 3);
      const posed = new THREE.Vector3();
      for (const vertex of binding.requiredVertices) {
        binding.mesh.getVertexPosition(vertex, posed);
        const offset = vertex * 3;
        binding.referenceDisplacement[offset] = posed.x - binding.position.getX(vertex);
        binding.referenceDisplacement[offset + 1] = posed.y - binding.position.getY(vertex);
        binding.referenceDisplacement[offset + 2] = posed.z - binding.position.getZ(vertex);
      }
    }
  }
  const clips = gltf.animations;
  let sanitizedTracks = 0;
  for (const clip of clips) {
    const before = clip.tracks.length;
  clip.tracks = clip.tracks.filter((track) => {
    const boneName = track.name.split('.')[0];
    if (FREEZE_BONES.test(boneName)) return false;
    const normalizedName = boneName.replaceAll(':', '').toLowerCase();
    if (onlyBone && normalizedName !== onlyBone) return false;
    if (frozenBone && normalizedName === frozenBone) return false;
    return true;
  });
    sanitizedTracks += before - clip.tracks.length;
  }
  const byName = new Map(clips.map((clip) => [clip.name.toLowerCase(), clip]));
  let animationAudit = skipAnimationAudit
    ? { status: 'skipped', reason: 'PREVIEW_SKIP_ANIMATION_AUDIT=1; usar somente para captura visual' }
    : { status: 'not-run', reason: 'Walk/Idle não encontrados' };
  let renderPose = { name: requestedAnimation, phase: requestedPhase, cameraYawDegrees: ${renderYaw} };
  const walk = byName.get('walk');
  const idle = byName.get('idle');
  const walkAdvancePerCycle = Number(gltf.asset?.extras?.walkAdvance) > 0 ? Number(gltf.asset.extras.walkAdvance) : null;
  const soleVertices = { left: [], right: [] };
  const normalizedBoneName = (name) => name.replaceAll(':', '').toLowerCase();
  for (const mesh of skinnedMeshObjects) {
    const skinIndices = mesh.geometry.getAttribute('skinIndex');
    const skinWeights = mesh.geometry.getAttribute('skinWeight');
    if (!skinIndices || !skinWeights || !mesh.skeleton) continue;
    const footJoints = { left: new Set(), right: new Set() };
    mesh.skeleton.bones.forEach((bone, index) => {
      const name = normalizedBoneName(bone.name);
      if (name === 'mixamorigleftfoot' || name === 'mixamoriglefttoebase') footJoints.left.add(index);
      if (name === 'mixamorigrightfoot' || name === 'mixamorigrighttoebase') footJoints.right.add(index);
    });
    for (let index = 0; index < mesh.geometry.getAttribute('position').count; index++) {
      let left = 0, right = 0;
      for (let slot = 0; slot < 4; slot++) {
        const joint = skinIndices.getComponent(index, slot);
        const weight = skinWeights.getComponent(index, slot);
        if (footJoints.left.has(joint)) left += weight;
        if (footJoints.right.has(joint)) right += weight;
      }
      if (left >= 0.15) soleVertices.left.push({ mesh, index });
      if (right >= 0.15) soleVertices.right.push({ mesh, index });
    }
  }
  const contactVertices = {};
  model.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const p = new THREE.Vector3();
    const ranked = soleVertices[side].map(v => { v.mesh.getVertexPosition(v.index, p); p.applyMatrix4(v.mesh.matrixWorld); return {...v, y:p.y}; }).sort((a,b)=>a.y-b.y);
    if (!ranked.length) { contactVertices[side] = []; continue; }
    const pool = ranked.filter(v => v.y <= ranked[0].y+.004);
    const count = Math.min(64, pool.length);
    contactVertices[side] = Array.from({length:count}, (_,i)=>pool[Math.floor(i*pool.length/count)]);
  }
  if (walk && idle && !skipAnimationAudit) {
    let hips = null, head = null;
    model.traverse((o) => {
      if (!hips && o.isSkinnedMesh && o.skeleton) {
        hips = o.skeleton.bones.find((bone) => /hips$/i.test(bone.name)) || null;
        head = o.skeleton.bones.find((bone) => /head$/i.test(bone.name)) || null;
      }
    });
    if (!hips) {
      animationAudit = { status: 'fail', reason: 'clips Walk/Idle existem, mas não há bone Hips' };
    } else {
      const mixer = new THREE.AnimationMixer(model);
      const sampleClip = (clip) => {
        mixer.stopAllAction();
        mixer.time = 0;
        const action = mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        const samples = [];
        const surfaceSamples = [];
        const soleSamples = [];
        const headSamples = [];
        let headReference = null;
        const vertex = new THREE.Vector3();
        const worldHead = new THREE.Vector3();
        const hipsQuaternion = new THREE.Quaternion();
        const headQuaternion = new THREE.Quaternion();
        const duration = clip.duration;
        for (let i = 0; i <= ${AUDIT_PHASE_SAMPLES}; i++) {
          mixer.setTime(duration * i / ${AUDIT_PHASE_SAMPLES});
          model.updateMatrixWorld(true);
          const p = hips.getWorldPosition(new THREE.Vector3());
          samples.push([p.x, p.y, p.z]);
          if (clip === walk) {
            let minY = Infinity, minPoint = null, minMesh = null, verticesSampled = 0;
            const feet = { left: { minY: Infinity, point: null }, right: { minY: Infinity, point: null } };
            for (const mesh of skinnedMeshObjects) {
              const position = mesh.geometry.getAttribute('position');
              const stride = Math.max(1, Math.ceil(position.count / 300000));
              for (let index = 0; index < position.count; index += stride) {
                mesh.getVertexPosition(index, vertex);
                vertex.applyMatrix4(mesh.matrixWorld);
                if (vertex.y < minY) {
                  minY = vertex.y;
                  minPoint = vertex.toArray();
                  minMesh = mesh.name;
                }
                verticesSampled++;
              }
            }
            surfaceSamples.push({ phase: i / ${AUDIT_PHASE_SAMPLES}, minY, minPoint, minMesh, verticesSampled });
            for (const side of ['left', 'right']) {
              for (const { mesh, index } of soleVertices[side]) {
                mesh.getVertexPosition(index, vertex);
                vertex.applyMatrix4(mesh.matrixWorld);
                if (vertex.y < feet[side].minY) {
                  feet[side].minY = vertex.y;
                  feet[side].point = vertex.toArray();
                }
              }
            }
            for (const side of ['left', 'right']) {
              const center = new THREE.Vector3();
              for (const {mesh,index} of contactVertices[side]) { mesh.getVertexPosition(index,vertex); vertex.applyMatrix4(mesh.matrixWorld); center.add(vertex); }
              feet[side].contactPoint = center.multiplyScalar(1/contactVertices[side].length).toArray();
            }
            soleSamples.push({ phase: i / ${AUDIT_PHASE_SAMPLES}, left: feet.left, right: feet.right });
          }
          if (head) {
            head.getWorldPosition(worldHead);
            head.getWorldQuaternion(headQuaternion);
            hips.getWorldQuaternion(hipsQuaternion);
            const relative = hipsQuaternion.clone().invert().multiply(headQuaternion).normalize();
            if (!headReference) headReference = relative.clone();
            const dot = Math.min(1, Math.abs(headReference.dot(relative)));
            headSamples.push({ position: worldHead.toArray(), relativeAngleRadians: 2 * Math.acos(dot) });
          }
        }
        const first = samples[0];
        const motion = Math.max(...samples.map((p) => Math.hypot(p[0] - first[0], p[1] - first[1], p[2] - first[2])));
        const horizontalMotion = Math.max(...samples.map(p => Math.hypot(p[0]-first[0], p[2]-first[2])));
        const verticalRange = Math.max(...samples.map(p => p[1]))-Math.min(...samples.map(p => p[1]));
        const worldAxisRanges = Object.fromEntries(['x', 'y', 'z'].map((axis, index) => {
          const values = samples.map((p) => p[index]);
          return [axis, Number((Math.max(...values) - Math.min(...values)).toFixed(6))];
        }));
        const mean = samples[0].map((_, axis) => samples.reduce((sum, p) => sum + p[axis], 0) / samples.length);
        const headAudit = headSamples.length ? {
          worldPositionMin: [0, 1, 2].map((axis) => Math.min(...headSamples.map((s) => s.position[axis]))),
          worldPositionMax: [0, 1, 2].map((axis) => Math.max(...headSamples.map((s) => s.position[axis]))),
          maxRelativeRotationFromStartDegrees: THREE.MathUtils.radToDeg(Math.max(...headSamples.map((s) => s.relativeAngleRadians))),
        } : null;
        const surfaceAudit = surfaceSamples.length ? {
          samples: surfaceSamples.length,
          verticesPerSample: surfaceSamples[0].verticesSampled,
          floorY: -0.008,
          minimumY: Math.min(...surfaceSamples.map((s) => s.minY)),
          deepestPenetrationMeters: Math.max(0, -0.008 - Math.min(...surfaceSamples.map((s) => s.minY))),
          lowestSample: surfaceSamples.reduce((lowest, sample) => sample.minY < lowest.minY ? sample : lowest),
        } : null;
        const contactRanges = (side, thresholdMeters) => {
          const ranges = [];
          let startPhase = null, lastPhase = null;
          for (const sample of soleSamples) {
            const inContactBand = Number.isFinite(sample[side].minY) && sample[side].minY <= thresholdMeters;
            if (inContactBand) {
              if (startPhase === null) startPhase = sample.phase;
              lastPhase = sample.phase;
            } else if (startPhase !== null) {
              ranges.push([Number(startPhase.toFixed(3)), Number(lastPhase.toFixed(3))]);
              startPhase = null;
            }
          }
          if (startPhase !== null) ranges.push([Number(startPhase.toFixed(3)), Number(lastPhase.toFixed(3))]);
          return ranges;
        };
        const pathDriftRanges = (side, thresholdMeters) => {
          if (!walkAdvancePerCycle) return null;
          const runs = [];
          let run = [];
          for (const sample of soleSamples) {
            const point = sample[side].contactPoint;
            if (point && sample[side].minY <= thresholdMeters) run.push(sample);
            else if (run.length) { runs.push(run); run = []; }
          }
          if (run.length) runs.push(run);
          return runs.map((items) => {
            const alongPath = items.map(({ phase, [side]: foot }) => foot.contactPoint[2] + phase * walkAdvancePerCycle);
            return {
              phases: [Number(items[0].phase.toFixed(3)), Number(items.at(-1).phase.toFixed(3))],
              forwardDriftMeters: Number((Math.max(...alongPath) - Math.min(...alongPath)).toFixed(4)),
            };
          });
        };
        const soleContactAudit = Object.fromEntries(['left', 'right'].map((side) => {
          const values = soleSamples.map((sample) => sample[side].minY).filter(Number.isFinite);
          const nearFloorBands = Object.fromEntries([0.01, 0.015, 0.02, 0.03, 0.05].map((threshold) => [
            String(Math.round(threshold * 1000)) + 'mm', {
              contactPhasePercent: values.length ? Number((100 * values.filter((y) => y <= threshold).length / values.length).toFixed(1)) : 0,
              phaseRanges: contactRanges(side, threshold),
            },
          ]));
          return [side, {
            classifiedVertices: soleVertices[side].length,
            minY: values.length ? Math.min(...values) : null,
            maxY: values.length ? Math.max(...values) : null,
            deepestFloorPenetrationMeters: values.length ? Math.max(0, -Math.min(...values)) : null,
            predictedForwardDriftAtWalkAdvance: pathDriftRanges(side, 0.025),
            minYAtKeyPhases: Object.fromEntries([0, 0.25, 0.5, 0.75, 1].map((phase) => [
              String(phase), soleSamples[Math.round(phase * ${AUDIT_PHASE_SAMPLES})]?.[side].minY ?? null,
            ])),
            nearFloorBands,
            contactPhasePercent: values.length ? Number((100 * values.filter((y) => y <= 0.015).length / values.length).toFixed(1)) : 0,
          }];
        }));
        return { duration, start: first, mean, worldAxisRangesMeters: worldAxisRanges, horizontalMotionMeters: horizontalMotion, verticalRangeMeters: verticalRange, maxMotionMeters: motion, headAudit, surfaceAudit, soleContactAudit, soleSamples: ${process.env.PREVIEW_SOLE_SAMPLES === '1'} ? soleSamples : undefined };
      };
      const walkSamples = sampleClip(walk);
      const idleSamples = sampleClip(idle);
      const startOffset = Math.hypot(...walkSamples.start.map((v, axis) => v - idleSamples.start[axis]));
      const meanOffset = Math.hypot(...walkSamples.mean.map((v, axis) => v - idleSamples.mean[axis]));
      const failures = [];
      if (walkSamples.horizontalMotionMeters > 0.05) failures.push('Hips Walk deslocamento horizontal > 0,05 m');
      if (walkSamples.verticalRangeMeters > 0.15) failures.push('Hips Walk oscilação vertical > 0,15 m');
      if (idleSamples.maxMotionMeters > 0.05) failures.push('Hips Idle move ' + idleSamples.maxMotionMeters.toFixed(3) + ' m (limite 0,05 m)');
      if (startOffset > 0.05) failures.push('offset inicial Walk↔Idle do Hips ' + startOffset.toFixed(3) + ' m (limite 0,05 m)');
      animationAudit = {
        status: failures.length ? 'fail' : 'pass',
        samplesPerClip: ${AUDIT_PHASE_SAMPLES + 1},
        hipsMotionMeters: {
          walk: Number(walkSamples.maxMotionMeters.toFixed(4)),
          idle: Number(idleSamples.maxMotionMeters.toFixed(4)),
        },
        walkHipsHorizontalMotionMeters: walkSamples.horizontalMotionMeters,
        walkHipsWorldAxisRangesMeters: walkSamples.worldAxisRangesMeters,
        walkHipsVerticalRangeMeters: walkSamples.verticalRangeMeters,
        walkIdleStartOffsetMeters: Number(startOffset.toFixed(4)),
        walkIdleMeanOffsetMeters: Number(meanOffset.toFixed(4)),
        walkSoleSamples: walkSamples.soleSamples,
        walkSurfaceAudit: walkSamples.surfaceAudit,
        walkSoleContactAudit: walkSamples.soleContactAudit,
        driftPointDefinition: 'centroid of fixed rest-sole vertices within 4 mm of the minimum; max 64',
        walkAdvancePerCycleMeters: walkAdvancePerCycle,
        walkHeadAudit: walkSamples.headAudit,
        idleHeadAudit: idleSamples.headAudit,
        failures,
      };
      // Leave the isolated preview in the approved resting pose, not the last audit sample.
      mixer.stopAllAction();
      mixer.time = 0;
      const idleAction = mixer.clipAction(idle);
      idleAction.reset();
      idleAction.play();
      mixer.setTime(0);
      const poseClip = byName.get(requestedAnimation.toLowerCase());
      if (!poseClip && !/^(rest|bind|none)$/i.test(requestedAnimation)) throw new Error('clip solicitado ausente: ' + requestedAnimation);
      mixer.stopAllAction();
      mixer.time = 0;
      if (poseClip) {
        mixer.clipAction(poseClip).reset().play();
        mixer.setTime(poseClip.duration * requestedPhase);
        renderPose = { name: poseClip.name, phase: requestedPhase, cameraYawDegrees: ${renderYaw}, time: Number((poseClip.duration * requestedPhase).toFixed(4)) };
      } else {
        renderPose = { name: 'Rest', phase: 0, cameraYawDegrees: ${renderYaw} };
      }
      const offsetApplied = [];
      for (const [boneName, degrees] of Object.entries(${JSON.stringify(poseOffsets)})) {
        const bone = model.getObjectByName(boneName) || model.getObjectByName(boneName.replaceAll(':', ''));
        if (!bone?.isBone) throw new Error('osso do offset não encontrado: ' + boneName);
        if (!Array.isArray(degrees) || degrees.length !== 3 || degrees.some((value) => !Number.isFinite(value))) {
          throw new Error('offset deve ser [x,y,z] em graus: ' + boneName);
        }
        const radians = degrees.map((value) => THREE.MathUtils.degToRad(value));
        const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(...radians, 'XYZ'));
        if (${JSON.stringify(poseOffsetSpace)} === 'parent') bone.quaternion.premultiply(offset);
        else bone.quaternion.multiply(offset);
        offsetApplied.push({ bone: boneName, degrees });
      }
      renderPose.offsetApplied = offsetApplied;
      renderPose.offsetSpace = ${JSON.stringify(poseOffsetSpace)};
      model.updateMatrixWorld(true);
      model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
      updatePoseCorrective(requestedAnimation, requestedPhase);
    }
  } else if (walk && idle && skipAnimationAudit) {
    const previewMixer = new THREE.AnimationMixer(model);
    const poseClip = byName.get(requestedAnimation.toLowerCase());
    if (!poseClip && !/^(rest|bind|none)$/i.test(requestedAnimation)) throw new Error('clip solicitado ausente: ' + requestedAnimation);
    if (poseClip) {
      previewMixer.clipAction(poseClip).reset().play();
      previewMixer.setTime(poseClip.duration * requestedPhase);
      renderPose = { name: poseClip.name, phase: requestedPhase, cameraYawDegrees: ${renderYaw}, time: Number((poseClip.duration * requestedPhase).toFixed(4)) };
    } else renderPose = { name: 'Rest', phase: 0, cameraYawDegrees: ${renderYaw} };
    for (const [boneName, degrees] of Object.entries(${JSON.stringify(poseOffsets)})) {
      const bone = model.getObjectByName(boneName) || model.getObjectByName(boneName.replaceAll(':', ''));
      if (!bone?.isBone) throw new Error('osso do offset não encontrado: ' + boneName);
      if (!Array.isArray(degrees) || degrees.length !== 3 || degrees.some((value) => !Number.isFinite(value))) throw new Error('offset deve ser [x,y,z] em graus: ' + boneName);
      const radians = degrees.map((value) => THREE.MathUtils.degToRad(value));
      const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(...radians, 'XYZ'));
      if (${JSON.stringify(poseOffsetSpace)} === 'parent') bone.quaternion.premultiply(offset);
      else bone.quaternion.multiply(offset);
    }
    model.updateMatrixWorld(true);
    model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
    updatePoseCorrective(requestedAnimation, requestedPhase);
  }
  const reviewMixer = new THREE.AnimationMixer(model);
  window.__setReviewPose = ({ animation = 'Rest', phase = 0, yaw = 0, distance = 4.35, targetX = 0, targetY = .88, targetZ = 0, cameraY = 1.65, offsets = {}, material = 'original', render = true }) => {
    setMaterialMode(material);
    reviewMixer.stopAllAction();
    reviewMixer.time = 0;
    for (const state of restState) { state.bone.position.copy(state.position); state.bone.quaternion.copy(state.quaternion); state.bone.scale.copy(state.scale); }
    for (const state of morphState) state.values.forEach((v, i) => state.mesh.morphTargetInfluences[i] = v);
    if (!/^(rest|bind|none)$/i.test(animation)) {
      const clip = byName.get(animation.toLowerCase());
      if (!clip) throw new Error('missing animation: ' + animation);
      const action = reviewMixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      reviewMixer.setTime(clip.duration * phase);
    }
    for (const [name, degrees] of Object.entries(offsets)) {
      const bone = model.getObjectByName(name) || model.getObjectByName(name.replaceAll(':', ''));
      if (!bone?.isBone) throw new Error('missing offset bone: ' + name);
      if (degrees.length !== 3 || degrees.some(v => !Number.isFinite(v))) throw new Error('invalid offset');
      bone.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...degrees.map(THREE.MathUtils.degToRad), 'XYZ')));
    }
    const angle = THREE.MathUtils.degToRad(yaw);
    camera.position.set(Math.sin(angle)*distance, cameraY, Math.cos(angle)*distance);
    camera.lookAt(targetX, targetY, targetZ);
    model.updateMatrixWorld(true);
    model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
    updatePoseCorrective(animation, phase);
    if (render) renderer.render(scene, camera);
  };
  const setAuditPose = pose => window.__setReviewPose({ ...pose, render: false });
  window.__renderReview = () => renderer.render(scene, camera);
  window.__bakeWalkContact = config => bakeWalkContact({ THREE, model, byName, soleVertices, setPose: setAuditPose, solveLeg }, config);
  window.__bakeCharacterGait = config => bakeCharacterGait({ THREE, model, byName, soleVertices, setPose: setAuditPose, solveLeg, rotateBoneToward }, config);
  const surfaceRays = [];
  const debugVertices = [];
  for (const mesh of skinnedMeshObjects) {
    const skinIndices = mesh.geometry.getAttribute('skinIndex');
    const skinWeights = mesh.geometry.getAttribute('skinWeight');
    for (const vertex of requestedDebugVertexIds) {
      if (vertex >= mesh.geometry.getAttribute('position').count) throw new Error('debug vertex fora da malha: ' + vertex);
      const local = mesh.getVertexPosition(vertex, new THREE.Vector3());
      const world = local.clone().applyMatrix4(mesh.matrixWorld);
      const influences = [];
      for (let slot = 0; slot < 4; slot++) {
        const weight = skinWeights.getComponent(vertex, slot);
        if (weight > 0.001) influences.push({
          bone: mesh.skeleton.bones[skinIndices.getComponent(vertex, slot)].name,
          weight: Number(weight.toFixed(5)),
        });
      }
      debugVertices.push({ vertex, localPosition: local.toArray(), worldPosition: world.toArray(), influences });
    }
  }
  if (${JSON.stringify(rayPixels)}.length) {
    const raycaster = new THREE.Raycaster();
    camera.updateMatrixWorld(true);
    for (const pixel of ${JSON.stringify(rayPixels)}) {
      raycaster.setFromCamera(new THREE.Vector2(pixel.x / innerWidth * 2 - 1, 1 - pixel.y / innerHeight * 2), camera);
      const hit = raycaster.intersectObject(model, true).find((item) => item.object.isSkinnedMesh && item.faceIndex !== undefined);
      if (!hit) { surfaceRays.push({ pixel, hit: null }); continue; }
      const mesh = hit.object, geometry = mesh.geometry, indices = geometry.index;
      const vertexIds = indices ? [indices.getX(hit.faceIndex * 3), indices.getX(hit.faceIndex * 3 + 1), indices.getX(hit.faceIndex * 3 + 2)] : [hit.face.a, hit.face.b, hit.face.c];
      const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
      surfaceRays.push({ pixel, faceIndex: hit.faceIndex, point: hit.point.toArray(), vertices: vertexIds.map((vertex) => {
        const local = new THREE.Vector3(); mesh.getVertexPosition(vertex, local); local.applyMatrix4(mesh.matrixWorld);
        const influences = [];
        for (let slot = 0; slot < 4; slot++) {
          const weight = skinWeight.getComponent(vertex, slot);
          if (weight > 0.001) influences.push({ bone: mesh.skeleton.bones[skinIndex.getComponent(vertex, slot)].name, weight: Number(weight.toFixed(4)) });
        }
        return { vertex, localPosition: [geometry.attributes.position.getX(vertex), geometry.attributes.position.getY(vertex), geometry.attributes.position.getZ(vertex)], worldPosition: local.toArray(), influences: influences.sort((a,b) => b.weight-a.weight) };
      }) });
    }
  }
  const auditBoneNames = new Set([
    'mixamorigHips', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2',
    'mixamorigNeck', 'mixamorigHead',
    'mixamorigLeftShoulder', 'mixamorigLeftArm', 'mixamorigLeftForeArm', 'mixamorigLeftHand',
    'mixamorigRightShoulder', 'mixamorigRightArm', 'mixamorigRightForeArm', 'mixamorigRightHand',
    'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot', 'mixamorigLeftToeBase',
    'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot', 'mixamorigRightToeBase',
  ]);
  const boneAudit = {};
  model.traverse((o) => {
    const key = o.name.replaceAll(':', '');
    if (!o.isBone || !auditBoneNames.has(key)) return;
    const world = o.getWorldPosition(new THREE.Vector3());
    const nextBone = o.children.find((child) => child.isBone);
    const childWorld = nextBone?.getWorldPosition(new THREE.Vector3()) ?? null;
    boneAudit[o.name] = {
      localPosition: o.position.toArray().map((v) => Number(v.toFixed(6))),
      worldPosition: world.toArray().map((v) => Number(v.toFixed(6))),
      childBone: nextBone?.name ?? null,
      childDistance: childWorld ? Number(world.distanceTo(childWorld).toFixed(6)) : null,
    };
  });
  if (${drawSkeleton}) {
    const points = [];
    const markerGeometry = new THREE.SphereGeometry(0.009, 8, 6);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00bfff, depthTest: false });
    model.traverse((bone) => {
      if (!bone.isBone || !auditBoneNames.has(bone.name.replaceAll(':', ''))) return;
      const point = bone.getWorldPosition(new THREE.Vector3());
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(point);
      marker.renderOrder = 10;
      scene.add(marker);
      for (const child of bone.children) {
        if (child.isBone && auditBoneNames.has(child.name.replaceAll(':', ''))) points.push(point, child.getWorldPosition(new THREE.Vector3()));
      }
    });
    const helper = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x0055ff, depthTest: false }));
    helper.renderOrder = 10;
    scene.add(helper);
  }
  window.__previewData = {
    height,
    runtimeScale: scale,
    meshes,
    skinnedMeshes,
    materials,
    sanitizedTracks,
    isolatedAnimationBone: onlyBone || null,
    frozenAnimationBone: frozenBone || null,
    retainedTracksPerClip: Object.fromEntries(clips.map((clip) => [clip.name, clip.tracks.length])),
    clips: clips.map((a) => a.name),
    surfaceRays,
    debugVertices,
    animationAudit,
    renderPose,
    boneAudit,
    poseCorrectiveAudit,
    animationAuditSkipped: skipAnimationAudit,
    gridEnabled: ${drawGrid},
  };
  window.__previewReady = true;
} catch (error) {
  window.__previewError = String(error?.stack || error);
  window.__previewReady = true;
}
// Poses are static; each review pose renders explicitly. Audit loops only
// update skeletons so hundreds of measurements do not queue GPU frames.
renderer.render(scene, camera);
</script>`;

const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (pathname === '/contact-bake.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(readFileSync(join(ROOT, 'scripts/character_contact_bake.mjs'))); return; }
  if (pathname === '/gait-bake.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(readFileSync(join(ROOT, 'scripts/character_gait_bake.mjs'))); return; }
  if (pathname === '/walk-foot.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(readFileSync(join(ROOT, 'src/scene/walkFootGrounding.js'))); return; }
  if (pathname === '/model.glb') {
    res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': modelBytes.length });
    res.end(modelBytes);
    return;
  }
  if (pathname.startsWith('/vendor/')) {
    const file = resolve(VENDOR, pathname.slice('/vendor/'.length));
    if (!file.startsWith(VENDOR + sep)) { res.writeHead(403); res.end(); return; }
    try {
      const data = readFileSync(file);
      res.writeHead(200, { 'Content-Type': extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

await new Promise((ok, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', ok);
});
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: batchSpec ? 720 : 1000, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (request) => errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'request failed'}`));
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__previewReady === true, null, { timeout: previewReadyTimeoutMs });
  } catch (error) {
    const pageState = await page.evaluate(() => ({ ready: window.__previewReady, error: window.__previewError, title: document.title })).catch((probeError) => ({ probeError: probeError.message }));
    console.error(JSON.stringify({ readyTimeoutMs: previewReadyTimeoutMs, pageState, browserErrors: errors }, null, 2));
    throw error;
  }
  await page.waitForTimeout(500);
  if (bakeConfig) { const baked = await page.evaluate(config => window.__bakeWalkContact(config), bakeConfig); writeFileSync(screenshotPath + '.contact.json', JSON.stringify(baked)); }
  if (gaitConfig) { const baked = await page.evaluate(config => window.__bakeCharacterGait(config), gaitConfig); writeFileSync(screenshotPath + '.gait.json', JSON.stringify(baked)); }
  await page.evaluate(() => window.__renderReview?.());
  await page.screenshot({ path: screenshotPath, timeout: 60000 });
  if (batchSpec) {
    if (!Array.isArray(batchSpec) || !batchSpec.length) throw new Error('PREVIEW_BATCH must contain nonempty array');
    for (const sample of batchSpec) {
      if (!sample.output || !Number.isFinite(sample.phase) || sample.phase < 0 || sample.phase > 1) throw new Error('invalid batch sample');
      const sampleAudit = await page.evaluate((sample) => {
        window.__setReviewPose(sample);
        return window.__previewData?.poseCorrectiveAudit ?? null;
      }, sample);
      await page.screenshot({ path: sample.output, timeout: 60000 });
      if (sampleAudit?.enabled) writeFileSync(sample.output + '.pose-corrective.json', JSON.stringify(sampleAudit, null, 2));
    }
    writeFileSync(screenshotPath + '.samples.json', JSON.stringify(batchSpec, null, 2));
  }
  const data = await page.evaluate(() => ({ ...window.__previewData, error: window.__previewError }));
  if (data.poseCorrectiveAudit?.enabled) writeFileSync(screenshotPath + '.pose-corrective.json', JSON.stringify({ model: resolve(modelPath), modelSha256, screenshot: screenshotPath, ...data.poseCorrectiveAudit }, null, 2));
  console.log(JSON.stringify({ model: resolve(modelPath), screenshot: screenshotPath, ...data, browserErrors: errors }, null, 2));
  if (data.error || errors.length || data.animationAudit?.status === 'fail') process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((ok) => server.close(ok));
}
