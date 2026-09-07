import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });
const mk = (geo, mat) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
};

// Posturas semiológicas (lerp suave entre elas)
const POSES = {
  idle:         { torso: 0.00, head: 0.03, armLx: 0.10, armLz: 0.10, armRx: 0.10, armRz: -0.10, armRY: 0 },
  mao_no_peito: { torso: 0.05, head: 0.16, armLx: 0.10, armLz: 0.12, armRx: -1.25, armRz: -0.60, armRY: 0 },
  curvado:      { torso: 0.34, head: 0.44, armLx: -0.30, armLz: 0.12, armRx: -0.30, armRz: -0.12, armRY: 0 },
  cabeca_baixa: { torso: 0.10, head: 0.55, armLx: 0.10, armLz: 0.10, armRx: 0.10, armRz: -0.10, armRY: 0 },
};
export const POSE_FRASE = {
  mao_no_peito: 'aperta o peito com a mão',
  curvado: 'se curva, como se o corpo pesasse',
  cabeca_baixa: 'abaixa a cabeça, visivelmente cansado',
};

const SKIN_TONES = [0xf1c27d, 0xd9a066, 0xc98a5b, 0xc68642, 0x8d5a3b, 0x6b4226];

export class PatientAvatar {
  constructor(scene) {
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.matSkin = M(0xd9a066);
    this.matShirt = M(0x8b8378);
    this.matPants = M(0x37414b);
    this.matHair = M(0x4a4a4a);
    this.matShoe = M(0x22262a);
    this.cur = { ...POSES.idle };
    this.target = POSES.idle;
    this.walking = null;
    this.voicePitch = 1;

    const root = (this.root = new THREE.Group());

    // Pernas (pivô no quadril para caminhar)
    this.legL = new THREE.Group();
    this.legL.position.set(0.105, 0.86, 0);
    this.legR = new THREE.Group();
    this.legR.position.set(-0.105, 0.86, 0);
    for (const leg of [this.legL, this.legR]) {
      const mesh = mk(new THREE.CapsuleGeometry(0.075, 0.6, 4, 8), this.matPants);
      mesh.position.y = -0.42;
      const shoe = mk(new THREE.BoxGeometry(0.11, 0.07, 0.2), this.matShoe);
      shoe.position.set(0, -0.82, 0.04);
      leg.add(mesh, shoe);
      root.add(leg);
    }

    // Torso (pivô no quadril → postura)
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.9, 0);
    const torsoMesh = mk(new THREE.CapsuleGeometry(0.17, 0.34, 6, 12), this.matShirt);
    torsoMesh.position.y = 0.32;
    this.torso.add(torsoMesh);

    // Cabeça (pivô no pescoço)
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.62, 0);
    this.headBaseY = 0.62;
    const head = mk(new THREE.SphereGeometry(0.125, 20, 16), this.matSkin);
    head.position.y = 0.09;
    this.torso.add(head);

    // Rosto: sobrancelhas, nariz, boca, olhos com pupila
    const browMat = M(0x3a2a1a);
    const browGeo = new THREE.BoxGeometry(0.055, 0.012, 0.02);
    this.browL = mk(browGeo, browMat);
    this.browL.position.set(-0.048, 0.17, 0.113);
    this.browR = mk(browGeo, browMat);
    this.browR.position.set(0.048, 0.17, 0.113);
    this.torso.add(this.browL, this.browR);

    const nose = mk(new THREE.SphereGeometry(0.02, 8, 6), this.matSkin);
    nose.scale.set(1, 1.4, 1.1);
    nose.position.set(0, 0.09, 0.124);
    this.torso.add(nose);

    const mouthMat = M(0x7a3b3b);
    this.mouth = mk(new THREE.BoxGeometry(0.045, 0.012, 0.01), mouthMat);
    this.mouth.position.set(0, 0.045, 0.124);
    this.torso.add(this.mouth);

    const eyeWhite = M(0xf8fafc);
    const pupil = M(0x22262a);
    const eyeGeo = new THREE.SphereGeometry(0.02, 10, 8);
    for (const sx of [-0.048, 0.048]) {
      const white = mk(eyeGeo, eyeWhite);
      white.position.set(sx, 0.115, 0.118);
      this.torso.add(white);
      const p = mk(new THREE.SphereGeometry(0.009, 8, 6), pupil);
      p.position.set(sx, 0.115, 0.131);
      this.torso.add(p);
    }

    // Cabelo (calota)
    this.hair = mk(new THREE.SphereGeometry(0.133, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), this.matHair);
    this.hair.position.y = 0.1;
    this.torso.add(this.hair);

    // Braços (pivô no ombro → mão no peito etc.)
    this.armL = new THREE.Group();
    this.armL.position.set(-0.235, 0.5, 0);
    this.armR = new THREE.Group();
    this.armR.position.set(0.235, 0.5, 0);
    for (const arm of [this.armL, this.armR]) {
      const mesh = mk(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), this.matShirt);
      mesh.position.y = -0.27;
      const hand = mk(new THREE.SphereGeometry(0.06, 8, 6), this.matSkin);
      hand.position.y = -0.52;
      arm.add(mesh, hand);
      this.torso.add(arm);
    }
    root.add(this.torso);
    root.visible = false;
    scene.add(root);

    this._blink = 0;
  }

  setStyle(a = {}) {
    this.matShirt.color.set(a.camisa ?? 0x8b8378);
    this.matPants.color.set(a.calca ?? 0x37414b);
    this.matHair.color.set(a.cabelo ?? 0x4a4a4a);
    this.matSkin.color.set(a.pele ?? 0xd9a066);
    this.matShoe.color.set(a.sapato ?? 0x22262a);
    if (a.cabelo) this.hair.material.color.set(a.cabelo);
  }
  setPose(name) {
    if (POSES[name]) this.target = POSES[name];
  }
  setMood(name) {
    // Micro-expressões: mudam sobrancelha/boca conforme o estado emocional
    if (name === 'triste') {
      this.browL.rotation.z = 0.12;
      this.browR.rotation.z = -0.12;
      this.mouth.rotation.z = 0.1;
    } else if (name === 'dolorido') {
      this.browL.rotation.z = -0.15;
      this.browR.rotation.z = 0.15;
      this.mouth.scale.y = 1.4;
    } else {
      this.browL.rotation.z = 0;
      this.browR.rotation.z = 0;
      this.mouth.rotation.z = 0;
      this.mouth.scale.set(1, 1, 1);
    }
  }

  enter(aparencia) {
    this.setStyle(aparencia);
    this.setPose('idle');
    this.setMood('neutro');
    this.root.visible = true;
    return this.walk(new THREE.Vector3(3.0, 0, -5.0), new THREE.Vector3(0, 0, 0.6), 2.4);
  }
  leave() {
    return this.walk(new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(3.0, 0, -5.0), 2.0).then(() => {
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
    this.headPivot.rotation.x = 0;
    this.torso.rotation.x = this.cur.torso;
    this.armL.rotation.set(this.cur.armLx, this.cur.armRY, this.cur.armLz);
    this.armR.rotation.set(this.cur.armRx, this.cur.armRY, this.cur.armRz);

    if (!this.reduceMotion) {
      // Respiração (semiologicamente legível)
      const b = Math.sin(t * 2.1);
      this.torso.scale.set(1 + b * 0.018, 1, 1 + b * 0.014);
      this.hair.position.y = 0.1 + Math.sin(t * 2.1) * 0.004;
      // Piscar
      this._blink -= dt;
      if (this._blink <= 0) this._blink = 2.5 + Math.random() * 2;
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
        if (!this.reduceMotion) this.root.position.y = Math.abs(Math.sin(w.t * 7)) * 0.025;
      } else {
        this.root.rotation.y += (0 - this.root.rotation.y) * Math.min(1, dt * 6);
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
 * PIPELINE FOTO → 3D (gate futuro):
 * fotos → fotogrametria (Meshy/Luma/Polycam) → .glb · rig Mixamo · anims:
 * Idle, Pain, Embarrassed, Discomfort, Weakness → /public/models/<caso>.glb
 * Mesmo contrato do procedural: enter/leave/setPose/update — fallback automático.
 */
export async function loadGLBFPatient(url, scene) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
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