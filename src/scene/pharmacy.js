import * as THREE from 'three';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
const mk = (geo, mat, cast = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};
const rnd = (a, b) => a + Math.random() * (b - a);

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

// Piso cerâmico 40x40 com juntas e variação sutil
function tileTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#c7ced4';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${140 + (Math.random() * 40) | 0},${148 + (Math.random() * 36) | 0},${156 + (Math.random() * 32) | 0},${rnd(0.04, 0.12)})`;
      g.fillRect(Math.random() * s, Math.random() * s, 3, 3);
    }
    g.strokeStyle = 'rgba(90,100,110,0.5)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, s - 3, s - 3);
  }, 10, 7);
}

// Parede com textura de tinta sutil + rodapé
function wallTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#e9e4da';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(${170 + (Math.random() * 60) | 0},${160 + (Math.random() * 50) | 0},${140 + (Math.random() * 50) | 0},${rnd(0.03, 0.08)})`;
      g.fillRect(Math.random() * s, Math.random() * s, 4, 4);
    }
  }, 8, 4);
}

// Madeira do balcão (veios)
function woodTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#8a5a33';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const y = Math.random() * s;
      g.strokeStyle = `rgba(60,35,15,${rnd(0.06, 0.18)})`;
      g.lineWidth = rnd(1, 4);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 24) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 5);
      g.stroke();
    }
  }, 3, 1);
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
  scene.add(g);
  return g;
}

function attendant(scene, addTicker, x, z, color) {
  const g = new THREE.Group();
  const body = mk(new THREE.CapsuleGeometry(0.16, 0.55, 4, 8), M(color));
  body.position.y = 1.05;
  const head = mk(new THREE.SphereGeometry(0.12, 12, 10), M(0xd9b08c));
  head.position.y = 1.62;
  g.add(body, head);
  g.position.set(x, 0, z);
  g.rotation.y = 0.5;
  scene.add(g);
  addTicker((dt, t) => {
    g.position.y = Math.sin(t * 1.3 + x) * 0.012;
    head.rotation.y = Math.sin(t * 0.6 + x) * 0.3;
  });
}

export function buildPharmacy(scene, addTicker) {
  const floor = mk(new THREE.PlaneGeometry(18, 13), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.9 }), false);
  floor.rotation.x = -Math.PI / 2;
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

  // Balcão principal (madeira + tampo)
  const base = mk(new THREE.BoxGeometry(4.6, 1.0, 0.75), M(0x2f3e46, { roughness: 0.5 }));
  base.position.set(0, 0.5, 1.55);
  scene.add(base);
  const top = mk(new THREE.BoxGeometry(4.8, 0.06, 0.95), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.35 }));
  top.position.set(0, 1.03, 1.55);
  scene.add(top);
  const band = mk(new THREE.BoxGeometry(4.6, 0.1, 0.02), M(0x0d9488, { emissive: 0x0d9488, emissiveIntensity: 0.4 }), false);
  band.position.set(0, 0.86, 1.16);
  scene.add(band);

  // Monitor do ponto de venda (tela emissiva)
  const monitor = mk(new THREE.BoxGeometry(0.42, 0.3, 0.06), M(0x1a2027, { roughness: 0.4 }));
  monitor.position.set(-1.4, 1.2, 1.72);
  monitor.rotation.y = 0.5;
  scene.add(monitor);
  const screen = mk(new THREE.BoxGeometry(0.36, 0.23, 0.012), M(0x9fd8ff, { emissive: 0x3b82f6, emissiveIntensity: 0.9 }), false);
  screen.position.set(-1.4, 1.2, 1.75);
  screen.rotation.y = 0.5;
  scene.add(screen);

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
  const glow = new THREE.PointLight(0x34d399, 1.6, 6);
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
  const banner = mk(new THREE.BoxGeometry(4.4, 0.62, 0.06), new THREE.MeshStandardMaterial({ map: bannerTex('FARMA'), emissive: 0x0f766e, emissiveIntensity: 0.35, emissiveMap: bannerTex('FARMA') }), false);
  banner.position.set(0, 3.15, -6.38);
  scene.add(banner);

  // Porta de entrada (vidro)
  const doorFrame = mk(new THREE.BoxGeometry(1.6, 2.3, 0.14), M(0x37474f));
  doorFrame.position.set(3.2, 1.15, -6.36);
  scene.add(doorFrame);
  const doorGlass = mk(new THREE.BoxGeometry(1.4, 2.1, 0.06), M(0x9fc4d0, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.75 }), false);
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

  // Vitrine lateral com expositores
  const shelfW = mk(new THREE.BoxGeometry(0.6, 2.2, 0.06), M(0x2f3e46), false);
  shelfW.position.set(8.2, 1.1, -1.5);
  shelfW.rotation.y = Math.PI / 2;
  scene.add(shelfW);

  // Atendentes de fundo
  attendant(scene, addTicker, -5.2, 1.9, 0x8d99ae);
  attendant(scene, addTicker, 5.2, 1.9, 0xb08968);

  return { scene };
}