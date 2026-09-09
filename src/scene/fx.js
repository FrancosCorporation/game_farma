import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Vinheta + leve granulação (feito em um único shader de pós-processo)
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.42 },
    grain: { value: 0.035 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float grain;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float vig = 1.0 - amount * dot(d, d) * 2.2;
      c.rgb *= vig;
      float g = (fract(sin(dot(vUv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * grain;
      c.rgb += g;
      gl_FragColor = c;
    }
  `,
};

// Partículas de poeira nos raios de luz
function createDust(scene) {
  const count = 240;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 14;
    pos[i * 3 + 1] = Math.random() * 3.6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    seed[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      varying float vA;
      void main() {
        vec3 p = position;
        p.y += mod(uTime * 0.12 + aSeed, 3.6);
        p.x += sin(uTime * 0.3 + aSeed) * 0.35;
        vA = 0.25 + 0.35 * sin(aSeed * 3.0 + uTime);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + sin(aSeed * 7.0) * 1.5) * (30.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = vA * smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(1.0, 0.95, 0.82, a);
      }
    `,
  });
  const dust = new THREE.Points(geo, mat);
  dust.frustumCulled = false;
  scene.add(dust);
  return dust;
}

export function setupFX(scene, camera, renderer) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.6, 0.85);
  bloom.threshold = 0.65;
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(VignetteShader));

  const dust = createDust(scene);

  // Transição suave (dip rápido) — nunca apaga a tela; só um "piscar" de câmera
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:#02040a;opacity:0;transition:opacity .18s ease;z-index:5;';
  document.body.appendChild(overlay);
  const dip = () =>
    new Promise((res) => {
      overlay.style.opacity = '0.35';
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(res, 200);
      }, 120);
    });

  let bloomTarget = 0.42;
  return {
    composer,
    bloom,
    resize(w, h) {
      composer.setSize(w, h);
    },
    frame(time) {
      dust.material.uniforms.uTime.value = time;
      bloom.strength += (bloomTarget - bloom.strength) * 0.08;
    },
    pulse() {
      bloomTarget = 0.9;
      setTimeout(() => (bloomTarget = 0.42), 700);
    },
    fadeIn: () => dip(),
    fadeOut: () => dip(),
    dip,
  };
}