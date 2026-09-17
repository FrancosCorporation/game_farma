import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Instância compartilhada do loader GLTF (evita criar um loader por prop)
const gltfLoader = new GLTFLoader();

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
const mk = (geo, mat, cast = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};
const rnd = (a, b) => a + Math.random() * (b - a);

// Iluminação por ambiente via RoomEnvironment + ajuste fino (reflexos suaves)
// Direção de arte: estilizado casual — ver docs/DIRETRIZES_ARTE_ESTILIZADA.md
function makeEnvironment(scene, renderer) {
  if (!renderer) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.24;
}

// Rua exterior visível pela porta de vidro (fundo noturno)
function outdoor(scene) {
  // Calçada
  const calcada = mk(new THREE.BoxGeometry(14, 0.06, 3.2), M(0x3c4148, { roughness: 0.9 }), false);
  calcada.position.set(0, 0.015, -8.2);
  scene.add(calcada);

  // Céu noturno com estrelas + lua
  const sky = canvasTexture(1024, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#070b16');
    grad.addColorStop(0.45, '#0c1424');
    grad.addColorStop(0.62, '#1a2c45');
    grad.addColorStop(0.72, '#27405e');
    grad.addColorStop(0.78, '#3a5a7a');
    grad.addColorStop(1, '#0d1826');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 340; i++) {
      const a = Math.random() * 0.85;
      g.fillStyle = `rgba(230,240,255,${a * 0.9})`;
      const r = Math.random() * 1.6 + 0.4;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s * 0.72, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(238,244,255,0.92)';
    g.beginPath();
    g.arc(s * 0.82, s * 0.15, s * 0.05, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(238,244,255,0.35)';
    g.beginPath();
    g.arc(s * 0.82, s * 0.15, s * 0.085, 0, Math.PI * 2);
    g.fill();
  }, 1, 1);
  const skyMat = new THREE.MeshBasicMaterial({ map: sky, fog: false });
  const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), skyMat);
  skyMesh.position.set(0, 4, -8.6);
  skyMesh.rotation.x = 0;
  scene.add(skyMesh);

  // Silhuetas de prédios + luzes
  const prdMat = new THREE.MeshStandardMaterial({ color: 0x0b101a, roughness: 1, metalness: 0 });
  const winMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  let px = -9;
  const rng = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 7; i++) {
    const w = rng(1.2, 2.4);
    const h = rng(2.2, 5.2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), prdMat);
    b.position.set(px + w / 2, h / 2, -8.9);
    b.rotation.y = rng(-0.06, 0.06);
    scene.add(b);
    // janelinhas acesas
    const jn = Math.floor(rng(2, 4));
    for (let k = 0; k < jn; k++) {
      const jw = rng(0.1, 0.3), jh = rng(0.14, 0.24);
      const jm = new THREE.Mesh(new THREE.PlaneGeometry(jw, jh), winMat(k % 2 ? 0xffd9a0 : 0xfff2d0));
      const y = rng(0.4, h - 0.5);
      const zz = -8.9 + 0.82;
      jm.position.set(b.position.x + rng(-w / 2 + 0.2, w / 2 - 0.2), y, zz);
      jm.rotation.y = Math.PI;
      scene.add(jm);
    }
    px += w + rng(0.3, 0.8);
  }

  // Poste de luz da rua
  const poste = mk(new THREE.CylinderGeometry(0.03, 0.04, 3.4, 8), M(0x23282e, { roughness: 0.6 }), false);
  poste.position.set(-2.6, 1.7, -8.15);
  scene.add(poste);
  const posteLight = new THREE.PointLight(0xffc77a, 0.8, 7);
  posteLight.position.set(-2.6, 3.4, -8.15);
  scene.add(posteLight);
  const lampCap = mk(new THREE.CylinderGeometry(0.09, 0.05, 0.16, 10), M(0x14171c, { roughness: 0.5 }), false);
  lampCap.position.set(-2.6, 3.44, -8.15);
  scene.add(lampCap);
}
function propFromGLB(url, fallback, scene, { pos = [0, 0, 0], rotY = 0 } = {}) {
  fallback.position.set(...pos);
  fallback.rotation.y = rotY;
  scene.add(fallback);
  gltfLoader.loadAsync(url).then((g) => {
    g.scene.position.set(...pos);
    g.scene.rotation.y = rotY;
    scene.add(g.scene);
    fallback.visible = false;
  }).catch(() => { /* mantém procedural */ });
}


function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// Piso cerâmico 40x40 — grout marcado + variação sutil + brilho leve (canvas limpo, sem grunge)
function tileTexture() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#c9cfd5';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = `rgba(${138 + (Math.random() * 44) | 0},${146 + (Math.random() * 40) | 0},${154 + (Math.random() * 36) | 0},${rnd(0.04, 0.14)})`;
      g.fillRect(Math.random() * s, Math.random() * s, 4, 4);
    }
    // veios de limpeza/reflexo
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * s;
      g.strokeStyle = `rgba(255,255,255,${rnd(0.02, 0.06)})`;
      g.lineWidth = rnd(1, 6);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 22) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
      g.stroke();
    }
    g.strokeStyle = 'rgba(70,80,92,0.65)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, s - 4, s - 4);
  }, 6, 4);
}

function tileMaterial() {
  return new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.34, metalness: 0.03 });
}

// Parede com textura de tinta + rodapé branco integrado
function wallTexture() {
  return canvasTexture(512, (g, s) => {
    const base = g.createLinearGradient(0, 0, 0, s);
    base.addColorStop(0, '#f2ede2');
    base.addColorStop(0.75, '#e7e1d4');
    base.addColorStop(0.82, '#e2dccd');
    base.addColorStop(0.9, '#d8d2c2');
    base.addColorStop(1, '#c8c0ae');
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${170 + (Math.random() * 55) | 0},${158 + (Math.random() * 48) | 0},${140 + (Math.random() * 48) | 0},${rnd(0.03, 0.08)})`;
      g.fillRect(Math.random() * s, Math.random() * s, 4, 4);
    }
    // rodapé
    g.fillStyle = '#faf8f2';
    g.fillRect(0, s - s * 0.07, s, s * 0.07);
    g.fillStyle = 'rgba(140,130,115,0.5)';
    g.fillRect(0, s - s * 0.07, s, 2);
  }, 5, 3);
}

// Madeira do balcão (veios + nó) — mais rica
function woodTexture() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#8a5a33';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * s;
      g.strokeStyle = `rgba(58,34,14,${rnd(0.08, 0.2)})`;
      g.lineWidth = rnd(1, 5);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 20) g.lineTo(x, y + Math.sin(x * 0.028 + i) * 6 + Math.sin(x * 0.011) * 4);
      g.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const nx = Math.random() * s, ny = Math.random() * s;
      g.strokeStyle = `rgba(50,28,12,${rnd(0.15, 0.3)})`;
      g.lineWidth = rnd(2, 4);
      g.beginPath();
      g.ellipse(nx, ny, rnd(5, 12), rnd(3, 7), Math.random() * 3, 0, Math.PI * 2);
      g.stroke();
    }
  }, 2, 1);
}

const BOX_COLORS = [0xf8f9fa, 0x2ec4b6, 0xff9f1c, 0xe07a5f, 0xf4f1de, 0x3d5a80, 0xffffff, 0x0d9488, 0xf28f3b, 0x6d9dc5];

// Caixa de remédio com "rótulo" procedural
function medicineBox() {
  const w = rnd(0.09, 0.16), h = rnd(0.11, 0.19), d = rnd(0.2, 0.24);
  const g = new THREE.Group();
  const body = mk(new THREE.BoxGeometry(w, h, d), M(BOX_COLORS[(Math.random() * BOX_COLORS.length) | 0], { roughness: 0.55 }), false);
  const label = mk(new THREE.BoxGeometry(w + 0.004, h * 0.45, d + 0.004), M(0xffffff, { roughness: 0.7 }), false);
  label.position.y = -h * 0.08;
  g.add(body, label);
  g.userData.isMedicine = true;
  return g;
}

function gondola(scene, x, z, ry) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const W = 2.4, D = 0.5, H = 2.1, SHELVES = 4;
  const frame = M(0x5b6770, { roughness: 0.5 });
  for (const side of [-1, 1]) {
    const panel = mk(new THREE.BoxGeometry(0.06, H, D), frame);
    panel.position.set((side * W) / 2, H / 2, 0);
    g.add(panel);
  }
  const header = mk(new THREE.BoxGeometry(W, 0.3, 0.07), M(0x0d9488, { emissive: 0x0d9488, emissiveIntensity: 0.35 }));
  header.position.set(0, H + 0.15, 0);
  g.add(header);
  for (let i = 0; i < SHELVES; i++) {
    const y = 0.5 + i * 0.5;
    const board = mk(new THREE.BoxGeometry(W, 0.05, D), frame, false);
    board.position.set(0, y, 0);
    g.add(board);
    let cx = -W / 2 + 0.12;
    while (cx < W / 2 - 0.2) {
      const box = medicineBox();
      box.position.set(cx, y + 0.11, 0);
      g.add(box);
      cx += 0.14 + Math.random() * 0.1;
    }
  }
  propFromGLB('models/prop_gondola.glb', g, scene, { pos: [x, 0, z], rotY: ry });
  return g;
}

function attendant(scene, addTicker, x, z, color, glbName) {
  const g = new THREE.Group();
  const body = mk(new THREE.CapsuleGeometry(0.16, 0.55, 4, 8), M(color));
  body.position.y = 1.05;
  const head = mk(new THREE.SphereGeometry(0.12, 12, 10), M(0xd9b08c));
  head.position.y = 1.62;
  g.add(body, head);
  g.rotation.y = 0.5;
  addTicker((dt, t) => {
    g.position.y = Math.sin(t * 1.3 + x) * 0.012;
    head.rotation.y = Math.sin(t * 0.6 + x) * 0.3;
  });
  if (glbName) {
    // Atendente modelado (uniforme) substitui o procedural; fallback automático
    // (legado realista → substituir na leva estilizada)
    propFromGLB(`models/${glbName}.glb`, g, scene, { pos: [x, 0, z], rotY: 0.5 });
  } else {
    g.position.set(x, 0, z);
    scene.add(g);
  }
}

export function buildPharmacy(scene, addTicker, renderer) {
  const floor = mk(new THREE.PlaneGeometry(18, 13), tileMaterial(), false);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.95 });
  const mkWall = (w, h, d, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  mkWall(18, 3.8, 0.2, 0, 1.9, -6.5);
  mkWall(0.2, 3.8, 13, -9, 1.9, 0);
  mkWall(0.2, 3.8, 13, 9, 1.9, 0);
  const ceil = mk(new THREE.BoxGeometry(18, 0.15, 13), M(0xf1f3f5), false);
  ceil.position.set(0, 3.85, 0);
  scene.add(ceil);

  // Lâmpadas fluorescentes
  const lamp = M(0xffffff, { emissive: 0xeaf6ff, emissiveIntensity: 1.6 });
  for (const x of [-5, 0, 5]) {
    for (const z of [-3, 1.5]) {
      const p = mk(new THREE.BoxGeometry(2.6, 0.06, 0.5), lamp, false);
      p.position.set(x, 3.75, z);
      scene.add(p);
    }
  }

  // Balcão principal (madeira + tampo) — G4: GLB com fallback procedural
  const balcaoG = new THREE.Group();
  const base = mk(new THREE.BoxGeometry(4.6, 1.0, 0.75), M(0x2f3e46, { roughness: 0.5 }));
  base.position.set(0, 0.5, 0);
  const top = mk(new THREE.BoxGeometry(4.8, 0.06, 0.95), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.35 }));
  top.position.set(0, 1.03, 0);
  const band = mk(new THREE.BoxGeometry(4.6, 0.1, 0.02), M(0x0d9488, { emissive: 0x0d9488, emissiveIntensity: 0.4 }), false);
  band.position.set(0, 0.86, -0.39);
  balcaoG.add(base, top, band);
  propFromGLB('models/prop_balcao.glb', balcaoG, scene, { pos: [0, 0, 1.55] });


  // Monitor do ponto de venda / bulário — G4: GLB com fallback procedural
  const bularioTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#0b1220';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#0d9488';
    g.fillRect(0, 0, s, 34);
    g.fillStyle = '#5eead4';
    g.font = `700 ${s * 0.09}px Outfit, sans-serif`;
    g.fillText('BULÁRIO', 12, 23);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i === 1 ? '#2dd4bf' : 'rgba(148,163,184,0.55)';
      g.fillRect(14, 52 + i * 30, 60 + Math.random() * (s - 110), 9);
    }
  }, 1, 1);
  const pcG = new THREE.Group();
  const monitor = mk(new THREE.BoxGeometry(0.42, 0.3, 0.06), M(0x1a2027, { roughness: 0.4 }));
  monitor.position.set(0, 1.2, -0.06);
  const screen = mk(new THREE.BoxGeometry(0.36, 0.23, 0.012), new THREE.MeshStandardMaterial({
    map: bularioTex, emissive: 0x2dd4bf, emissiveIntensity: 0.55, emissiveMap: bularioTex, roughness: 0.35,
  }), false);
  screen.position.set(0, 1.2, -0.024);
  const teclado = mk(new THREE.BoxGeometry(0.34, 0.02, 0.13), M(0x232b33, { roughness: 0.6 }));
  teclado.position.set(0.02, 1.065, 0.07);
  pcG.add(monitor, screen, teclado);
  pcG.rotation.y = 0.5;
  propFromGLB('models/prop_pc.glb', pcG, scene, { pos: [-1.4, 1.03, 1.78], rotY: 0.5 });


  // F2 — Mesa lateral com bandeja do kit TLAC (teste rápido)
  const mesa = new THREE.Group();
  const mt = mk(new THREE.BoxGeometry(0.95, 0.05, 0.7), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.35 }));
  mt.position.y = 0.9;
  mesa.add(mt);
  for (const [lx, lz] of [[-0.42, -0.28], [0.42, -0.28], [-0.42, 0.28], [0.42, 0.28]]) {
    const leg = mk(new THREE.CylinderGeometry(0.024, 0.02, 0.88, 8), M(0x4a3524, { roughness: 0.6 }));
    leg.position.set(lx, 0.44, lz);
    mesa.add(leg);
  }
  // Bandeja + casete + lancetador + algodão (kit de teste rápido)
  const bandeja = mk(new THREE.BoxGeometry(0.52, 0.035, 0.34), M(0x0f766e, { roughness: 0.4, metalness: 0.3 }));
  bandeja.position.set(0, 0.945, 0);
  mesa.add(bandeja);
  const casete = mk(new THREE.BoxGeometry(0.17, 0.045, 0.09), M(0xf8f9fa, { roughness: 0.5 }), false);
  casete.position.set(-0.08, 0.985, 0.02);
  mesa.add(casete);
  const janela = mk(new THREE.BoxGeometry(0.06, 0.012, 0.04), M(0xff9f1c, { emissive: 0xff9f1c, emissiveIntensity: 0.7 }), false);
  janela.position.set(-0.08, 1.01, 0.02);
  mesa.add(janela);
  const lancetador = mk(new THREE.CylinderGeometry(0.016, 0.02, 0.09, 10), M(0x3d5a80, { roughness: 0.45 }), false);
  lancetador.position.set(0.13, 0.995, -0.06);
  lancetador.rotation.z = 0.35;
  mesa.add(lancetador);
  const algodao = mk(new THREE.SphereGeometry(0.035, 10, 8), M(0xffffff, { roughness: 1 }), false);
  algodao.position.set(0.12, 0.975, 0.1);
  mesa.add(algodao);
  const frasco = mk(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10), M(0x9fd8ff, { roughness: 0.3, transparent: true, opacity: 0.85 }), false);
  frasco.position.set(-0.16, 1.0, -0.1);
  mesa.add(frasco);
  mesa.position.set(2.45, 0, 1.45);
  mesa.rotation.y = -0.35;
  propFromGLB('models/prop_mesa.glb', mesa, scene, { pos: [2.45, 0, 1.45], rotY: -0.35 });

  // Letreiro de farmácia: cruz verde emissiva
  const signGroup = new THREE.Group();
  const signBack = mk(new THREE.BoxGeometry(1.3, 1.3, 0.12), M(0x0a3d2e, { roughness: 0.4 }));
  signBack.position.y = 2.1;
  signGroup.add(signBack);
  const crossH = mk(new THREE.BoxGeometry(0.85, 0.28, 0.1), M(0x22d3a0, { emissive: 0x10b981, emissiveIntensity: 1.6 }), false);
  const crossV = mk(new THREE.BoxGeometry(0.28, 0.85, 0.1), M(0x22d3a0, { emissive: 0x10b981, emissiveIntensity: 1.6 }), false);
  crossH.position.set(0, 2.1, 0.07);
  crossV.position.set(0, 2.1, 0.07);
  signGroup.add(crossH, crossV);
  const glow = new THREE.PointLight(0x34d399, 0.55, 6);
  glow.position.set(0, 2.1, 0.5);
  signGroup.add(glow);
  signGroup.position.set(-6.2, 0, -6.4);
  scene.add(signGroup);

  // "FARMA" em letras acima do letreiro (banners procedurais)
  function bannerTex(text) {
    return canvasTexture(512, (g, s) => {
      g.fillStyle = '#0d9488';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#5eead4';
      g.font = `900 ${s * 0.5}px Outfit, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, s / 2, s / 2 + 10);
    }, 1, 1);
  }
  const banner = mk(new THREE.BoxGeometry(4.6, 0.66, 0.06), new THREE.MeshStandardMaterial({ map: bannerTex('FarmaCheck'), emissive: 0x0f766e, emissiveIntensity: 0.45, emissiveMap: bannerTex('FarmaCheck') }), false);
  banner.position.set(0, 3.15, -6.5);
  scene.add(banner);

  // Porta de entrada (vidro) + marco
  const doorFrame = mk(new THREE.BoxGeometry(1.6, 2.3, 0.14), M(0x37474f, { metalness: 0.4, roughness: 0.4 }));
  doorFrame.position.set(3.2, 1.15, -6.36);
  scene.add(doorFrame);
  const doorGlass = mk(new THREE.BoxGeometry(1.4, 2.1, 0.06), M(0x9fc4d0, { roughness: 0.06, metalness: 0.4, transparent: true, opacity: 0.5 }), false);
  doorGlass.position.set(3.2, 1.1, -6.28);
  scene.add(doorGlass);
  const doorHandle = mk(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), M(0xffd9a0, { metalness: 0.9, roughness: 0.2 }), false);
  doorHandle.position.set(3.85, 1.1, -6.28);
  doorHandle.rotation.z = Math.PI / 2;
  scene.add(doorHandle);

  // Gôndolas (fundo e laterais)
  gondola(scene, -3.2, -4.6, 0);
  gondola(scene, 0.2, -5.4, 0);
  gondola(scene, -7.8, -2.2, Math.PI / 2);
  gondola(scene, -7.8, -4.4, Math.PI / 2);
  gondola(scene, 7.6, -3.4, -Math.PI / 2);

  // Vitrine lateral com expositores — G4: GLB com fallback procedural
  const vitrineG = new THREE.Group();
  const shelfW = mk(new THREE.BoxGeometry(0.6, 2.2, 0.06), M(0x2f3e46), false);
  shelfW.position.set(0, 1.1, 0);
  vitrineG.add(shelfW);
  propFromGLB('models/prop_vitrine.glb', vitrineG, scene, { pos: [8.2, 0, -1.5], rotY: Math.PI / 2 });


  // Atendentes de fundo — uniformes modelados (GLB; legado realista)
  attendant(scene, addTicker, -5.2, 1.9, 0x8d99ae, 'atendente_balcon');
  attendant(scene, addTicker, 5.2, 1.9, 0xb08968, 'atendente_gondola');

  // ================= Ambientação =================

  // Cartazes de farmácia nas paredes
  function posterTex(title, body) {
    return canvasTexture(512, (g, s) => {
      g.fillStyle = '#0d9488';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#ffffff';
      g.fillRect(0, s * 0.78, s, s * 0.22);
      g.fillStyle = '#0d9488';
      g.font = `800 ${s * 0.11}px Outfit, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(title, s / 2, s * 0.13);
      g.fillStyle = '#1f2937';
      g.font = `600 ${s * 0.055}px Outfit, sans-serif`;
      g.fillText(body, s / 2, s * 0.45);
      g.fillText('FarmaCheck • Saúde com Você', s / 2, s * 0.62);
    }, 1, 1);
  }
  const posterMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  for (const [px, pz, pry, t, b] of [
    [-8.7, -3.4, Math.PI / 2, 'Vacinação', 'Protegí a quem amas'],
    [8.7, -3.0, -Math.PI / 2, 'Teste Rápido', 'Resultado em minutos'],
    [-8.7, 1.1, Math.PI / 2, 'Farmacêutica', 'Sempre ao teu lado'],
  ]) {
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.6), posterMat(posterTex(t, b)));
    pm.position.set(px, 1.9, pz);
    pm.rotation.y = pry;
    pm.receiveShadow = true;
    scene.add(pm);
  }

  // Luz LED extra: fría no techo sobre el balcón + cálida en góndolas
  const led = new THREE.PointLight(0xeaf4ff, 0.8, 16);
  led.position.set(0, 3.6, 1.0);
  scene.add(led);
  const gondoWarm = new THREE.PointLight(0xffe2b0, 0.45, 10);
  gondoWarm.position.set(0, 2.8, -3.5);
  scene.add(gondoWarm);
  const vitrineCool = new THREE.PointLight(0xcfe8ff, 0.55, 9);
  vitrineCool.position.set(8.6, 2.6, -1.5);
  scene.add(vitrineCool);

  // Rua exterior noturna pela porta de vidro
  outdoor(scene);

  // Ambiente/reflexos suaves — precisa do renderer
  makeEnvironment(scene, renderer);

  return { scene };
}