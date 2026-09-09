import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...opts });
const mk = (geo, mat) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
};
const rnd = (a, b) => a + Math.random() * (b - a);

// Posturas semiológicas — pivôs em grupos (padrão Codrops): torso gira no quadril, cabeça no pescoço.
const POSES = {
  idle:         { torso: 0.00, head: 0.03, armLx: 0.10, armLz: 0.12, armRx: 0.10, armRz: -0.12 },
  mao_no_peito: { torso: 0.05, head: 0.16, armLx: 0.10, armLz: 0.14, armRx: -1.30, armRz: -0.60 },
  curvado:      { torso: 0.32, head: 0.46, armLx: -0.30, armLz: 0.14, armRx: -0.30, armRz: -0.14 },
  cabeca_baixa: { torso: 0.10, head: 0.58, armLx: 0.10, armLz: 0.12, armRx: 0.10, armRz: -0.12 },
};
export const POSE_FRASE = {
  mao_no_peito: 'aperta o peito com a mão',
  curvado: 'se curva, como se o corpo pesasse',
  cabeca_baixa: 'abaixa a cabeça, visivelmente cansado',
};

// Proporções cartoon (Codrops): cabeça ~1/5 da altura, corpo arredondado, rosto expressivo.
export class PatientAvatar {
  constructor(scene) {
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.matSkin = M(0xd9a066, { roughness: 0.55 });
    this.matShirt = M(0x8b8378, { roughness: 0.65 });
    this.matPants = M(0x37414b, { roughness: 0.7 });
    this.matHair = M(0x4a4a4a, { roughness: 0.8 });
    this.matShoe = M(0x22262a, { roughness: 0.4 });
    this.matAccent = M(0xf28f3b, { roughness: 0.5 });
    this.cur = { ...POSES.idle };
    this.target = POSES.idle;
    this.walking = null;
    this.mood = 'neutro';
    this._blink = 2;
    this._blinkT = 0;
    this._glance = 0;

    const root = (this.root = new THREE.Group());

    // ---- Pernas (pivô no quadril) ----
    this.legL = new THREE.Group();
    this.legL.position.set(0.105, 0.86, 0);
    this.legR = new THREE.Group();
    this.legR.position.set(-0.105, 0.86, 0);
    for (const leg of [this.legL, this.legR]) {
      const mesh = mk(new THREE.CapsuleGeometry(0.075, 0.56, 8, 14), this.matPants);
      mesh.position.y = -0.42;
      const shoe = mk(new THREE.CapsuleGeometry(0.055, 0.1, 8, 12), this.matShoe);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1, 1.55, 1);
      shoe.position.set(0, -0.82, 0.055);
      leg.add(mesh, shoe);
      root.add(leg);
    }

    // ---- Torso (pivô no quadril → postura) ----
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.9, 0);
    const torsoMesh = mk(new THREE.CapsuleGeometry(0.185, 0.28, 8, 16), this.matShirt);
    torsoMesh.position.y = 0.27;
    this.torso.add(torsoMesh);

    // Peito (dá volume superior, deixa o corpo mais "de gente")
    const chest = mk(new THREE.SphereGeometry(0.185, 16, 12), this.matShirt);
    chest.scale.set(1, 0.82, 0.9);
    chest.position.set(0, 0.4, 0);
    this.torso.add(chest);

    // Gola + botões
    const collar = mk(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 12), this.matShirt);
    collar.position.set(0, 0.52, 0);
    this.torso.add(collar);
    const btnMat = M(0x2b2b33, { roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const btn = mk(new THREE.SphereGeometry(0.013, 8, 6), btnMat);
      btn.position.set(0, 0.36 - i * 0.09, 0.16);
      this.torso.add(btn);
    }

    // Braços (pivô no ombro) — oscilam no caminhar
    this.armL = new THREE.Group();
    this.armL.position.set(-0.24, 0.5, 0);
    this.armR = new THREE.Group();
    this.armR.position.set(0.24, 0.5, 0);
    for (const arm of [this.armL, this.armR]) {
      const mesh = mk(new THREE.CapsuleGeometry(0.058, 0.4, 8, 12), this.matShirt);
      mesh.position.y = -0.25;
      const hand = mk(new THREE.SphereGeometry(0.06, 12, 10), this.matSkin);
      hand.position.y = -0.48;
      hand.scale.set(1, 1.15, 1);
      arm.add(mesh, hand);
      this.torso.add(arm);
    }

    // ---- Cabeça (pivô no pescoço) — ACIMA do torso, com rosto frontal ----
    const neck = mk(new THREE.CylinderGeometry(0.055, 0.07, 0.09, 12), this.matSkin);
    neck.position.y = 0.6;
    this.torso.add(neck);

    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.66, 0);
    this.headBaseY = 0.66;
    this.torso.add(this.headPivot);

    // Crânio maior (proporção cartoon "bonitinha")
    const head = mk(new THREE.SphereGeometry(0.15, 24, 20), this.matSkin);
    head.position.set(0, 0.05, 0);
    this.headPivot.add(head);

    // Orelhas
    for (const sx of [-1, 1]) {
      const ear = mk(new THREE.SphereGeometry(0.035, 10, 8), this.matSkin);
      ear.position.set(sx * 0.145, 0.02, 0);
      this.headPivot.add(ear);
    }

    // Rosto (na frente da esfera)
    const eyeWhite = M(0xffffff, { roughness: 0.25 });
    const pupil = M(0x2b2b33, { roughness: 0.2 });
    this.eyes = [];
    for (const sx of [-0.052, 0.052]) {
      const white = mk(new THREE.SphereGeometry(0.024, 12, 10), eyeWhite);
      white.position.set(sx, 0.08, 0.145);
      white.scale.set(1.25, 1.1, 0.7);
      this.headPivot.add(white);
      const ir = mk(new THREE.SphereGeometry(0.012, 10, 8), pupil);
      ir.position.set(sx, 0.08, 0.168);
      ir.scale.set(1, 1.2, 0.6);
      this.headPivot.add(ir);
      // brilho (highlight) dá "vida"
      const hl = mk(new THREE.SphereGeometry(0.004, 6, 4), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }));
      hl.position.set(sx + 0.004, 0.087, 0.178);
      this.headPivot.add(hl);
      this.eyes.push(white);
    }

    // Sobrancelhas (mood)
    const browMat = M(0x3a2a1a, { roughness: 0.6 });
    const browGeo = new THREE.BoxGeometry(0.05, 0.013, 0.02);
    this.browL = mk(browGeo, browMat);
    this.browL.position.set(-0.052, 0.132, 0.15);
    this.browR = mk(browGeo, browMat);
    this.browR.position.set(0.052, 0.132, 0.15);
    this.headPivot.add(this.browL, this.browR);

    // Nariz
    const nose = mk(new THREE.SphereGeometry(0.018, 10, 8), this.matSkin);
    nose.scale.set(1, 1.6, 1.1);
    nose.position.set(0, 0.025, 0.16);
    this.headPivot.add(nose);

    // Boca (morfável)
    this.mouth = mk(new THREE.CapsuleGeometry(0.012, 0.04, 6, 8), M(0x8a4444, { roughness: 0.5 }));
    this.mouth.rotation.z = Math.PI / 2;
    this.mouth.scale.set(1, 1.6, 1);
    this.mouth.position.set(0, -0.055, 0.16);
    this.headPivot.add(this.mouth);

    // Bochecha (blush — fofura)
    const blushMat = M(0xe89a9a, { roughness: 0.6, transparent: true, opacity: 0.55 });
    for (const sx of [-0.085, 0.085]) {
      const blush = mk(new THREE.SphereGeometry(0.016, 10, 8), blushMat);
      blush.position.set(sx, -0.015, 0.15);
      this.headPivot.add(blush);
    }

    // Cabelo (calota + franja)
    this.hair = mk(new THREE.SphereGeometry(0.158, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), this.matHair);
    this.hair.position.set(0, 0.1, 0);
    this.headPivot.add(this.hair);
    // franja
    const fringe = mk(new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), this.matHair);
    fringe.position.set(0, 0.115, 0.05);
    fringe.scale.set(1.02, 1, 0.98);
    this.headPivot.add(fringe);

    root.add(this.torso);
    root.visible = false;
    scene.add(root);
  }

  setStyle(a = {}) {
    this.matShirt.color.set(a.camisa ?? 0x8b8378);
    this.matPants.color.set(a.calca ?? 0x37414b);
    this.matHair.color.set(a.cabelo ?? 0x4a4a4a);
    this.matSkin.color.set(a.pele ?? 0xd9a066);
    this.matShoe.color.set(a.sapato ?? 0x22262a);
    this.matAccent.color.set(a.detalhe ?? 0xf28f3b);
  }
  setPose(name) {
    if (POSES[name]) this.target = POSES[name];
  }
  setMood(name) {
    this.mood = name || 'neutro';
    const neutro = () => {
      this.browL.rotation.z = 0;
      this.browR.rotation.z = 0;
      this.mouth.rotation.z = Math.PI / 2;
      this.mouth.rotation.x = 0;
      this.mouth.scale.set(1, 1.6, 1);
      this.eyes[0].scale.set(1.25, 1.1, 0.7);
      this.eyes[1].scale.set(1.25, 1.1, 0.7);
    };
    if (name === 'triste') {
      this.browL.rotation.z = 0.18;
      this.browR.rotation.z = -0.18;
      this.browL.position.y = 0.118;
      this.browR.position.y = 0.118;
      this.mouth.rotation.z = 0.9;
      this.mouth.rotation.x = 0;
    } else if (name === 'dolorido') {
      this.browL.rotation.z = -0.2;
      this.browR.rotation.z = 0.2;
      this.browL.position.y = 0.148;
      this.browR.position.y = 0.148;
      this.mouth.rotation.z = Math.PI / 2;
      this.mouth.scale.set(1.5, 2.4, 1);
      this.eyes[0].scale.set(1, 0.7, 0.7);
      this.eyes[1].scale.set(1, 0.7, 0.7);
    } else {
      neutro();
      this.browL.position.y = 0.132;
      this.browR.position.y = 0.132;
    }
  }

  enter(aparencia) {
    this.setStyle(aparencia);
    this.setPose('idle');
    this.setMood('neutro');
    this.root.visible = true;
    return this.walk(new THREE.Vector3(3.0, 0, -5.0), new THREE.Vector3(0, 0, 0.6), 2.2);
  }
  leave() {
    return this.walk(new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(3.0, 0, -5.0), 1.8).then(() => {
      this.root.visible = false;
    });
  }
  walk(from, to, dur) {
    return new Promise((res) => {
      this.walking = { from, to, dur, t: 0, res };
      this.root.position.copy(from);
    });
  }

  update(dt, t) {
    const k = Math.min(1, dt * 4);
    for (const key in this.cur) this.cur[key] += (this.target[key] - this.cur[key]) * k;
    this.torso.rotation.x = this.cur.torso;
    this.headPivot.rotation.x = this.cur.head;
    this.armL.rotation.set(this.cur.armLx, 0, this.cur.armLz);
    this.armR.rotation.set(this.cur.armRx, 0, this.cur.armRz);

    if (!this.reduceMotion) {
      // Respiração (peito expande sutilmente)
      const b = Math.sin(t * 2.1);
      this.torso.scale.set(1 + b * 0.018, 1, 1 + b * 0.014);
      this.torso.position.y = 0.9 + Math.abs(b) * 0.006;
      // Olhar suave (a cabeça vira levemente de vez em quando)
      this._glance -= dt;
      if (this._glance <= 0) this._glance = 6 + Math.random() * 6;
      const look = this._glance < 2 ? Math.sin(this._glance * 1.2) * 0.28 : 0;
      this.headPivot.rotation.y += (look - this.headPivot.rotation.y) * Math.min(1, dt * 3);
      // Piscar
      this._blink -= dt;
      if (this._blink <= 0) {
        this._blink = 2.5 + Math.random() * 2.5;
        this._blinkT = 0.14;
      }
      if (this._blinkT > 0) {
        this._blinkT -= dt;
        const s = Math.abs(Math.sin((0.14 - this._blinkT) * 40));
        this.eyes[0].scale.y = Math.max(0.12, 1.1 * (1 - s));
        this.eyes[1].scale.y = Math.max(0.12, 1.1 * (1 - s));
      } else {
        const ms = this.mood === 'dolorido' ? 0.7 : 1.1;
        this.eyes[0].scale.y += (ms - this.eyes[0].scale.y) * k;
        this.eyes[1].scale.y += (ms - this.eyes[1].scale.y) * k;
      }
    }

    if (this.walking) {
      const w = this.walking;
      w.t += dt;
      const p = Math.min(1, w.t / w.dur);
      const e = p * p * (3 - 2 * p);
      this.root.position.lerpVectors(w.from, w.to, e);
      if (p < 1) {
        this.root.rotation.y = Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z);
        const step = Math.sin(w.t * 7);
        this.legL.rotation.x = step * 0.45;
        this.legR.rotation.x = -step * 0.45;
        // braços acompanham as pernas (opostos) — animação mais natural
        if (!this.reduceMotion) {
          this.armL.rotation.x = this.cur.armLx - step * 0.4;
          this.armR.rotation.x = this.cur.armRx + step * 0.4;
          this.root.position.y = Math.abs(Math.sin(w.t * 7)) * 0.024;
          this.torso.rotation.z = Math.sin(w.t * 7) * 0.03;
          this.headPivot.rotation.z = -Math.sin(w.t * 7) * 0.02;
        }
      } else {
        this.root.rotation.y += (0 - this.root.rotation.y) * Math.min(1, dt * 6);
        this.torso.rotation.z += (0 - this.torso.rotation.z) * Math.min(1, dt * 6);
        this.headPivot.rotation.z += (0 - this.headPivot.rotation.z) * Math.min(1, dt * 6);
        if (Math.abs(this.root.rotation.y) < 0.05) {
          this.legL.rotation.x = this.legR.rotation.x = 0;
          this.root.position.y = 0;
          const done = w.res;
          this.walking = null;
          done();
        }
      }
    }
  }
}

/**
 * PIPELINE FOTO → 3D (pessoas reais):
 *   1. foto → fotogrametria/IA (Meshy · Luma · Polycam · Hyper3D Rodin) → .glb
 *   2. retopologia (< 30k tris) + rig Mixamo (anims: Idle, Pain, Embarrassed, Discomfort, Weakness)
 *   3. salvar em public/models/<caseId>.glb  → o main.js carrega e usa (fallback = procedural)
 * Mesmo contrato: enter/leave/setPose/setMood/update.
 */
export async function loadGLBFPatient(url, scene) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 1.72 / Math.max(size.y, 1e-4);
  model.scale.setScalar(scale);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y = -box.min.y;
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clips = {};
  for (const clip of gltf.animations) clips[clip.name] = mixer.clipAction(clip);
  const poseMap = { idle: 'Idle', mao_no_peito: 'Pain', curvado: 'Weakness', cabeca_baixa: 'Discomfort' };
  let active = null;
  return {
    setStyle() {},
    setMood() {},
    setPose(name) {
      const clip = clips[poseMap[name] || 'Idle'];
      if (clip && clip !== active) {
        active?.stop();
        active = clip;
        active.reset().play();
      }
    },
    async enter() {
      model.visible = true;
      this.setPose('idle');
    },
    async leave() {
      model.visible = false;
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}