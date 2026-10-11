// Renderiza um GLB arbitrário em Chromium para inspeção visual sem adicioná-lo
// a public/models nem alterar o personagem ativo.
// Uso: node scripts/preview_character_glb.mjs <candidato.glb> [saida.png]
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
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
const poseOffsetSpec = process.argv[7] ? JSON.parse(process.argv[7]) : {};
const poseOffsets = poseOffsetSpec.bones ?? poseOffsetSpec;
const poseOffsetSpace = poseOffsetSpec.space ?? 'local';
const AUDIT_PHASE_SAMPLES = 120;
if (!['local', 'parent'].includes(poseOffsetSpace)) throw new Error('offset space deve ser local ou parent');
if (!modelPath || modelPath === '--help') {
  console.log('Uso: node scripts/preview_character_glb.mjs <candidato.glb> [saida.png] [Idle|Walk|Rest] [fracao=0.25] [yawGraus=34] [offsetsJson]');
  process.exit(modelPath ? 0 : 2);
}
if (!(renderPhase >= 0 && renderPhase <= 1)) throw new Error('fracao da animação deve ficar entre 0 e 1');
if (!Number.isFinite(renderYaw)) throw new Error('yaw da câmera deve ser numérico');
if (extname(modelPath).toLowerCase() !== '.glb') throw new Error('o candidato deve ser um arquivo .glb');
statSync(modelPath); // Falha cedo com uma mensagem de caminho útil.

const html = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GLB candidate preview</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e9eef3}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/vendor/build/three.module.js"}}</script>
<script type="module">
import * as THREE from '/vendor/build/three.module.js';
import { GLTFLoader } from '/vendor/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '/vendor/examples/jsm/libs/meshopt_decoder.module.js';
const requestedAnimation = ${JSON.stringify(renderAnimation)};
const requestedPhase = ${renderPhase};
// Mirror the production loader: endpoint/finger tracks are frozen to avoid
// stretching tiny accessory vertices into ribbons during a walk.
const FREEZE_BONES = /(_End)$|^(mixamorig:?|mixamorig)?(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$/;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eef3);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.01, 100);
const cameraYaw = THREE.MathUtils.degToRad(${renderYaw});
camera.position.set(Math.sin(cameraYaw) * 4.35, 1.65, Math.cos(cameraYaw) * 4.35);
camera.lookAt(0, 0.88, 0);
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
scene.add(grid);
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
  const clips = gltf.animations;
  let sanitizedTracks = 0;
  for (const clip of clips) {
    const before = clip.tracks.length;
    clip.tracks = clip.tracks.filter((track) => !FREEZE_BONES.test(track.name.split('.')[0]));
    sanitizedTracks += before - clip.tracks.length;
  }
  const byName = new Map(clips.map((clip) => [clip.name.toLowerCase(), clip]));
  let animationAudit = { status: 'not-run', reason: 'Walk/Idle não encontrados' };
  let renderPose = { name: requestedAnimation, phase: requestedPhase, cameraYawDegrees: ${renderYaw} };
  const walk = byName.get('walk');
  const idle = byName.get('idle');
  if (walk && idle) {
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
        return { duration, start: first, mean, maxMotionMeters: motion, headAudit, surfaceAudit };
      };
      const walkSamples = sampleClip(walk);
      const idleSamples = sampleClip(idle);
      const startOffset = Math.hypot(...walkSamples.start.map((v, axis) => v - idleSamples.start[axis]));
      const meanOffset = Math.hypot(...walkSamples.mean.map((v, axis) => v - idleSamples.mean[axis]));
      const failures = [];
      if (walkSamples.maxMotionMeters > 0.05) failures.push('Hips Walk move ' + walkSamples.maxMotionMeters.toFixed(3) + ' m (limite 0,05 m)');
      if (idleSamples.maxMotionMeters > 0.05) failures.push('Hips Idle move ' + idleSamples.maxMotionMeters.toFixed(3) + ' m (limite 0,05 m)');
      if (startOffset > 0.05) failures.push('offset inicial Walk↔Idle do Hips ' + startOffset.toFixed(3) + ' m (limite 0,05 m)');
      animationAudit = {
        status: failures.length ? 'fail' : 'pass',
        samplesPerClip: ${AUDIT_PHASE_SAMPLES + 1},
        hipsMotionMeters: {
          walk: Number(walkSamples.maxMotionMeters.toFixed(4)),
          idle: Number(idleSamples.maxMotionMeters.toFixed(4)),
        },
        walkIdleStartOffsetMeters: Number(startOffset.toFixed(4)),
        walkIdleMeanOffsetMeters: Number(meanOffset.toFixed(4)),
        walkSurfaceAudit: walkSamples.surfaceAudit,
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
  window.__previewData = {
    height,
    runtimeScale: scale,
    meshes,
    skinnedMeshes,
    materials,
    sanitizedTracks,
    clips: clips.map((a) => a.name),
    animationAudit,
    renderPose,
    boneAudit,
  };
  window.__previewReady = true;
} catch (error) {
  window.__previewError = String(error?.stack || error);
  window.__previewReady = true;
}
function draw() { requestAnimationFrame(draw); renderer.render(scene, camera); }
draw();
</script>`;

const modelBytes = readFileSync(modelPath);
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__previewReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: screenshotPath });
  const data = await page.evaluate(() => ({ ...window.__previewData, error: window.__previewError }));
  console.log(JSON.stringify({ model: resolve(modelPath), screenshot: screenshotPath, ...data, browserErrors: errors }, null, 2));
  if (data.error || errors.length || data.animationAudit?.status === 'fail') process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((ok) => server.close(ok));
}
