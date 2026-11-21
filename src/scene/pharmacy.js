import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadPharmacyCharacter, loadPharmacyProp } from './pharmacyProps.js';
import { verticalAxisCorrection } from './characterOrientation.js';

// Templates compartilhados entre props; cada colocação mantém seu próprio transform.
// 29/09: loader COMPARTILHADO com MeshoptDecoder (antes: new GLTFLoader()
// sem decoder → o ana_coriza.glb meshopt-comprimido FALHAVA no parse e a
// aten­dente caía no .catch silencioso — e no browser do PO o cache de disco
// entregava o GLB VELHO não-comprimido (era quebrada) que parseava →
// atendentes-clone esticadas no balcão).

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
const mk = (geo, mat, cast = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};
const rnd = (a, b) => a + Math.random() * (b - a);

// URLs stay explicit so the normal game build includes these approved models.
const ATTENDANT_MODELS = Object.freeze({
  counter: 'models/candidates/atendente_balcon_voxel_walkidle_candidate_v024_fairing_preserve_normals.glb',
  gondola: 'models/candidates/atendente_gondola_voxel_walkidle_candidate_v004_fitted_reweighted.glb',
});

  // Iluminação por ambiente via RoomEnvironment + ajuste fino (reflexos suaves)
  // Direção de arte: estilizado casual — ver docs/DIRETRIZES_ARTE_ESTILIZADA.md
  // PO 26/09 (juiz): "iluminação irregular, metade escura" — ambiente levantado
  function makeEnvironment(scene, renderer) {
    if (!renderer) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envTex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();
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
  skyMesh.position.set(0, 4, -13.2);
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
    b.position.set(px + w / 2, h / 2, -11.5);
    b.rotation.y = rng(-0.06, 0.06);
    // A entrada olha para uma faixa livre de rua, não para um bloco encostado no vidro.
    const blocksDoor = b.position.x + w / 2 > 2.0 && b.position.x - w / 2 < 4.4;
    if (!blocksDoor) scene.add(b);
    // janelinhas acesas
    const jn = Math.floor(rng(2, 4));
    for (let k = 0; k < jn; k++) {
      const jw = rng(0.1, 0.3), jh = rng(0.14, 0.24);
      const jm = new THREE.Mesh(new THREE.PlaneGeometry(jw, jh), winMat(k % 2 ? 0xffd9a0 : 0xfff2d0));
      const y = rng(0.4, h - 0.5);
      const zz = -11.5 + 0.82;
      jm.position.set(b.position.x + rng(-w / 2 + 0.2, w / 2 - 0.2), y, zz);
      jm.rotation.y = 0;
      if (!blocksDoor) scene.add(jm);
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
  const lampBulb = mk(
    new THREE.SphereGeometry(0.065, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc77a, toneMapped: false }),
    false,
  );
  lampBulb.name = 'pharmacy:outdoor-lamp-bulb';
  lampBulb.position.set(-2.6, 3.34, -8.15);
  scene.add(lampBulb);
}
function propFromGLB(url, fallback, scene, { pos = [0, 0, 0], rotY = 0 } = {}) {
  fallback.name = `fallback:${url}`;
  fallback.userData.propLoad = { url, status: 'loading' };
  fallback.position.set(...pos);
  fallback.rotation.y = rotY;
  scene.add(fallback);
  loadPharmacyProp(url).then((model) => {
    model.name = `asset:${url}`;
    model.position.set(...pos);
    model.rotation.y = rotY;
    scene.add(model);
    fallback.visible = false;
    fallback.userData.propLoad.status = 'loaded';
  }).catch((error) => {
    fallback.userData.propLoad.status = 'fallback';
    console.warn(`[props] ${url}: usando cenário procedural`, error.message);
  });
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
    g.fillStyle = '#DDE3E8';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#E5E9EC';
    g.fillRect(4, 4, s - 8, s - 8);
    g.strokeStyle = '#BEC8CF';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, s - 3, s - 3);
  }, 45, 32.5);
}

function tileMaterial() {
  return new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: .72, metalness: 0 });
}

function wallTexture() {
  return canvasTexture(256, (g, s) => {
    const paint = g.createLinearGradient(0, 0, 0, s);
    paint.addColorStop(0, '#F7F4EA');
    paint.addColorStop(1, '#ECE8DC');
    g.fillStyle = paint;
    g.fillRect(0, 0, s, s);
  });
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
const fallbackProductGeometry = new THREE.BoxGeometry(0.13, 0.18, 0.12);
const fallbackProductMaterials = BOX_COLORS.map((color) => M(color));

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
const labelTextures = new Map();
function medLabelTexture(idx) {
  idx %= MED_COLORS.length;
  if (labelTextures.has(idx)) return labelTextures.get(idx);
  const [bg, fg] = MED_COLORS[idx % MED_COLORS.length];
  const texture = canvasTexture(128, (g, s) => {
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
  labelTextures.set(idx, texture);
  return texture;
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

function batchLoadedGondolas(scene, placements, expectedCount) {
  if (placements.length !== expectedCount) return false;
  scene.updateMatrixWorld(true);
  const clusters = new Map();
  for (const placement of placements) {
    const cluster = placement.userData.batchCluster;
    if (!clusters.has(cluster)) clusters.set(cluster, { placements: [], groups: new Map() });
    const entry = clusters.get(cluster);
    entry.placements.push(placement);
    const placementGroups = new Map();
    placement.traverse((node) => {
      if (!node.isMesh || !node.material || Array.isArray(node.material)) return;
      const key = [node.geometry.id, node.material.id, node.castShadow ? 1 : 0,
        node.receiveShadow ? 1 : 0, node.renderOrder, node.layers.mask].join(':');
      if (!placementGroups.has(key)) placementGroups.set(key, []);
      placementGroups.get(key).push(node);
    });
    for (const [key, meshes] of placementGroups) {
      if (!entry.groups.has(key)) entry.groups.set(key, []);
      entry.groups.get(key).push(...meshes);
    }
  }
  const batched = [...clusters.values()].filter((cluster) => cluster.placements.length > 1);
  if (!batched.length || batched.some((cluster) => !cluster.groups.size
    || [...cluster.groups.values()].some((meshes) => meshes.length !== cluster.placements.length))) return false;

  const batch = new THREE.Group();
  batch.name = 'batch:gondola';
  let index = 0;
  for (const cluster of batched) {
    for (const meshes of cluster.groups.values()) {
      const source = meshes[0];
      const instances = new THREE.InstancedMesh(source.geometry, source.material, meshes.length);
      instances.name = `batch:gondola:${index++}`;
      instances.castShadow = source.castShadow;
      instances.receiveShadow = source.receiveShadow;
      instances.renderOrder = source.renderOrder;
      instances.layers.mask = source.layers.mask;
      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      meshes.forEach((mesh, i) => instances.setMatrixAt(i, mesh.matrixWorld));
      instances.computeBoundingBox();
      instances.computeBoundingSphere();
      batch.add(instances);
    }
  }
  batch.userData.instances = batched.reduce((total, cluster) => total + cluster.placements.length, 0);
  scene.add(batch);
  batched.forEach((cluster) => cluster.placements.forEach((placement) => { placement.visible = false; }));
  return true;
}

function buildGondolaFallback(g) {
  const W = 2.4, D = 0.5, H = 1.92, SHELVES = 4;
  const frame = M(0x5b6770, { roughness: 0.5 });
  for (const side of [-1, 1]) {
    const panel = mk(new THREE.BoxGeometry(0.06, H, D), frame);
    panel.position.set((side * W) / 2, H / 2, 0);
    g.add(panel);
  }
  const header = mk(new THREE.BoxGeometry(W, 0.18, 0.07), M(0x0d9488, { emissive: 0x0d9488, emissiveIntensity: 0.35 }));
  header.position.set(0, H + 0.09, 0);
  g.add(header);
  // O mesmo cenário procedural aparece durante a carga e fica como fallback em erro.
  const back = mk(new THREE.BoxGeometry(W, H, 0.04), M(0x4a545c, { roughness: 0.6 }), false);
  back.position.set(0, H / 2, -D / 2 - 0.02);
  g.add(back);
  const productsByMaterial = fallbackProductMaterials.map(() => []);
  const productTransform = new THREE.Object3D();
  for (let i = 0; i < SHELVES; i++) {
    const y = 0.42 + i * 0.44;
    const shelf = mk(new THREE.BoxGeometry(W, 0.045, D), frame);
    shelf.position.y = y;
    g.add(shelf);
    for (let j = 0; j < 10; j++) {
      productTransform.position.set(-1.05 + j * 0.23, y + 0.1125, 0);
      productTransform.updateMatrix();
      productsByMaterial[j % productsByMaterial.length].push(productTransform.matrix.clone());
    }
  }
  productsByMaterial.forEach((matrices, materialIndex) => {
    const products = new THREE.InstancedMesh(fallbackProductGeometry, fallbackProductMaterials[materialIndex], matrices.length);
    products.name = `gondola:fallback-products:${materialIndex}`;
    products.castShadow = false;
    products.receiveShadow = true;
    products.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    matrices.forEach((matrix, index) => products.setMatrixAt(index, matrix));
    products.computeBoundingBox();
    products.computeBoundingSphere();
    g.add(products);
  });
}

function gondola(scene, x, z, ry, batchState, batchCluster) {
  const g = new THREE.Group();
  g.name = `fallback:gondola:${x}:${z}`;
  g.userData.propLoad = { url: 'models/candidates/prop_gondola_v002.glb?v=2', status: 'loading' };
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  buildGondolaFallback(g);
  scene.add(g);
  // GLB com frente original + ESCALA NORMALIZADA (26/09: o GLB renderizava a
  // ~50% — frame y≈1,0, caixas y≈0,6). Mede o bbox e casa com o fallback
  // (2,4 × 2,1 × 0,5) + rótulos de marca nos remédios do MEIO (bx*).
  loadPharmacyProp('models/candidates/prop_gondola_v002.glb?v=2', (template) => {
    let mi = 0;
    const labeledMaterials = new Map();
    template.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const nm = (o.material.name || '').toLowerCase();
      if (/^bx/.test(nm)) {
        const original = o.material;
        if (!labeledMaterials.has(original)) {
          const labeled = original.clone();
          labeled.map = medLabelTexture(mi++);
          labeledMaterials.set(original, labeled);
        }
        o.material = labeledMaterials.get(original);
      }
    });
  }).then((model) => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sc = new THREE.Vector3(2.4 / Math.max(size.x, 1e-4), 2.1 / Math.max(size.y, 1e-4), 0.5 / Math.max(size.z, 1e-4));
    model.scale.copy(sc);
    model.position.set(-center.x * sc.x, -box.min.y * sc.y, -center.z * sc.z);
    const placed = new THREE.Group();
    placed.name = `asset:gondola:${x}:${z}`;
    placed.position.set(x, 0, z);
    placed.rotation.y = ry;
    placed.userData.batchCluster = batchCluster;
    placed.add(model);
    scene.add(placed);
    g.visible = false;
    batchState.placements.push(placed);
    if (batchState.placements.length === batchState.expected) {
      batchLoadedGondolas(scene, batchState.placements, batchState.expected);
    }
    g.userData.propLoad.status = 'loaded';
  }).catch((error) => {
    g.userData.propLoad.status = 'fallback';
    g.visible = true;
    console.warn('[props] gôndola: usando cenário procedural', error.message);
  });
  return g;
}

function attendant(scene, addTicker, x, z, color, { role, modelUrl, reducedMotion }) {
  const g = new THREE.Group();
  g.name = `pharmacy:attendant:${role}`;
  g.userData.ambientCharacter = { role, url: modelUrl, status: 'loading' };
  const body = mk(new THREE.CapsuleGeometry(0.16, 0.55, 4, 8), M(color));
  body.position.y = 1.05;
  const head = mk(new THREE.SphereGeometry(0.12, 12, 10), M(0xd9b08c));
  head.position.y = 1.62;
  g.add(body, head);
  g.rotation.y = 0.5;
  g.position.set(x, 0, z);
  scene.add(g);
  if (!reducedMotion) addTicker((dt, t) => {
    g.position.y = Math.sin(t * 1.3 + x) * 0.012;
    head.rotation.y = Math.sin(t * 0.6 + x) * 0.3;
  });

  loadPharmacyCharacter(modelUrl).then(({ model, animations }) => {
    // SkeletonUtils.clone cria os bones e o bind, mas a cópia ainda não tem
    // boneMatrices atualizadas. Box3.setFromObject consulta a pose skinned;
    // sem este refresh, os limites podem assumir metros fora da malha e o
    // recenter abaixo joga o atendente através de toda a farmácia.
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      if (node.isSkinnedMesh) node.skeleton.update();
    });
    model.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(model);
    let size = bounds.getSize(new THREE.Vector3());
    const axisCorrection = verticalAxisCorrection(size);
    if (axisCorrection) {
      model.rotation.x = axisCorrection;
      model.updateMatrixWorld(true);
      model.traverse((node) => {
        if (node.isSkinnedMesh) node.skeleton.update();
      });
      model.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(model);
      size = bounds.getSize(new THREE.Vector3());
    }
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('modelo sem altura válida');
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.72 / size.y;
    const normalizedWidth = size.x * scale;
    const normalizedDepth = size.z * scale;
    if (normalizedWidth > 1 || normalizedDepth > 1) {
      throw new Error(`dimensões horizontais fora do limite após corrigir eixo (${normalizedWidth.toFixed(2)} × ${normalizedDepth.toFixed(2)} m)`);
    }
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      if (node.isSkinnedMesh) node.skeleton.update();
    });
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });

    const idle = animations.find((clip) => /^idle$/i.test(clip.name));
    if (!idle) throw new Error('clip Idle ausente');
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(idle);
    action.play();
    if (reducedMotion) {
      mixer.update(0);
      mixer.stopAllAction();
    } else addTicker((dt) => mixer.update(dt));

    for (const child of g.children) {
      if (!child.isMesh) continue;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material?.dispose();
    }
    g.clear();
    model.name = `model:${role}`;
    g.add(model);
    g.userData.ambientCharacter = {
      role,
      url: modelUrl,
      status: 'loaded',
      animation: idle.name,
      height: size.y * scale,
      dimensions: [normalizedWidth, 1.72, normalizedDepth],
      axisCorrection: axisCorrection ? 'z-up' : 'y-up',
      skinnedMeshes: countSkinnedMeshes(model),
      reducedMotion,
    };
  }).catch((error) => {
    g.userData.ambientCharacter.status = 'fallback';
    g.userData.ambientCharacter.error = error.message;
    console.warn(`[attendant] ${role}: mantendo personagem procedural`, error.message);
  });
}

function countSkinnedMeshes(root) {
  let count = 0;
  root.traverse((node) => { if (node.isSkinnedMesh) count += 1; });
  return count;
}

export function buildPharmacy(scene, addTicker, renderer) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const ns1Lancet = new THREE.Group();
  ns1Lancet.name = 'farmacheck:ns1-fingerstick-lancet';
  const ns1Blue = M(0x2d6a91, { roughness: 0.42, metalness: 0.18 });
  const ns1White = M(0xf4f8fb, { roughness: 0.38, metalness: 0.08 });
  ns1Lancet.add(mk(new THREE.BoxGeometry(0.105, 0.034, 0.044), ns1Blue, false));
  const lancetGrip = mk(new THREE.BoxGeometry(0.042, 0.039, 0.046), ns1White, false);
  lancetGrip.position.z = -0.035;
  ns1Lancet.add(lancetGrip);
  const lancetButton = mk(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 10), M(0xe66b62), false);
  lancetButton.position.set(0, 0.02, -0.018);
  ns1Lancet.add(lancetButton);
  const lancetNose = mk(new THREE.ConeGeometry(0.008, 0.036, 10), ns1White, false);
  lancetNose.rotation.x = Math.PI / 2;
  lancetNose.position.z = 0.037;
  ns1Lancet.add(lancetNose);
  const bloodDrop = mk(new THREE.SphereGeometry(0.012, 10, 8), M(0xc84552, { roughness: 0.3, emissive: 0x51050e, emissiveIntensity: 0.2 }), false);
  bloodDrop.name = 'farmacheck:ns1-sample-drop';
  bloodDrop.visible = false;
  scene.add(bloodDrop);
  ns1Lancet.visible = false;
  scene.add(ns1Lancet);
  let ns1Motion = null;
  let ns1ContactCount = 0;
  let ns1StartFailure = null;
  let ns1HandBones = [];
  const ns1Start = new THREE.Vector3(0.38, 1.42, 2.08);
  const ns1Forward = new THREE.Vector3(0, 0, 1);
  const ns1Direction = new THREE.Vector3();
  const ns1Target = new THREE.Vector3();
  const ns1Near = new THREE.Vector3();
  const ns1Ease = (v) => v * v * (3 - 2 * v);
  const hideNs1Animation = () => {
    ns1Motion = null;
    ns1Lancet.visible = false;
    bloodDrop.visible = false;
  };
  const playNs1Fingerstick = (avatar) => {
    hideNs1Animation();
    ns1StartFailure = null;
    ns1HandBones = [];
    if (reducedMotion.matches) {
      ns1StartFailure = 'reduced-motion';
      return false;
    }
    const model = avatar?.getModel?.();
    if (!model) {
      ns1StartFailure = 'avatar-model-unavailable';
      return false;
    }
    const normalizeBoneName = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isIndexTip = (name) => {
      const normalized = normalizeBoneName(name);
      return normalized.includes('mixamoringlefthandindex4') || normalized.includes('mixamorigrighthandindex4')
        || normalized.endsWith('lefthandindex4') || normalized.endsWith('righthandindex4');
    };
    let bone = model.getObjectByName('mixamorig:LeftHandIndex4')
      || model.getObjectByName('mixamorig:RightHandIndex4');
    if (!bone) {
      model.traverse((node) => {
        if (!node.isBone) return;
        if (/Hand(?:Index|Thumb|Middle|Ring|Pinky)/i.test(node.name || '')) ns1HandBones.push(node.name);
        if (!bone && isIndexTip(node.name)) bone = node;
      });
    }
    if (!bone) {
      model.traverse((node) => {
        for (const candidate of node.skeleton?.bones || []) {
          if (/Hand(?:Index|Thumb|Middle|Ring|Pinky)/i.test(candidate.name || '') && !ns1HandBones.includes(candidate.name)) {
            ns1HandBones.push(candidate.name);
          }
          if (!bone && isIndexTip(candidate.name)) bone = candidate;
        }
      });
    }
    if (!bone) {
      ns1StartFailure = 'index-finger-bone-unavailable';
      return false;
    }
    model.updateMatrixWorld(true);
    bone.updateWorldMatrix(true, false);
    bone.getWorldPosition(ns1Target);
    ns1Motion = { bone, elapsed: 0, phase: 'camera' };
    ns1Lancet.position.copy(ns1Start);
    ns1Lancet.visible = true;
    return true;
  };
  addTicker((dt) => {
    if (!ns1Motion) return;
    const motion = ns1Motion;
    motion.elapsed += dt;
    motion.bone.updateWorldMatrix(true, false);
    motion.bone.getWorldPosition(ns1Target);
    ns1Direction.copy(ns1Target).sub(ns1Start).normalize();
    ns1Near.copy(ns1Target).addScaledVector(ns1Direction, -0.078);
    ns1Lancet.quaternion.setFromUnitVectors(ns1Forward, ns1Direction);
    if (motion.elapsed < 0.75) {
      motion.phase = 'camera';
      ns1Lancet.position.copy(ns1Start);
      bloodDrop.visible = false;
      return;
    }
    const t = motion.elapsed - 0.75;
    if (t < 0.62) {
      motion.phase = 'approach';
      ns1Lancet.position.lerpVectors(ns1Start, ns1Near, ns1Ease(t / 0.62));
      bloodDrop.visible = false;
    } else if (t < 1.05) {
      motion.phase = 'finger-contact';
      const press = Math.min(1, (t - 0.62) / 0.13);
      ns1Lancet.position.lerpVectors(ns1Near, ns1Target, ns1Ease(press));
      bloodDrop.position.copy(ns1Target);
      bloodDrop.visible = t >= 0.76;
      if (!motion.contacted) {
        motion.contacted = true;
        ns1ContactCount++;
      }
    } else if (t < 1.7) {
      motion.phase = 'retract';
      ns1Lancet.position.lerpVectors(ns1Target, ns1Start, ns1Ease((t - 1.05) / 0.65));
      bloodDrop.visible = t < 1.3;
    } else {
      hideNs1Animation();
    }
  });
  // Primeiro balcão validado. O legado segue disponível para comparação/rollback.
  const counterPreview = new URLSearchParams(window.location.search).get('artPreview') !== 'balcaoLegacy';
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
  // Vão real de 1,6 × 2,3 m: vidro e rua antes ficavam atrás de um muro maciço.
  mkWall(11.4, 3.8, 0.2, -3.3, 1.9, -6.5);
  mkWall(5.0, 3.8, 0.2, 6.5, 1.9, -6.5);
  mkWall(1.6, 1.5, 0.2, 3.2, 3.05, -6.5);
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
  for (let sx = -2.2; !counterPreview && sx <= 2.21; sx += 0.37) {
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
  propFromGLB(counterPreview ? 'models/candidates/prop_balcao_v001.glb?v=1' : 'models/prop_balcao.glb', balcaoG, scene, { pos: [0, 0, 1.55] });


  // Monitor do ponto de venda / bulário — tela com cara de WINDOWS + CRM
  // (PO 27/09: "tela do Windows com CRM de farmácia")
  function drawBulario(g, s, patient = null, english = false) {
    const k = s / 256;
    g.save();
    g.scale(k, k);
    s = 256;
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
    g.fillText(english ? ' farmaCRM — Shift' : ' farmaCRM — Expediente', 16, 22);
    // linha de paciente
    g.fillStyle = '#1a2027';
    g.font = `600 ${s * 0.05}px Outfit, sans-serif`;
    const name = patient?.persona?.nome || (english ? 'Waiting' : 'Aguardando');
    const patientLine = `${english ? 'Patient' : 'Paciente'}: ${name}`;
    // Dados visíveis do caso; a tela não antecipa sintomas ou fatos bloqueados.
    g.fillText(patientLine, 16, 42, s - 32);
    g.fillText(english ? 'Interview record' : 'Registro de anamnese', 16, 56);
    g.fillStyle = '#0d9488';
    g.fillRect(14, 62, s - 28, 6); // separador teal
    // medicamentos
    g.fillStyle = '#333';
    g.fillText('Rx:', 16, 78);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i === 1 ? '#0d9488' : '#666';
      g.fillRect(30, 84 + i * 12, [160, 110, 140][i], 5);
    }
    // botões
    g.fillStyle = '#0d9488';
    g.fillRect(s - 80, s - 40, 30, 12);
    g.fillStyle = '#fff';
    g.font = `700 ${s * 0.04}px sans-serif`;
    g.fillText('OK', s - 74, s - 31);
    g.restore();
  }
  const bularioTex = canvasTexture(512, (g, s) => drawBulario(g, s), 1, 1);
  const setCase = (patient, english = false) => {
    const canvas = bularioTex.image;
    drawBulario(canvas.getContext('2d'), canvas.width, patient, english);
    bularioTex.needsUpdate = true;
  };
  const pcG = new THREE.Group();
  const monitor = mk(new THREE.BoxGeometry(0.42, 0.3, 0.06), M(0x1a2027, { roughness: 0.4 }));
  monitor.position.set(0, 1.2, -0.06);
  // PLANE finíssimo na face do monitor (PO 27/09: sumiu dentro — voltou a ser
  // um plano 1mm à frente da face = embutido, visível, sem alto-relevo)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.23), new THREE.MeshStandardMaterial({
    map: bularioTex, emissive: 0x2dd4bf, emissiveIntensity: 0.55, emissiveMap: bularioTex, roughness: 0.35,
    side: THREE.DoubleSide,
  }));
  screen.name = 'pharmacy:crm-screen';
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
  pcG.add(monitor, teclado, mouse);
  pcG.rotation.y = 0.5;
  pcG.position.set(-1.4, 0, 1.78); // y=0: monitor/teclado já são locais (~1,2)
  propFromGLB('models/candidates/prop_pc_v002.glb?v=2', pcG, scene, { pos: [-1.4, 0, 1.78], rotY: .5 });
  const screenG = new THREE.Group();
  screen.position.set(0, 1.21, -.0275);
  screenG.add(screen);
  screenG.position.set(-1.4, 0, 1.78);
  screenG.rotation.y = .5;
  scene.add(screenG);
  // CPU (torre) no chão ATRÁS do balcão, encostada (PO: "no chão, em frente
  // ao balcão, pro meu lado, o lado de trás — mas não dentro")
  const cpu = mk(new THREE.BoxGeometry(0.19, 0.42, 0.42), M(0x232b33, { roughness: 0.5, metalness: 0.3 }));
  cpu.position.set(-1.55, 0.21, 2.25);
  cpu.rotation.y = 0.15;
  const cpuFallback = new THREE.Group();
  cpu.position.set(0, .21, 0);
  cpu.rotation.y = 0;
  cpuFallback.add(cpu);
  propFromGLB('models/candidates/prop_cpu_v002.glb?v=2', cpuFallback, scene, { pos: [-1.55, 0, 2.25], rotY: .15 });
  const cpuLed = mk(new THREE.BoxGeometry(0.012, 0.012, 0.005), M(0x4ade80, { emissive: 0x22c55e, emissiveIntensity: 2 }), false);
  cpuLed.position.set(-1.47, 0.34, 2.47);
  scene.add(cpuLed);
  addTicker((dt, t) => { cpuLed.material.emissiveIntensity = reducedMotion.matches ? 1.2 : 1.2 + Math.sin(t * 2.4) * .8; });


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
  propFromGLB('models/candidates/prop_mesa_v002.glb?v=2', mesa, scene, { pos: [3.1, 0, 1.45], rotY: -.35 });

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
  const doorFrame = new THREE.Group();
  const frameMat = M(0x37414b, { metalness: .1, roughness: .65 });
  for (const x of [2.44, 3.96]) {
    const post = mk(new THREE.BoxGeometry(.08, 2.3, .14), frameMat);
    post.position.set(x, 1.15, -6.36);
    doorFrame.add(post);
  }
  const lintel = mk(new THREE.BoxGeometry(1.6, .08, .14), frameMat);
  lintel.position.set(3.2, 2.26, -6.36);
  doorFrame.add(lintel);
  scene.add(doorFrame);
  const doorGlass = mk(new THREE.BoxGeometry(1.4, 2.1, 0.018), M(0xbddce0, { roughness: .5, metalness: 0, transparent: true, opacity: .18, depthWrite: false }), false);
  doorGlass.position.set(3.2, 1.1, -6.28);
  scene.add(doorGlass);
  const doorHandle = mk(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), M(0xffd9a0, { metalness: 0.9, roughness: 0.2 }), false);
  doorHandle.position.set(3.85, 1.1, -6.28);
  doorHandle.rotation.z = Math.PI / 2;
  scene.add(doorHandle);

  // Gôndolas (fundo e laterais)
  // Gôndolas (fundo e laterais) — 27/09: esquerda afastada (PO: "uma entrando
  // na outra" — 2,4 m de largura com só 2,2 m de gap no z não bastava)
  const gondolaBatch = { expected: 5, placements: [] };
  gondola(scene, -3.2, -4.6, 0, gondolaBatch, 'front');
  gondola(scene, 0.2, -5.4, 0, gondolaBatch, 'front');
  gondola(scene, -7.8, -1.8, Math.PI / 2, gondolaBatch, 'left-upper');
  gondola(scene, -7.8, -5.2, Math.PI / 2, gondolaBatch, 'left-lower');
  gondola(scene, 7.6, -3.4, -Math.PI / 2, gondolaBatch, 'right');

  // Vitrine lateral com expositores — G4: GLB com fallback procedural
  const vitrineG = new THREE.Group();
  const shelfW = mk(new THREE.BoxGeometry(0.6, 2.2, 0.06), M(0x2f3e46), false);
  shelfW.position.set(0, 1.1, 0);
  vitrineG.add(shelfW);
  // −π/2 (26/09, PO: "primeiro armário à direita virado pra parede"): com +π/2
  // a frente do GLB (produtos + vidro BLEND) olhava o MURO — se via só o fundo
  // escuro ("vidro não transparente"). −π/2 vira a frente pra loja.
  propFromGLB('models/candidates/prop_vitrine_v002.glb?v=2', vitrineG, scene, { pos: [8.2, 0, -1.5], rotY: -Math.PI / 2 });


  // Personagens ambientais não interativos, em posições usadas anteriormente.
  attendant(scene, addTicker, -5.2, 1.9, 0x8d99ae, {
    role: 'counter', modelUrl: ATTENDANT_MODELS.counter, reducedMotion: reducedMotion.matches,
  });
  attendant(scene, addTicker, 5.2, 1.9, 0xb08968, {
    role: 'gondola', modelUrl: ATTENDANT_MODELS.gondola, reducedMotion: reducedMotion.matches,
  });

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
    [-8.7, -3.4, Math.PI / 2, 'Vacinação', 'Proteja quem você ama'],
    [8.7, -3.0, -Math.PI / 2, 'Teste Rápido', 'Resultado em minutos'],
    [-8.7, 1.1, Math.PI / 2, 'Farmacêutica', 'Sempre ao seu lado'],
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
    [-3.3, -6.38, 11.4, 0.05],
    [6.5, -6.38, 5, 0.05],
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
  const ring = mk(new THREE.TorusGeometry(0.24, 0.028, 10, 32), M(0xb89068, { metalness: .15, roughness: .55 }), false);
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
  addTicker((dt, t) => { if (!reducedMotion.matches) handS.rotation.z = -t * .35; });
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

  return {
    scene,
    setCase,
    playNs1Fingerstick,
    cancelNs1Fingerstick: hideNs1Animation,
    getNs1FingerstickDiagnostics: () => ({
      running: Boolean(ns1Motion),
      phase: ns1Motion?.phase || 'idle',
      targetBone: ns1Motion?.bone.name || null,
      elapsed: ns1Motion?.elapsed ?? null,
      targetPosition: { x: ns1Target.x, y: ns1Target.y, z: ns1Target.z },
      startFailure: ns1StartFailure,
      availableHandBones: ns1HandBones,
      contactCount: ns1ContactCount,
      deviceVisible: ns1Lancet.visible,
    }),
  };
}
