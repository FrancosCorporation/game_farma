import * as THREE from 'three';
import { setupFX } from './fx.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1219);
  scene.fog = new THREE.Fog(0x0d1219, 12, 30);

  // Câmera fixa: farmacêutica atrás do balcão, em primeira pessoa
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 1.62, 2.7);
  camera.lookAt(0, 1.38, 0);

  // Iluminação "loja de farmácia": ambiente frio + chave quente
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x2a2622, 0.9));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.8);
  key.position.set(2.5, 5.5, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
  scene.add(key);
  const fill = new THREE.PointLight(0x9fd8ff, 10, 20);
  fill.position.set(-4, 3.2, -2);
  scene.add(fill);
  const warm = new THREE.PointLight(0xffd9a0, 6, 12);
  warm.position.set(2, 2.6, 1);
  scene.add(warm);

  const fx = setupFX(scene, camera, renderer);

  const tickers = new Set();
  const clock = new THREE.Clock();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // F2 — quando o controlador POV assume a câmera (zones/tween), o balanço idle é desligado.
  const povControl = { owned: false };

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!povControl.owned && !reduceMotion) {
      camera.position.y = 1.62 + Math.sin(t * 1.1) * 0.008;
      camera.rotation.z = Math.sin(t * 0.7) * 0.0015;
    }
    tickers.forEach((fn) => fn(dt, t));
    fx.frame(t);
    fx.composer.render();
    requestAnimationFrame(frame);
  }
  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    fx.resize(window.innerWidth, window.innerHeight);
  });

  return {
    scene,
    camera,
    renderer,
    fx,
    povControl,
    addTicker: (fn) => tickers.add(fn),
  };
}