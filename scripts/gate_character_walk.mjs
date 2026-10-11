// Offline contract gate for animated FarmaCheck character GLBs.
// Usage: node scripts/gate_character_walk.mjs <candidate.glb>
import { readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const file = process.argv[2];
if (!file || file === '--help') {
  console.log('Uso: node scripts/gate_character_walk.mjs <candidate.glb>');
  process.exit(file ? 0 : 2);
}

const fail = [];
const warn = [];
const report = {};
// Exact mirror of src/scene/glbLoader.js; channels removed here do not animate
// at runtime, so they cannot count toward the live-clip contract.
const FREEZE_BONES = /(_End)$|^(mixamorig:?|mixamorig)?(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$/;
const finite = (n) => Number.isFinite(n);
const maxOf = (a) => a.length ? Math.max(...a) : 0;
const minOf = (a) => a.length ? Math.min(...a) : 0;

try {
  const header = readFileSync(file);
  if (header.toString('ascii', 0, 4) !== 'glTF') throw new Error('arquivo não é GLB binário');
  const jsonLength = header.readUInt32LE(12);
  const gltfJson = JSON.parse(header.toString('utf8', 20, 20 + jsonLength));
  report.bytes = statSync(file).size;
  if (report.bytes > 15 * 1024 * 1024) fail.push(`GLB ${Math.ceil(report.bytes / 1048576)} MB > 15 MB para web`);
  else if (report.bytes > 8 * 1024 * 1024) warn.push(`GLB ${Math.ceil(report.bytes / 1048576)} MB; acima da meta mobile de 8 MB`);

  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(file);
  const root = doc.getRoot();
  // glTF-Transform's Asset model does not expose asset.extras consistently
  // across supported versions; read this small metadata field from the GLB JSON.
  const assetExtras = gltfJson.asset?.extras || {};
  const scenes = root.listScenes();
  if (!scenes.length) fail.push('GLB sem scene');

  const skins = root.listSkins();
  const jointCount = skins[0]?.listJoints().length || 0;
  report.skins = skins.length;
  report.joints = jointCount;
  if (skins.length !== 1) fail.push(`esperada 1 skin Mixamo; encontrado ${skins.length}`);
  if (jointCount !== 65) fail.push(`esperados 65 joints Mixamo; encontrados ${jointCount}`);
  const jointSet = new Set(skins[0]?.listJoints().map((n) => n.getName()) || []);
  const skinnedNodes = root.listNodes().filter((n) => n.getSkin());
  if (!skinnedNodes.length) fail.push('nenhum node usa skin');
  report.skinnedNodes = skinnedNodes.length;

  let triangles = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
    const mode = prim.getMode() ?? 4;
    if (mode === 4) triangles += Math.floor(count / 3);
    else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
  }
  report.triangles = triangles;
  if (!triangles) fail.push('GLB sem triângulos renderizáveis');
  if (triangles > 200_000) fail.push(`${triangles.toLocaleString('pt-BR')} triângulos > 200 mil para o personagem web`);
  else if (triangles > 150_000) warn.push(`${triangles.toLocaleString('pt-BR')} triângulos; revisar custo mobile`);

  const scene = root.getDefaultScene() || scenes[0];
  const bounds = scene ? getBounds(scene) : null;
  const height = bounds ? bounds.max[1] - bounds.min[1] : 0;
  // This is an offline accessor-space bound. It is not Three.js's skinned
  // Box3 bound, so it must never be used as a runtime scale or meter value.
  report.staticBoundsHeightY = Number(height.toFixed(6));

  for (const node of root.listNodes()) {
    const scale = node.getScale();
    if (![...node.getTranslation(), ...node.getRotation(), ...scale].every(finite)) {
      fail.push(`TRS não finito no node ${node.getName() || '(sem nome)'}`);
      break;
    }
    if (scale.some((v) => v <= 0)) {
      fail.push(`escala zero/negativa no node ${node.getName() || '(sem nome)'}`);
      break;
    }
  }

  const requiredExtensions = gltfJson.extensionsRequired || [];
  report.requiredExtensions = requiredExtensions;
  if (requiredExtensions.includes('KHR_draco_mesh_compression')) {
    fail.push('KHR_draco_mesh_compression não está configurado no GLTFLoader do jogo');
  }
  const extras = {
    walkSpeed: Number(assetExtras.walkSpeed),
    walkAdvance: Number(assetExtras.walkAdvance),
  };
  report.extras = extras;
  if (!(extras.walkSpeed >= 0.5 && extras.walkSpeed <= 2.5)) fail.push('asset.extras.walkSpeed ausente ou fora de 0,5–2,5 m/s');
  if (!(extras.walkAdvance >= 0.3 && extras.walkAdvance <= 2.5)) fail.push('asset.extras.walkAdvance ausente ou fora de 0,3–2,5 m/loop');

  const animations = root.listAnimations();
  const byName = new Map(animations.map((a) => [a.getName().toLowerCase(), a]));
  if (byName.size !== animations.length) fail.push('há nomes de animação duplicados');
  const walk = byName.get('walk');
  const idle = byName.get('idle');
  if (!walk) fail.push('clip Walk ausente');
  if (!idle) fail.push('clip Idle ausente');

  const readTrack = (channel, clipName) => {
    const target = channel.getTargetNode();
    const path = channel.getTargetPath();
    const sampler = channel.getSampler();
    const input = sampler?.getInput()?.getArray();
    const output = sampler?.getOutput()?.getArray();
    if (!target || !sampler || !input || !output) {
      fail.push(`${clipName}: canal sem node/sampler/accessor`);
      return null;
    }
    const times = Array.from(input);
    const values = Array.from(output);
    const components = { rotation: 4, translation: 3, scale: 3 }[path];
    const interpolation = sampler.getInterpolation() || 'LINEAR';
    const factor = interpolation === 'CUBICSPLINE' ? 3 : 1;
    if (!components) fail.push(`${clipName}: path não suportado ${path}`);
    if (!times.length || times.some((t, i) => !finite(t) || (i > 0 && t <= times[i - 1]))) {
      fail.push(`${clipName}: tempos inválidos em ${target.getName()}.${path}`);
    }
    if (values.some((v) => !finite(v))) fail.push(`${clipName}: valor não finito em ${target.getName()}.${path}`);
    if (components && values.length !== times.length * components * factor) {
      fail.push(`${clipName}: quantidade de valores incompatível em ${target.getName()}.${path}`);
    }
    return { target, path, times, values, components, interpolation, factor };
  };

  const inspectClip = (clip, label, minLive) => {
    if (!clip) return null;
    const seen = new Set();
    const tracks = clip.listChannels().map((channel) => readTrack(channel, label)).filter(Boolean);
    const rotations = tracks.filter((t) => t.path === 'rotation');
    const runtimeRotations = rotations.filter((t) => !FREEZE_BONES.test(t.target.getName()));
    let live = 0;
    let liveBeforeRuntimeSanitization = 0;
    const countLive = (track) => {
      const sampleQuat = (i) => {
        const offset = (i * track.factor + (track.factor === 3 ? 1 : 0)) * 4;
        const q = track.values.slice(offset, offset + 4);
        const norm = Math.hypot(...q);
        if (!(norm > 0)) return [0, 0, 0, 1];
        return q.map((v) => v / norm);
      };
      const first = sampleQuat(0);
      let maxAngle = 0;
      for (let i = 1; i < track.times.length; i++) {
        const q = sampleQuat(i);
        const dot = Math.min(1, Math.abs(q.reduce((sum, v, k) => sum + v * first[k], 0)));
        maxAngle = Math.max(maxAngle, 2 * Math.acos(dot));
      }
      return maxAngle > 0.01;
    };
    for (const track of rotations) {
      const key = `${track.target.getName()}.rotation`;
      if (seen.has(key)) fail.push(`${label}: canal duplicado ${key}`);
      seen.add(key);
      if (!jointSet.has(track.target.getName())) fail.push(`${label}: rotação fora da skin: ${track.target.getName()}`);
      if (countLive(track)) liveBeforeRuntimeSanitization++;
    }
    live = runtimeRotations.filter(countLive).length;
    const duration = tracks.reduce((m, t) => Math.max(m, maxOf(t.times)), 0);
    if (duration < 0.4) fail.push(`${label}: duração menor que 0,4 s`);
    if (live < minLive) fail.push(`${label}: apenas ${live} canais de rotação vivos após sanitizeClips; mínimo ${minLive}`);
    const hips = tracks.find((t) => t.path === 'translation' && /(^|:)Hips$/i.test(t.target.getName()));
    if (!hips) fail.push(`${label}: track translation do Hips ausente (in-place verificável)`);
    return {
      duration,
      channels: tracks.length,
      liveRotations: live,
      liveRotationsBeforeRuntimeSanitization: liveBeforeRuntimeSanitization,
      liveRotationsAfterRuntimeSanitization: live,
      frozenRotationTracks: rotations.length - runtimeRotations.length,
      hipsKeyframes: hips?.times.length || 0,
      hips,
    };
  };

  const walkInfo = inspectClip(walk, 'Walk', 15);
  const idleInfo = inspectClip(idle, 'Idle', 8);
  if (walkInfo) report.walk = {
    duration: Number(walkInfo.duration.toFixed(4)), channels: walkInfo.channels,
    liveRotations: walkInfo.liveRotations,
    liveRotationsBeforeRuntimeSanitization: walkInfo.liveRotationsBeforeRuntimeSanitization,
    liveRotationsAfterRuntimeSanitization: walkInfo.liveRotationsAfterRuntimeSanitization,
    frozenRotationTracks: walkInfo.frozenRotationTracks,
    hipsTranslationKeyframes: walkInfo.hipsKeyframes,
  };
  if (idleInfo) report.idle = {
    duration: Number(idleInfo.duration.toFixed(4)), channels: idleInfo.channels,
    liveRotations: idleInfo.liveRotations,
    liveRotationsBeforeRuntimeSanitization: idleInfo.liveRotationsBeforeRuntimeSanitization,
    liveRotationsAfterRuntimeSanitization: idleInfo.liveRotationsAfterRuntimeSanitization,
    frozenRotationTracks: idleInfo.frozenRotationTracks,
    hipsTranslationKeyframes: idleInfo.hipsKeyframes,
  };
  if (walkInfo && extras.walkAdvance > 0 && extras.walkSpeed > 0) {
    const clipSpeed = extras.walkAdvance / walkInfo.duration;
    const timeScale = extras.walkSpeed / clipSpeed;
    report.clipSpeed = Number(clipSpeed.toFixed(3));
    report.timeScale = Number(timeScale.toFixed(3));
    if (timeScale < 0.5 || timeScale > 2) fail.push(`timeScale ${timeScale.toFixed(2)} fora de 0,5–2,0; passada/cadência não compatíveis`);
  }

  if (warn.length) for (const message of warn) console.warn(`AVISO ${message}`);
  report.result = fail.length ? 'FAIL' : 'PASS';
  report.failures = fail;
  console.log(JSON.stringify(report, null, 2));
  if (fail.length) process.exitCode = 1;
} catch (error) {
  console.error(`FALHA ao auditar ${file}: ${error.message}`);
  process.exitCode = 1;
}
