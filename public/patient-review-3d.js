// Viewer derived from the approved char-preview.html (Ana044).
// Retains normalization, clip sanitization and animated ground correction.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

function disposeScene(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
    o.shadow?.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
  for (const s of skeletons) s.dispose();
}

export function createPatientViewer(container, params) {
  container.innerHTML = '<canvas id="c" aria-label="Visualizador 3D do paciente"></canvas><div id="hud" role="status">Carregando…</div><div id="warn" role="alert" hidden></div><div id="ui" role="toolbar" aria-label="Vistas da câmera"><button type="button" data-cam="full">Corpo</button><button type="button" data-cam="torso">Torso</button><button type="button" data-cam="face">Rosto</button><button type="button" id="rot" aria-pressed="false">Girar</button><button type="button" id="retry" style="display:none">Tentar de novo</button></div>';
  const qs = new URLSearchParams(params);
  const state = {};
  let disposed = false, frameId = 0, groundTimer = 0;
  const travelEnabled = qs.get('travel') === '1';
  let travelDistance = 0, travelSpeed = 0;
  const name = qs.get('m') || 'ana';
  const canvas = container.querySelector('#c');
  const hud = container.querySelector('#hud');
  const warn = container.querySelector('#warn');
  const retryBtn = container.querySelector('#retry');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const hasWebP = (() => { try { return renderer.extensions.has('EXT_texture_webp') || document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch (e) { return true; } })();
  if (!hasWebP) {
    warn.hidden = false;
    warn.textContent = 'Aviso: este navegador não suporta WebP — as texturas do modelo podem não aparecer.';
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2530);
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x2a2622, 1.0));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
  key.position.set(4, 6, 7); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  // The 1.72 m character needs a short shadow depth range. The default far=500
  // with zero bias produced concentric self-shadow acne on the pants and shirt.
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.005;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc8ff, 1.1); rim.position.set(-3, 3, -4); scene.add(rim);
  const fill = new THREE.PointLight(0x9fd8ff, 4, 12); fill.position.set(-3, 2.4, 3); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(travelEnabled ? 9 : 5, 64), new THREE.MeshStandardMaterial({ color: 0x2a3742, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  if (travelEnabled) {
    const grid = new THREE.GridHelper(16, 32, 0x526775, 0x3c4d59);
    grid.position.y = .001; scene.add(grid, key.target, rim.target);
  }

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.35; controls.maxDistance = 8;
  controls.target.set(0, 1.2, 0);
  try { controls.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' }; controls.listenToKeyEvents(window); } catch (e) { /* teclado opcional */ }

  const CAMS = {
    full:  [[0, 1.15, 3.6], [0, 0.95, 0]],
    torso: [[0, 1.32, 1.75], [0, 1.25, 0]],
    face:  [[0.06, 1.58, 0.62], [0, 1.55, 0]],
  };
  function setCam(k) {
    const c = CAMS[k] || CAMS.full;
    camera.position.set(...c[0]);
    controls.target.set(...c[1]);
    camera.position.z += travelDistance; controls.target.z += travelDistance;
    controls.update();
  }
  container.querySelectorAll('#ui button[data-cam]').forEach(b => b.onclick = () => setCam(b.dataset.cam));
  let spin = false;
  const rotBtn = container.querySelector('#rot');
  rotBtn.onclick = () => { spin = !spin; rotBtn.classList.toggle('on', spin); rotBtn.setAttribute('aria-pressed', String(spin)); };

  let model = null;
  function loadModel() {
    retryBtn.style.display = 'none';
    hud.textContent = 'carregando… 0%';
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`models/${name}.glb?v=${qs.get('v') || ''}`, (g) => {
      if (disposed) { disposeScene(g.scene); return; }
      // IGUALA O PREVIEW AO JOGO: o glbLoader aplica sanitizeClips (congela bones
      // de ponta — dedos/HeadTop_End/Toe_End — que arremessam vertices em fitas
      // quando animam). Sem isso o preview mostra deformacao que o jogo nao tem.
      {
        const FREEZE_BONES = /(_End)$|^(mixamorig:?|mixamorig)?(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$/;
        let removed = 0;
        for (const clip of g.animations || []) {
          const before = clip.tracks.length;
          clip.tracks = clip.tracks.filter((t) => !FREEZE_BONES.test(t.name.split('.')[0]));
          removed += before - clip.tracks.length;
        }
        if (removed) console.log(`[preview] ${removed} tracks de bones de ponta congelados (anti-fita, igual ao jogo)`);
      }
      if (model) { scene.remove(model); }
      const m = g.scene;
      const box = new THREE.Box3().setFromObject(m);
      let size = box.getSize(new THREE.Vector3());
      if (size.z > size.y * 1.5) {
        let headBone = null;
        m.traverse(o => { if (!headBone && o.isBone && /head/i.test(o.name) && !/toe/i.test(o.name)) headBone = o; });
        let best = -Math.PI / 2, bestScore = -Infinity;
        for (const rx of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
          m.rotation.x = rx;
          m.updateMatrixWorld(true);
          let score;
          if (headBone) {
            const v = new THREE.Vector3();
            headBone.getWorldPosition(v);
            score = v.y;
          } else {
            box.setFromObject(m);
            score = box.getSize(new THREE.Vector3()).y;
          }
          if (score > bestScore) { bestScore = score; best = rx; }
        }
        m.rotation.x = best;
        box.setFromObject(m);
        size = box.getSize(new THREE.Vector3());
      }
      m.scale.setScalar(1.72 / Math.max(size.y, 1e-4));
      box.setFromObject(m);
      m.position.y -= box.min.y;
      m.position.x -= (box.max.x + box.min.x) / 2;
      m.position.z -= (box.max.z + box.min.z) / 2;
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(m);
      model = m;
      const walkClip = g.animations?.find(c => /^walk$/i.test(c.name));
      const advance = Number(g.asset?.extras?.walkAdvance);
      travelSpeed = walkClip && Number.isFinite(advance) && advance > 0 ? advance / walkClip.duration : 0;
      state.__previewTravel = { enabled: travelEnabled, speed: travelSpeed, distance: travelDistance, cycles: 0 };
      state.__ready = true;
      // Ground-fix skinned: calibrar pelo ponto mais baixo do ciclo completo,
      // nunca por um frame isolado. Uma amostra no meio do Walk pode estar vários
      // centímetros acima do apoio e fazer o ajuste enterrar o pé no frame seguinte.
      groundTimer = setTimeout(() => {
        try {
          const m2 = state.__model;
          if (!m2) return;
          m2.updateMatrixWorld(true);
          let sk = null;
          m2.traverse((o) => { if (o.isSkinnedMesh) sk = o; });
          if (!sk) return;
          const fn = sk.applyBoneTransform ? sk.applyBoneTransform.bind(sk) : sk.boneTransform.bind(sk);
          const pos = sk.geometry.attributes.position;
          const v = new THREE.Vector3();
          let minY = Infinity;
          const walk = g.animations?.find((clip) => /walk/i.test(clip.name));
          const auditMixer = walk ? new THREE.AnimationMixer(m2) : null;
          const action = auditMixer?.clipAction(walk);
          if (action) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play();
          }
          const phaseSamples = action ? 60 : 0;
          const step = Math.max(1, Math.ceil(pos.count / 12000));
          for (let phase = 0; phase <= phaseSamples; phase++) {
            if (action) auditMixer.setTime(walk.duration * phase / phaseSamples);
            m2.updateMatrixWorld(true);
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos, i);
              fn(i, v);
              v.applyMatrix4(sk.matrixWorld);
              if (Number.isFinite(v.y) && v.y < minY) minY = v.y;
            }
          }
          auditMixer?.stopAllAction();
          state.__mixer?.update(0);
          m2.updateMatrixWorld(true);
          const clearance = 0.005;
          const correction = clearance - minY;
          if (Number.isFinite(correction) && Math.abs(correction) < 0.5) {
            m2.position.y += correction;
            state.__groundFixData = {
              status: 'pass', minYBefore: minY, clearance,
              predictedMinYAfter: minY + correction, correction,
              phaseSamples: action ? phaseSamples + 1 : 1,
              verticesSampledPerPhase: Math.ceil(pos.count / step),
            };
            console.log(`[ground-fix] mínimo do ciclo (${state.__groundFixData.phaseSamples} amostras): ${minY.toFixed(3)} m → folga ${clearance.toFixed(3)} m; ajuste ${correction.toFixed(3)} m`);
          } else {
            state.__groundFixData = { status: 'fail', minYBefore: minY, correction };
          }
        } catch (e) { state.__groundFixData = { status: 'error', error: String(e) }; }
      }, 2500);
      if (qs.get('anim')) {
        const mx = new THREE.AnimationMixer(m);
        const cl = g.animations.find((c) => new RegExp(qs.get('anim'), 'i').test(c.name)) || g.animations[0];
        const ac = mx.clipAction(cl); ac.play(); ac.paused = !qs.get('play'); ac.time = parseFloat(qs.get('t') || '0');
        state.__mixer = mx; state.__anim = cl.name; state.__playing = !!qs.get('play');
        hud.textContent += ` · anim=${cl.name} t=${qs.get('t') || 0}`;
      } else if (g.animations && g.animations.length) {
        // 05/10: SEM anim no URL o preview mostrava a pose técnica de rig (T-pose
        // INVERTIDA — convenção da família de modelos) e confundia o PO 3x.
        // Agora auto-play do Idle: qualquer link mostra a personagem viva e de pé.
        const mx = new THREE.AnimationMixer(m);
        const idle = g.animations.find((c) => /idle/i.test(c.name)) || g.animations[0];
        const ac = mx.clipAction(idle); ac.play();
        state.__mixer = mx; state.__anim = idle.name; state.__playing = true;
        hud.textContent += ` · anim=${idle.name} (auto)`;
      }
      state.__model = m;
      state.__THREE = THREE;
      state.__renderer = renderer;
      state.__camera = camera;
      state.__scene = scene;
      state.__controls = controls;
      hud.textContent = `${name} · 1.72 m · arraste = girar · scroll = zoom · setas = mover`;
    }, (ev) => {
      if (disposed) return;
      if (ev && ev.total) hud.textContent = `carregando… ${Math.round(100 * ev.loaded / ev.total)}%`;
    }, (e) => {
      if (disposed) return;
      console.error(e);
      hud.textContent = 'erro ao carregar: ' + name;
      retryBtn.style.display = 'inline-block';
    });
  }
  retryBtn.onclick = loadModel;
  loadModel();

  if (qs.get('cam') === 'free') {
    const g = (k, d) => parseFloat(qs.get(k) ?? d);
    controls.minDistance = 0.02;
    camera.position.set(g('cx', 0), g('cy', 1.2), g('cz', 3));
    controls.target.set(g('tx', 0), g('ty', 1.2), g('tz', 0));
    controls.update();
  } else {
    setCam(qs.get('cam') || 'full');
  }
  let frames = 0, lastFpsT = performance.now();
  let lastT = performance.now();
  function advancePreview(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid preview delta');
    if (!state.__playing || !state.__mixer) return;
    state.__mixer.update(dt);
    // In-place clips intentionally move a planted foot backward in local space.
    // travel=1 adds the calibrated root motion against a fixed floor so contact
    // can be reviewed in world space, using the same delta as the clip.
    if (travelEnabled && model && /^walk$/i.test(state.__anim) && travelSpeed > 0) {
      const next = (travelDistance + travelSpeed * dt) % 4.4;
      if (next < travelDistance) state.__previewTravel.cycles++;
      const delta = next - travelDistance;
      for (const object of [model, camera, controls.target, key, key.target, rim, rim.target, fill]) {
        const position = object.isVector3 ? object : object.position;
        position.z += delta;
      }
      travelDistance = next; state.__previewTravel.distance = next;
    }
  }
  state.__advancePreview = advancePreview;
  function loop() {
    if (disposed) return;
    frameId = requestAnimationFrame(loop);
    const nowT = performance.now();
    advancePreview(Math.min((nowT - lastT) / 1000, 0.05));
    lastT = nowT;
    controls.autoRotate = spin;
    controls.autoRotateSpeed = 1.6;
    controls.update();
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - lastFpsT >= 1000) {
      const fps = Math.round(1000 * frames / (now - lastFpsT));
      if (model && state.__ready) hud.textContent = `${name} · 1.72 m · ${fps} fps · arraste = girar · scroll = zoom`;
      frames = 0; lastFpsT = now;
    }
  }
  loop();
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  resize.observe(container);
  return {
    state,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(groundTimer);
      resize.disconnect();
      controls.dispose();
      state.__mixer?.stopAllAction();
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
