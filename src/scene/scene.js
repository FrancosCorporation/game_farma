import * as THREE from 'three';
import { setupFX } from './fx.js';
import { readQuality, resolveQuality, shouldRenderFrame, writeQuality } from './qualitySettings.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  let storage;
  try { storage = window.localStorage; } catch { /* preferences remain in memory */ }
  let selectedQuality = readQuality(storage);
  const reduceMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const resolveSettings = () => resolveQuality(selectedQuality, {
    mobile: matchMedia('(pointer: coarse)').matches || innerWidth < 768,
    devicePixelRatio: devicePixelRatio,
    reducedMotion: reduceMotionQuery.matches,
  });
  let quality = resolveSettings();
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1219);
  scene.fog = new THREE.Fog(0x0d1219, 12, 30);

  // Câmera fixa: farmacêutica atrás do balcão, em primeira pessoa
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 1.62, 2.7);
  camera.lookAt(0, 1.38, 0);

  // Iluminação "loja de farmácia": ambiente frio + chave quente (valores contidos p/ não estourar)
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x2a2622, 0.62));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.05);
  key.position.set(2.5, 5.5, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: .5, far: 25 });
  key.shadow.bias = -.0006;
  key.shadow.normalBias = .025;
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  const fill = new THREE.PointLight(0x9fd8ff, 0.8, 20);
  fill.position.set(-4, 3.2, -2);
  scene.add(fill);
  const warm = new THREE.PointLight(0xffd9a0, 0.55, 12);
  warm.position.set(2, 2.6, 1);
  scene.add(warm);

  const fx = setupFX(scene, camera, renderer, quality);
  function applyQuality() {
    const next = resolveSettings();
    const shadowsChanged = quality.shadows !== next.shadows;
    quality = next;
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.shadowMap.enabled = quality.shadows;
    let pointLights = 0;
    scene.traverse((o) => {
      if (o.isPointLight) o.visible = quality.mode !== 'low' || pointLights++ < 3;
      if (o.isMesh && shadowsChanged) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) m.needsUpdate = true;
      }
    });
    fx.applyQuality(quality);
    renderer.setSize(innerWidth, innerHeight);
    fx.resize(innerWidth, innerHeight);
  }

  const tickers = new Set();
  const clock = new THREE.Clock();
  let lastFrameAt = Number.NEGATIVE_INFINITY;
  // F2 — quando o controlador POV assume a câmera (zones/tween), o balanço idle é desligado.
  const povControl = { owned: false };

  function frame(now) {
    if (!shouldRenderFrame(now, lastFrameAt, quality.maxFps)) {
      requestAnimationFrame(frame);
      return;
    }
    lastFrameAt = now;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!povControl.owned && !quality.reducedMotion) {
      camera.position.y = 1.62 + Math.sin(t * 1.1) * 0.008;
      camera.rotation.z = Math.sin(t * 0.7) * 0.0015;
    }
    tickers.forEach((fn) => fn(dt, t));
    fx.frame(t);
    fx.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyQuality();
  });
  reduceMotionQuery.addEventListener('change', applyQuality);

  return {
    scene,
    camera,
    renderer,
    fx,
    get quality() { return quality; },
    get selectedQuality() { return selectedQuality; },
    setQuality(mode) {
      writeQuality(storage, mode);
      selectedQuality = mode;
      applyQuality();
    },
    refreshQuality: applyQuality,
    povControl,
    addTicker: (fn) => tickers.add(fn),
  };
}
