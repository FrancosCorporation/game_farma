import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

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
  // PO 26/09 (juiz): "iluminação irregular, metade escura" — ambiente levantado
  function makeEnvironment(scene, renderer) {
    if (!renderer) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.45;
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

// Frasco de remédio (âmbar/verde/azul) com tampa e rótulo — prateleiras mais ricas
const BOTTLE_COLORS = [0xc77f2e, 0x7fae5a, 0x4a7fae, 0x8a5a8f, 0xd4a24a];

// Display do TOPO das gôndolas (26/09, PO: "gera uns 10 remédios, distribui
// ao longo de todas as gôndolas, repetindo"): 10 variantes com rótulo de
// marca desenhado em canvas — caixas com faixa/cápsula e frascos com tampa.
const MED_COLORS = [
  ['#e67e22', '#fff3e0'], ['#2980b9', '#eaf4ff'], ['#16a085', '#e8fff8'],
  ['#c0392b', '#ffeaea'], ['#8e44ad', '#f6eaff'], ['#d4a017', '#fffbe6'],
  ['#27ae60', '#eafff0'], ['#2c3e50', '#eceff1'], ['#d35400', '#fff2e3'],
  ['#0d9488', '#e6fffb'],
];
function medLabelTexture(idx) {
  const [bg, fg] = MED_COLORS[idx % MED_COLORS.length];
  return canvasTexture(128, (g, s) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    g.fillStyle = fg;
    g.fillRect(0, s * 0.58, s, s * 0.42);
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(s * 0.18, s * 0.14, s * 0.64, s * 0.16, s * 0.08);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(s * 0.12, s * 0.44, s * 0.76, s * 0.05);
    g.fillRect(s * 0.12, s * 0.53, s * 0.5, s * 0.03);
    g.fillStyle = bg;
    g.beginPath();
    g.arc(s * 0.5, s * 0.86, s * 0.05, 0, Math.PI * 2);
    g.fill();
  }, 1, 1);
}
function topDisplay(g, W) {
  // fileira de produtos em pé no topo da gôndola, virados p/ a loja (+z)
  const n = 6;
  for (let i = 0; i < n; i++) {
    const idx = (Math.floor(Math.random() * MED_COLORS.length)) | 0;
    const isBottle = i % 3 === 2;
    const item = new THREE.Group();
    const tex = medLabelTexture(idx);
    let hgt;
    if (isBottle) {
      const r = 0.033, h = 0.16;
      hgt = h;
      const body = mk(new THREE.CylinderGeometry(r, r * 0.9, h, 12), M(0xc77f2e, { roughness: 0.3 }), false);
      body.position.y = h / 2;
      const cap = mk(new THREE.CylinderGeometry(r * 0.6, r * 0.6, h * 0.2, 12), M(0xf5f5f0, { roughness: 0.5 }), false);
      cap.position.y = h * 1.1;
      const lbl = mk(new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.4, 12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), false);
      lbl.position.y = h * 0.45;
      item.add(body, cap, lbl);
    } else {
      const w = rnd(0.1, 0.14), h = rnd(0.16, 0.21), d = 0.05;
      hgt = h;
      const body = mk(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), false);
      body.position.y = h / 2;
      const side = mk(new THREE.BoxGeometry(w + 0.004, h * 0.45, d + 0.004), M(0xffffff, { roughness: 0.7 }), false);
      side.position.y = -h * 0.06;
      item.add(body, side);
    }
    const px = -W / 2 + 0.25 + (i * (W - 0.5)) / (n - 1) + rnd(-0.02, 0.02);
    // base do item ASSENTADA no topo real (y=2,1) — antes ficavam flutuando
    item.position.set(px, 2.1 + hgt / 2 + 0.01, rnd(0.02, 0.1));
    item.rotation.y = rnd(-0.25, 0.25);
    g.add(item);
  }
}

function medicineBottle() {
  const r = rnd(0.028, 0.042), h = rnd(0.13, 0.19);
  const g = new THREE.Group();
  const body = mk(new THREE.CylinderGeometry(r, r * 0.92, h, 10), M(BOTTLE_COLORS[(Math.random() * BOTTLE_COLORS.length) | 0], { roughness: 0.35 }), false);
  body.position.y = h / 2;
  const cap = mk(new THREE.CylinderGeometry(r * 0.62, r * 0.62, h * 0.18, 10), M(0xf5f5f0, { roughness: 0.5 }), false);
  cap.position.y = h + h * 0.09;
  const label = mk(new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.34, 10), M(0xfdfdf8, { roughness: 0.75 }), false);
  label.position.y = h * 0.42;
  g.add(body, cap, label);
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
  // DECOR independente (grupo próprio na cena — NÃO no fallback: o propFromGLB
  // esconde o fallback quando o GLB carrega, e a decoração sumia com ele)
  const decG = new THREE.Group();
  decG.position.set(x, 0, z);
  decG.rotation.y = ry;
  scene.add(decG);
  // painel de fundo (não vê através da gôndola)
  const back = mk(new THREE.BoxGeometry(W, H, 0.04), M(0x4a545c, { roughness: 0.6 }), false);
  back.position.set(0, H / 2, -D / 2 - 0.02);
  decG.add(back);
  for (let i = 0; i < SHELVES; i++) {
    const y = 0.5 + i * 0.5;
    // 27/09: lips/tags/back REMOVIDOS (a "divisão no meio" extra — o GLB
    // escalado já tem sua própria estrutura; a decoração procedural
    // ficava em alturas que não casavam e atravessava)
  }
  // GLB com frente original + ESCALA NORMALIZADA (26/09: o GLB renderizava a
  // ~50% — frame y≈1,0, caixas y≈0,6). Mede o bbox e casa com o fallback
  // (2,4 × 2,1 × 0,5) + rótulos de marca nos remédios do MEIO (bx*).
  gltfLoader.loadAsync('models/prop_gondola.glb').then((g) => {
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3());
    const sc = new THREE.Vector3(2.4 / Math.max(size.x, 1e-4), 2.1 / Math.max(size.y, 1e-4), 0.5 / Math.max(size.z, 1e-4));
    g.scene.scale.copy(sc);
    g.scene.position.set(x - (box.getCenter(new THREE.Vector3()).x * sc.x), -box.min.y * sc.y, z - (box.getCenter(new THREE.Vector3()).z * sc.z));
    g.scene.rotation.y = ry;
    let mi = 0;
    g.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const nm = (o.material.name || '').toLowerCase();
      if (/^bx/.test(nm)) {
        if (!o.material.userData.__labeled) {
          o.material = o.material.clone();
          o.material.map = medLabelTexture(mi++);
          o.material.userData.__labeled = true;
        }
      }
    });
    scene.add(g.scene);
    g.visible = false;
  }).catch(() => { /* mantém procedural */ });
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
  // Parede FRONTAL (26/09, PO: "a parede atrás de mim tá preta") — fechava o
  // salão pelas costas do jogador com o vazio. Mesma textura das outras.
  mkWall(18, 3.8, 0.2, 0, 1.9, 6.5);
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
  // DECOR independente do fallback (o propFromGLB esconde o balcaoG quando o
  // GLB carrega — ripas/itens sumiam junto): grupo próprio na cena, ancorado
  // no mesmo lugar do balcão (0,0,1.55)
  const decorG = new THREE.Group();
  decorG.position.set(0, 0, 1.55);
  scene.add(decorG);
  // Frente do balcão: ripas verticais de madeira (sai do monólito liso)
  const slatMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5 });
  for (let sx = -2.2; sx <= 2.21; sx += 0.37) {
    const slat = mk(new THREE.BoxGeometry(0.17, 0.92, 0.03), slatMat, false);
    slat.position.set(sx, 0.47, -0.385);
    decorG.add(slat);
  }
  // Itens de vitrine no tampo (top face em y=1.06 local): planta + lenços —
  // 26/09: expositor quadrado de band-aids REMOVIDO (PO: "coisa em pé com
  // 4 retângulos, não tá bonita"); planta e lenço redesenhados
  const pot = mk(new THREE.CylinderGeometry(0.075, 0.058, 0.13, 12), M(0xb5651d, { roughness: 0.75 }));
  pot.position.set(1.9, 1.12, -0.1);
  decorG.add(pot);
  const potRim = mk(new THREE.TorusGeometry(0.075, 0.012, 8, 16), M(0x8f4f16, { roughness: 0.7 }), false);
  potRim.rotation.x = Math.PI / 2;
  potRim.position.set(1.9, 1.185, -0.1);
  decorG.add(potRim);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = mk(new THREE.SphereGeometry(0.055, 8, 6), M(0x3f8f4f, { roughness: 0.85 }), false);
    leaf.scale.set(0.55, 1.6, 0.3);
    leaf.position.set(1.9 + Math.sin(a) * 0.055, 1.27 + (i % 2) * 0.045, -0.1 + Math.cos(a) * 0.055);
    leaf.rotation.z = Math.sin(a) * 0.5;
    leaf.rotation.x = Math.cos(a) * 0.35;
    decorG.add(leaf);
  }
  const stem = mk(new THREE.CylinderGeometry(0.008, 0.01, 0.16, 6), M(0x2d6b3a, { roughness: 0.9 }), false);
  stem.position.set(1.9, 1.2, -0.1);
  decorG.add(stem);
  // Caixa de lenços: corpo branco com faixa da marca e um lenço saindo
  const tissue = new THREE.Group();
  const tBody = mk(new THREE.BoxGeometry(0.22, 0.09, 0.13), M(0xfdfcf7, { roughness: 0.6 }), false);
  tissue.add(tBody);
  const tStripe = mk(new THREE.BoxGeometry(0.222, 0.036, 0.132), M(0x0d9488, { roughness: 0.5 }), false);
  tStripe.position.y = 0.02;
  tissue.add(tStripe);
  const tSheet = mk(new THREE.BoxGeometry(0.11, 0.015, 0.09), M(0xffffff, { roughness: 0.9 }), false);
  tSheet.position.set(0, 0.052, 0);
  tSheet.rotation.x = 0.25;
  tissue.add(tSheet);
  tissue.position.set(0.75, 1.105, -0.05);
  tissue.rotation.y = 0.15;
  decorG.add(tissue);
  propFromGLB('models/prop_balcao.glb', balcaoG, scene, { pos: [0, 0, 1.55] });


  // Monitor do ponto de venda / bulário — tela com cara de WINDOWS + CRM
  // (PO 27/09: "tela do Windows com CRM de farmácia")
  const bularioTex = canvasTexture(256, (g, s) => {
    // desktop
    g.fillStyle = '#1a3a5c';
    g.fillRect(0, 0, s, s);
    // taskbar
    g.fillStyle = '#0d1b2a';
    g.fillRect(0, s - 18, s, 18);
    g.fillStyle = '#3d8bd4';
    g.fillRect(4, s - 16, 16, 14); // botão start
    // janela CRM
    g.fillStyle = '#e8ecf0';
    g.fillRect(10, 8, s - 20, s - 34);
    // titlebar
    g.fillStyle = '#2d6cb5';
    g.fillRect(10, 8, s - 20, 18);
    g.fillStyle = '#ffffff';
    g.font = `700 ${s * 0.055}px Outfit, sans-serif`;
    g.fillText(' farmaCRM — Expediente', 16, 22);
    // linha de paciente
    g.fillStyle = '#1a2027';
    g.font = `600 ${s * 0.05}px Outfit, sans-serif`;
    g.fillText('Paciente: Ana Coriza', 16, 42);
    g.fillText('Sintoma: Coriza / Nariz', 16, 56);
    g.fillStyle = '#0d9488';
    g.fillRect(14, 62, s - 28, 6); // separador teal
    // medicamentos
    g.fillStyle = '#333';
    g.fillText('Rx:', 16, 78);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i === 1 ? '#0d9488' : '#666';
      g.fillRect(30, 84 + i * 12, 60 + Math.random() * (s - 110), 5);
    }
    // botões
    g.fillStyle = '#0d9488';
    g.fillRect(s - 80, s - 40, 30, 12);
    g.fillStyle = '#fff';
    g.font = `700 ${s * 0.04}px sans-serif`;
    g.fillText('OK', s - 74, s - 31);
  }, 1, 1);
  const pcG = new THREE.Group();
  const monitor = mk(new THREE.BoxGeometry(0.42, 0.3, 0.06), M(0x1a2027, { roughness: 0.4 }));
  monitor.position.set(0, 1.2, -0.06);
  // PLANE finíssimo na face do monitor (PO 27/09: sumiu dentro — voltou a ser
  // um plano 1mm à frente da face = embutido, visível, sem alto-relevo)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.23), new THREE.MeshStandardMaterial({
    map: bularioTex, emissive: 0x2dd4bf, emissiveIntensity: 0.55, emissiveMap: bularioTex, roughness: 0.35,
    side: THREE.DoubleSide,
  }));
  screen.position.set(0, 1.2, -0.029);
  // Teclado com TECLAS individuais (PO 27/09: "teclado não parece um teclado")
  const teclado = new THREE.Group();
  const tecladoBase = mk(new THREE.BoxGeometry(0.34, 0.012, 0.13), M(0x1e2630, { roughness: 0.7 }), false);
  teclado.add(tecladoBase);
  // fileiras de teclas
  const keyMat = M(0x3a4550, { roughness: 0.55 });
  const keyMatDark = M(0x2a333c, { roughness: 0.55 });
  const keyRows = [
    { y: -0.048, n: 13, w: 0.020, h: 0.018, d: 0.016 },  // números
    { y: -0.024, n: 13, w: 0.020, h: 0.018, d: 0.016 },  // qwerty
    { y: 0.0, n: 12, w: 0.020, h: 0.018, d: 0.016 },     // asdf
    { y: 0.024, n: 11, w: 0.020, h: 0.018, d: 0.016 },   // zxcv
    { y: 0.048, n: 4, w: 0.062, h: 0.018, d: 0.016 },    // space + ctrl/alt
  ];
  for (const row of keyRows) {
    const rowWidth = row.n * (row.w + 0.002) - 0.002;
    const x0 = -rowWidth / 2 + row.w / 2;
    for (let i = 0; i < row.n; i++) {
      const key = mk(new THREE.BoxGeometry(row.w, 0.008, row.d), i === 6 && row.y === 0.048 ? keyMatDark : keyMat, false);
      key.position.set(x0 + i * (row.w + 0.002), 0.010, row.y);
      teclado.add(key);
    }
  }
  teclado.position.set(0.02, 1.072, 0.07);
  teclado.rotation.y = 0.05;
  // mouse + cabinho (26/09, PO: "não tem teclado, não tem CPU, tela vazia")
  const mouse = mk(new THREE.SphereGeometry(0.035, 10, 8), M(0x2a333c, { roughness: 0.5 }));
  mouse.scale.set(0.7, 0.45, 1);
  mouse.position.set(0.28, 1.075, 0.08);
  pcG.add(monitor, screen, teclado, mouse);
  pcG.rotation.y = 0.5;
  pcG.position.set(-1.4, 0, 1.78); // y=0: monitor/teclado já são locais (~1,2)
  scene.add(pcG);
  // CPU (torre) no chão ATRÁS do balcão, encostada (PO: "no chão, em frente
  // ao balcão, pro meu lado, o lado de trás — mas não dentro")
  const cpu = mk(new THREE.BoxGeometry(0.19, 0.42, 0.42), M(0x232b33, { roughness: 0.5, metalness: 0.3 }));
  cpu.position.set(-1.55, 0.21, 2.25);
  cpu.rotation.y = 0.15;
  scene.add(cpu);
  const cpuLed = mk(new THREE.BoxGeometry(0.012, 0.012, 0.005), M(0x4ade80, { emissive: 0x22c55e, emissiveIntensity: 2 }), false);
  cpuLed.position.set(-1.47, 0.34, 2.47);
  scene.add(cpuLed);
  addTicker((dt, t) => { cpuLed.material.emissiveIntensity = 1.2 + Math.sin(t * 2.4) * 0.8; });


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
  // Bandeja + casete + lancetador + algodão (kit de teste rápido) —
  // espaçados sem interpenetrar (26/09, PO) e SEM o GLB (os itens do
  // prop_mesa.glb se atravessavam; o procedural desta mesa é limpo)
  const bandeja = mk(new THREE.BoxGeometry(0.56, 0.035, 0.36), M(0x0f766e, { roughness: 0.4, metalness: 0.3 }));
  bandeja.position.set(0, 0.945, 0);
  mesa.add(bandeja);
  const borda = mk(new THREE.BoxGeometry(0.58, 0.012, 0.38), M(0x115e59, { roughness: 0.45 }), false);
  borda.position.set(0, 0.962, 0);
  mesa.add(borda);
  const casete = mk(new THREE.BoxGeometry(0.16, 0.045, 0.09), M(0xf8f9fa, { roughness: 0.5 }), false);
  casete.position.set(-0.16, 0.995, 0.04);
  mesa.add(casete);
  const janela = mk(new THREE.BoxGeometry(0.06, 0.012, 0.04), M(0xff9f1c, { emissive: 0xff9f1c, emissiveIntensity: 0.7 }), false);
  janela.position.set(-0.16, 1.02, 0.04);
  mesa.add(janela);
  const lancetador = mk(new THREE.CylinderGeometry(0.016, 0.02, 0.09, 10), M(0x3d5a80, { roughness: 0.45 }), false);
  lancetador.position.set(0.16, 1.0, -0.09);
  lancetador.rotation.z = 0.35;
  mesa.add(lancetador);
  for (let i = 0; i < 3; i++) {
    const algodao = mk(new THREE.SphereGeometry(0.028, 10, 8), M(0xffffff, { roughness: 1 }), false);
    algodao.position.set(0.13 + (i % 2) * 0.045, 0.985 + Math.floor(i / 2) * 0.035, 0.11);
    mesa.add(algodao);
  }
  const frasco = mk(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10), M(0x9fd8ff, { roughness: 0.3, transparent: true, opacity: 0.85 }), false);
  frasco.position.set(0.02, 1.0, -0.1);
  mesa.add(frasco);
  const tampa = mk(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 10), M(0x3d5a80, { roughness: 0.5 }), false);
  tampa.position.set(0.02, 1.05, -0.1);
  mesa.add(tampa);
  mesa.position.set(3.1, 0, 1.45);
  mesa.rotation.y = -0.35;
  // PO 25/09 (noite): mesa estava a x2.45 — 52 cm ENTERRADA no balcão (que
  // termina em x2.4). x3.1 deixa ~13 cm de folga visível entre mesa e balcão.
  scene.add(mesa);

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
  // halo suave atrás da cruz (letreiro "acende" melhor de longe)
  const halo = mk(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.14 }), false);
  halo.position.set(0, 2.1, 0.065);
  signGroup.add(halo);
  const glow = new THREE.PointLight(0x34d399, 0.55, 6);
  glow.position.set(0, 2.1, 0.5);
  signGroup.add(glow);
  signGroup.position.set(-6.2, 0, -6.4);
  scene.add(signGroup);

  // "FARMA" em letras acima do letreiro (banners procedurais)
  function bannerTex(text) {
    return canvasTexture(512, (g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#14b8a6');
      grad.addColorStop(0.55, '#0d9488');
      grad.addColorStop(1, '#0b7a6e');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      // brilho diagonal sutil
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(s * 0.42, 0); g.lineTo(s * 0.18, s); g.lineTo(0, s);
      g.closePath(); g.fill();
      // sombra + texto claro (tipografia com profundidade)
      g.fillStyle = 'rgba(4,47,66,0.5)';
      g.font = `900 ${s * 0.46}px Outfit, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, s / 2 + 8, s / 2 + 16);
      g.fillStyle = '#f0fdfa';
      g.fillText(text, s / 2, s / 2 + 6);
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
  // Gôndolas (fundo e laterais) — 27/09: esquerda afastada (PO: "uma entrando
  // na outra" — 2,4 m de largura com só 2,2 m de gap no z não bastava)
  gondola(scene, -3.2, -4.6, 0);
  gondola(scene, 0.2, -5.4, 0);
  gondola(scene, -7.8, -1.8, Math.PI / 2);
  gondola(scene, -7.8, -5.2, Math.PI / 2);
  gondola(scene, 7.6, -3.4, -Math.PI / 2);

  // Vitrine lateral com expositores — G4: GLB com fallback procedural
  const vitrineG = new THREE.Group();
  const shelfW = mk(new THREE.BoxGeometry(0.6, 2.2, 0.06), M(0x2f3e46), false);
  shelfW.position.set(0, 1.1, 0);
  vitrineG.add(shelfW);
  // −π/2 (26/09, PO: "primeiro armário à direita virado pra parede"): com +π/2
  // a frente do GLB (produtos + vidro BLEND) olhava o MURO — se via só o fundo
  // escuro ("vidro não transparente"). −π/2 vira a frente pra loja.
  propFromGLB('models/prop_vitrine.glb', vitrineG, scene, { pos: [8.2, 0, -1.5], rotY: -Math.PI / 2 });


  // Atendentes (26/09, PO: "remove os dois procedurais, coloca como a que
  // entrou") — clones da Ana com skeletonClone (skinning correto) + Idle.
  gltfLoader.loadAsync('models/ana_coriza.glb').then((g) => {
    for (const [ax, az, ary] of [[-4.4, 1.6, Math.PI + 0.25], [4.4, 1.6, Math.PI - 0.25]]) {
      const wrap = new THREE.Group();
      wrap.position.set(ax, 0, az);
      wrap.rotation.y = ary;
      const inst = skeletonClone(g.scene);
      const box = new THREE.Box3().setFromObject(inst);
      const size = box.getSize(new THREE.Vector3());
      inst.scale.setScalar(1.72 / Math.max(size.y, 1e-4));
      inst.updateMatrixWorld(true);
      inst.position.y -= new THREE.Box3().setFromObject(inst).min.y;
      wrap.add(inst);
      scene.add(wrap);
      const mx = new THREE.AnimationMixer(inst);
      const idle = g.animations.find((c) => /idle/i.test(c.name));
      if (idle) mx.clipAction(idle).play();
      const spd = 0.85 + Math.random() * 0.3; // respiração dessincronizada
      addTicker((dt) => mx.update(dt * spd));
    }
  }).catch(() => { /* fallback: sem atendentes */ });

  // ================= Ambientação =================

  // Cartazes de farmácia nas paredes (26/09: releitura — gradiente, ícone
  // de comprimido, moldura dupla e slogan em destaque)
  function posterTex(title, body) {
    return canvasTexture(512, (g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#0d9488');
      grad.addColorStop(1, '#065f56');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(94,234,212,0.6)';
      g.lineWidth = 10;
      g.strokeRect(22, 22, s - 44, s - 44);
      // comprimido/cápsula estilizada
      g.save();
      g.translate(s / 2, s * 0.32);
      g.rotate(-0.5);
      const r = s * 0.05;
      g.fillStyle = '#f0fdfa';
      g.beginPath();
      g.roundRect(-s * 0.16, -r, s * 0.32, r * 2, r);
      g.fill();
      g.fillStyle = '#5eead4';
      g.beginPath();
      g.roundRect(-s * 0.16, -r, s * 0.16, r * 2, r);
      g.fill();
      g.restore();
      g.fillStyle = '#ffffff';
      g.font = `800 ${s * 0.1}px Outfit, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(title, s / 2, s * 0.62);
      g.fillStyle = '#a7f3d0';
      g.font = `600 ${s * 0.052}px Outfit, sans-serif`;
      g.fillText(body, s / 2, s * 0.74);
      g.fillStyle = 'rgba(240,253,250,0.85)';
      g.font = `700 ${s * 0.04}px Outfit, sans-serif`;
      g.fillText('FarmaCheck', s / 2, s * 0.9);
    }, 1, 1);
  }
  const posterMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  for (const [px, pz, pry, t, b] of [
    [-8.7, -3.4, Math.PI / 2, 'Vacinação', 'Protegí a quem amas'],
    [8.7, -3.0, -Math.PI / 2, 'Teste Rápido', 'Resultado em minutos'],
    [-8.7, 1.1, Math.PI / 2, 'Farmacêutica', 'Sempre ao teu lado'],
  ]) {
    // moldura atrás do pôster (sai do "adesivo" colado na parede)
    const sgn = pry > 0 ? -1 : 1;
    const fr = mk(new THREE.BoxGeometry(1.36, 1.71, 0.05), M(0x37474f, { roughness: 0.45 }), false);
    fr.position.set(px + sgn * 0.03, 1.9, pz);
    fr.rotation.y = pry;
    scene.add(fr);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.6), posterMat(posterTex(t, b)));
    pm.position.set(px, 1.9, pz);
    pm.rotation.y = pry;
    pm.receiveShadow = true;
    scene.add(pm);
  }

  // Friso horizontal nas paredes (quebra o monólito de tinta)
  const trimMat = M(0xd9d2c0, { roughness: 0.7 });
  for (const [tx, tz, tlx, tlz] of [
    [-8.88, 0, 0.05, 13],
    [8.88, 0, 0.05, 13],
    [0, -6.38, 18, 0.05],
  ]) {
    const tr = mk(new THREE.BoxGeometry(tlx, 0.07, tlz), trimMat, false);
    tr.position.set(tx, 1.15, tz);
    scene.add(tr);
  }

  // Relógio de parede — ponteiros com PIVÔ NO CENTRO (26/09, PO: "ponteiros
  // pulados pra cada direção": eram caixas deslocadas; agora giram do pino)
  const clockG = new THREE.Group();
  const face = mk(new THREE.CylinderGeometry(0.24, 0.24, 0.035, 28), M(0xfdfcf7, { roughness: 0.45 }), false);
  face.rotation.x = Math.PI / 2;
  clockG.add(face);
  const ring = mk(new THREE.TorusGeometry(0.24, 0.028, 10, 32), M(0x8a6d3b, { metalness: 0.55, roughness: 0.35 }), false);
  clockG.add(ring);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    const tick = mk(new THREE.BoxGeometry(big ? 0.016 : 0.009, big ? 0.05 : 0.032, 0.012), M(0x2a3439, { roughness: 0.6 }), false);
    const r = big ? 0.185 : 0.2;
    tick.position.set(Math.sin(a) * r, Math.cos(a) * r, 0.022);
    tick.rotation.z = -a;
    clockG.add(tick);
  }
  const mkHand = (w, len, color, angle, z) => {
    // geometria estende do centro p/ cima; rotation.z gira em torno do pino
    const geo = new THREE.BoxGeometry(w, len, 0.01);
    geo.translate(0, len * 0.42, 0);
    const h = new THREE.Mesh(geo, M(color, { roughness: 0.5 }));
    h.castShadow = false;
    h.rotation.z = angle;
    h.position.z = z;
    return h;
  };
  clockG.add(mkHand(0.016, 0.13, 0x1a2027, -Math.PI / 2 - 0.7, 0.028));  // hora ~10:50
  clockG.add(mkHand(0.011, 0.19, 0x1a2027, 2.3, 0.03));                   // minuto
  const handS = mkHand(0.005, 0.2, 0xc0392b, -0.8, 0.032);                // segundos
  clockG.add(handS);
  addTicker((dt, t) => { handS.rotation.z = -t * 0.35; });                 // gira devagar
  const pino = mk(new THREE.SphereGeometry(0.012, 8, 8), M(0x8a6d3b, { metalness: 0.5, roughness: 0.4 }), false);
  pino.position.set(0, 0, 0.034);
  clockG.add(pino);
  clockG.position.set(1.8, 2.75, -6.37);
  scene.add(clockG);

  // Luz LED extra: fría no techo sobre el balcón + cálida en góndolas
  // (PO 26/09: ambiente uniforme — 2ª luz de preenchimento no fundo + hemisférica)
  const led = new THREE.PointLight(0xeaf4ff, 0.8, 16);
  led.position.set(0, 3.6, 1.0);
  scene.add(led);
  const ledFundo = new THREE.PointLight(0xeaf4ff, 0.6, 16);
  ledFundo.position.set(0, 3.6, -4.0);
  scene.add(ledFundo);
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