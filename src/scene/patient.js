import * as THREE from 'three';
import { createGLTFLoader, sanitizeClips } from './glbLoader.js';
import { createWalkFootGrounding } from './walkFootGrounding.js';
import { calibrateSoleGround } from './soleGround.js';
import { createAvatarDisposer } from './avatarLifecycle.js';
import { createMouthAnimation } from './mouthAnimation.js';
import { verticalAxisCorrection } from './characterOrientation.js';
import { TTS } from '../audio/tts.js';

export const POSE_FRASE = {
  mao_no_peito: 'aperta o peito com a mão',
  curvado: 'se curva, como se o corpo pesasse',
  cabeca_baixa: 'abaixa a cabeça, visivelmente cansado',
};

/**
 * Runtime dos avatares GLB do elenco. Os 14 modelos atuais têm skin e clips
 * Walk/Idle e estão mapeados no fluxo normal do checkout local. Ana, Marina e
 * José são os três modelos publicados; os outros 11 são candidatos locais,
 * ainda sem aceite final nem publicação. A origem da malha varia entre os
 * lotes; clips Mixamo ficam embutidos e Blender é usado para preparo/retarget
 * quando necessário.
 * Poses diretas por bones valem para rigs calibrados em rigParams.json (nomes
 * Eric, como upperleg_l_074). O mixer controla os clips embutidos nos rigs
 * Mixamo; o ajuste +90°X do Hips já está assado nos GLBs correspondentes.
 * O swing procedural de pernas continua somente como compatibilidade para
 * rigs sem clip Walk; não substitui os ciclos validados do elenco atual.
 * Contrato: enter/leave/setPose/setMood/update/setStyle. Não há fallback de
 * avatar procedural: falha de load/parse propaga para corrigir o asset.
 */
import rigParams from '../data/rigParams.json' with { type: 'json' };

const BONE_POSES = {
  idle: () => ({ ...rigParams.idle }),
  mao_no_peito: (p) => ({ ...p.idle, ...p.mao_no_peito }),
  cabeca_baixa: (p) => ({ ...p.idle, ...p.cabeca_baixa }),
  curvado: (p) => ({ ...p.idle, ...p.curvado, ...p.cabeca_baixa }),
};

export async function loadGLBFPatient(url, scene) {
  // Usa o loader compartilhado com MeshoptDecoder: GLBs do elenco saem do
  // optimize_model.mjs com EXT_meshopt_compression (required).
  let gltf;
  try {
    gltf = await createGLTFLoader().loadAsync(url);
    sanitizeClips(gltf);
  } catch (err) {
    console.error(`[patient] FALHA ao carregar GLB: ${url}`, err);
    throw err;
  }
  const inner = gltf.scene;
  // Tencent sai Z-up (pé em -Z). Se a altura estiver em Z, rotaciona p/ Y-up
  // antes de normalizar — senão size.y é a profundidade e o scale explode
  // (só o pé gigante na câmera).
  let box = new THREE.Box3().setFromObject(inner);
  let size = box.getSize(new THREE.Vector3());
  const axisCorrection = verticalAxisCorrection(size);
  if (axisCorrection) {
    inner.rotation.x = axisCorrection;
    inner.updateMatrixWorld(true);
    box.setFromObject(inner);
    size = box.getSize(new THREE.Vector3());
  }
  const h = Math.max(size.y, 1e-4);
  const scale = 1.72 / h;
  // Mixamo sai em cm (186u → scale ~0.009). Clamp só p/ caught bugs reais.
  if (!Number.isFinite(scale) || scale < 1e-3 || scale > 200) {
    console.error(`[patient] escala absurda (${scale.toFixed(3)}) para ${url} — size`, size.toArray());
    throw new Error(`scale out of range: ${scale}`);
  }
  console.log(`[patient] ${url} size=${size.toArray().map((v) => v.toFixed(3))} scale=${scale.toFixed(3)}`);
  inner.scale.setScalar(scale);
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner);
  const center = box.getCenter(new THREE.Vector3());
  inner.position.x -= center.x;
  inner.position.z -= center.z;
  inner.position.y = -box.min.y;

  // Animações embutidas (ex.: Ana Mixamo Walk/Idle): mixer com crossfade.
  const mixer = (gltf.animations && gltf.animations.length) ? new THREE.AnimationMixer(inner) : null;
  const clips = {};
  if (mixer) {
    for (const clip of gltf.animations) {
      const nm = clip.name.toLowerCase();
      const slot = /idle/.test(nm) ? 'idle' : /walk/.test(nm) ? 'walk' : null;
      if (slot && !clips[slot]) clips[slot] = mixer.clipAction(clip);
    }
    if (clips.idle) clips.idle.play();
  }
  const playClip = (slot) => {
    const to = clips[slot];
    if (!to || to.isRunning()) return;
    to.reset();
    const startPhase = Number(gltf.asset?.extras?.walkStartPhase ?? 0);
    if (slot === 'walk' && startPhase >= 0 && startPhase < 1) to.time = to.getClip().duration * startPhase;
    to.play();
    const from = Object.values(clips).find((a) => a.isRunning() && a !== to);
    const entryFade = Number(gltf.asset?.extras?.walkCrossfadeSeconds);
    const fadeSeconds = slot === 'walk' && entryFade > 0 && entryFade <= 0.25 ? entryFade : CROSSFADE_S;
    if (from) to.crossFadeFrom(from, fadeSeconds, gltf.asset?.extras?.walkCrossfadeWarp !== false);
  };

  // Cadência × velocidade (sem foot slide): o avanço POR LOOP do clip é gravado
  // pelo pipeline offline em asset.extras.walkAdvance (sem constante mágica;
  // fallback só p/ GLBs legacy). A cadência é acelerada até a velocidade real
  // do deslocamento; o tween do root usa a MESMA velocidade → pé plantado não
  // desliza.
  // velocidade alvo lida do ASSET (gravada pelo pipeline em extras.walkSpeed;
  // fallback 1.3 só p/ GLBs legacy — juiz: "sem hardcoded no runtime")
  const WALK_V = Number(gltf.asset?.extras?.walkSpeed) > 0 ? Number(gltf.asset.extras.walkSpeed) : 1.3;
  if (clips.walk) {
    const advance = Number(gltf.asset?.extras?.walkAdvance) > 0 ? Number(gltf.asset.extras.walkAdvance) : 0.894;
    const vClip = advance / clips.walk.getClip().duration;
    clips.walk.timeScale = WALK_V / vClip;
    console.log(`[patient] walk: cadência ×${(WALK_V / vClip).toFixed(2)} (clip ${vClip.toFixed(2)} m/s → ${WALK_V} m/s; advance ${advance} m/loop)`);
  }
  // O root percorre o chão plano; a animação controla o Hips. Candidatas com
  // contato assado podem ter compensação vertical da bacia, sem bob manual.
  let walkCalib = null; // (27/09: sistema morto — só a declaração fica p/ compat)
  let bobBaseY = null;  // altura base durante o walk (groundFix.alvo − stanceDelta)

  inner.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    if (!o.material) return;
    const nm = (o.material.name || '').toLowerCase();
    if (/skin/.test(nm)) {
      const up = new THREE.MeshPhysicalMaterial({
        map: o.material.map, color: o.material.color?.clone() ?? new THREE.Color(1, 1, 1),
        roughness: 0.62, metalness: 0, sheen: 0.5, sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0xffe0c0),
      });
      o.material = up;
    } else if (/eye/.test(nm)) {
      const up = new THREE.MeshPhysicalMaterial({
        map: o.material.map, color: o.material.color?.clone() ?? new THREE.Color(1, 1, 1),
        roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
      });
      o.material = up;
    }
    o.material.transparent = false;
    o.material.opacity = 1;
  });

  const rim = new THREE.PointLight(0x8fb6ff, 0.9, 4.5);

  const root = new THREE.Group();
  root.add(inner);
  root.add(rim);
  scene.add(root);
  const mouthAnimation = createMouthAnimation(root);
  const footContactEnabled = gltf.asset?.extras?.walkFootContact === true;
  const footContactAuditRequested = new URLSearchParams(window.location.search).get('qaFootContact') === '1';
  const footGrounding = mixer && clips.walk && (footContactEnabled || footContactAuditRequested)
    ? createWalkFootGrounding(inner, root, {
      mixer,
      walkAction: clips.walk,
      restoreAction: clips.idle,
      maxSoleVertices: footContactEnabled ? 512 : Infinity,
    })
    : null;
  if (footGrounding) {
    console.log(`[patient] foot-contact audit ready: sampled soles ${footGrounding.diagnostics.leftVertices}/${footGrounding.diagnostics.rightVertices} of ${footGrounding.diagnostics.leftCandidateVertices}/${footGrounding.diagnostics.rightCandidateVertices}; IK ${footContactEnabled ? 'experimental/opt-in' : 'off'}; support phase ${JSON.stringify(footGrounding.diagnostics.supportWindows)}`);
  }

  const bones = new Map();
  const animNodes = new Set();
  if (gltf.animations) {
    for (const clip of gltf.animations) {
      for (const tr of clip.tracks) {
        const n = tr.name.split('.')[0];
        if (n) animNodes.add(n);
      }
    }
  }
  inner.traverse((o) => {
    if (!o.name) return;
    if (o.isBone || animNodes.has(o.name)) bones.set(o.name, o);
  });
  const restEuler = new Map();
  const curRot = new Map();
  for (const [name, b] of bones) {
    restEuler.set(name, b.rotation.clone());
    curRot.set(name, new THREE.Euler());
  }
  const B = (n) => bones.get(n);

  const tintables = [];
  inner.traverse((o) => {
    if (!o.isSkinnedMesh && !o.isMesh) return;
    if (!o.material || o.material.userData._tintable) return;
    o.material = o.material.clone();
    o.material.userData._tintable = true;
    tintables.push(o.material);
  });

  let poseName = 'idle';
  let poseRot = {};
  let mood = 'neutro';
  let walking = null;
  let motionVersion = 0;
  let disposed = false;
  let unhookSpeak = null;
  let blinkT = 2;
  let blinkAnim = 0;
  const speak = { active: false };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CROSSFADE_S = 0.15; // s — fade entre clips (26/09: 0,25 deixava glide no início — o corpo andava com o clip ainda engatinhando)
  const finishWalking = () => {
    const active = walking;
    walking = null;
    active?.res();
  };

  const contactTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.55),
    new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;
  root.add(contact);

  // Guard: rigParams é calibrado p/ o rig Eric (paciente_real.glb). Se o
  // esqueleto carregado não tiver os bones-alvo, poses procedurais viram
  // no-op ({} → applyBones aplica [0,0,0]) — nunca distorce rigs não calibrados.
  const rigMatch = ['upperarm_l_024', 'upperarm_r_049', 'spine_01_03', 'neck_06', 'head_07'].every((n) => B(n));
  if (!rigMatch) console.log('[patient] rig não calibrado no rigParams — poses procedurais off');

  function computeTargets() {
    const fn = BONE_POSES[poseName] || BONE_POSES.idle;
    poseRot = rigMatch ? fn(rigParams) : {};
    if (mood === 'dolorido') {
      for (const n of ['eyebrow_l_021', 'eyebrow_r_022']) {
        const b = B(n);
        if (b) poseRot[n] = poseRot[n] || [0, 0, poseName === 'idle' ? 0.18 : 0.12];
      }
    }
  }
  computeTargets();

  // Aliases: rig Eric + rigs simples (GLBs com legL/legR/torso, p/ sem isBone).
  const pickWalk = (names) => {
    for (const n of names) {
      if (B(n)) return n;
    }
    return null;
  };

  // Calibração de solo para rigs com clips: usar a pose parada para obter uma
  // correção fina e não medir um pé em balanço durante a caminhada.
  const toeBones = [
    B('mixamorigLeftToeBase'), B('mixamorigRightToeBase'),
    B('LeftToeBase'), B('RightToeBase'),
  ].filter(Boolean);
  // Box3 already positioned inner at the floor. If idle needs no correction,
  // the next Walk must retain that height rather than use an unset zero target.
  const groundFix = mixer && toeBones.length ? { parado: 0, min: Infinity, done: false, alvo: inner.position.y } : null;
  const _gv = new THREE.Vector3();
  const lowestToeY = () => {
    let minY = Infinity;
    for (const b of toeBones) { b.getWorldPosition(_gv); minY = Math.min(minY, _gv.y); }
    return minY;
  };
  const disposeResources = createAvatarDisposer({
    root,
    model: inner,
    mixer,
    beforeDispose: () => {
      unhookSpeak?.();
      unhookSpeak = null;
      mouthAnimation.dispose();
    },
  });

  // Referência de solo (PO 26/09: "o chão de quando ela PARA vale para o
  // andar"): no load (avatar invisível) mede o dedo na pose de APOIO do Walk
  // vs na pose de Idle → o walk nasce com o pé no MESMO nível do idle (que o
  // ground-fix deixa certinho). O calib por mediana continua só como fino.
  let stanceDelta = 0;
  if (mixer && clips.walk && clips.idle && toeBones.length) {
    const _sv2 = new THREE.Vector3();
    const toeMinL = () => {
      let m = Infinity;
      for (const b of toeBones) { b.getWorldPosition(_sv2); m = Math.min(m, _sv2.y); }
      return m;
    };
    const wAct = clips.walk;
    const savedTs = wAct.timeScale;
    wAct.timeScale = 1;
    mixer.stopAllAction();
    clips.idle.reset().play();
    mixer.setTime(0);
    inner.updateMatrixWorld(true);
    const idleY = toeMinL();
    wAct.reset().play();
    const ys = [];
    for (const tt of wAct.getClip().tracks[0].times) {
      mixer.setTime(tt);
      inner.updateMatrixWorld(true);
      ys.push(toeMinL());
    }
    ys.sort((a, b) => a - b);
    stanceDelta = (ys[Math.floor(ys.length / 2)] ?? idleY) - idleY;
    wAct.stop();
    wAct.timeScale = savedTs;
    clips.idle.play();
    mixer.setTime(0);
    inner.updateMatrixWorld(true);
    console.log(`[patient] referência de solo: apoio do walk ${stanceDelta >= 0 ? '+' : ''}${stanceDelta.toFixed(3)} m vs idle → walk nasce alinhado ao chão`);
  }

  // Referência de solo REAL: a sola (vértices do pé) medida no ciclo inteiro.
  // O osso do dedal fica alguns milímetros ACIMA da sola, então usá-lo como
  // referência enterrava o tênis no piso — e o clip de caminhada tem mínimo
  // mais baixo que o idle. Esta é a mesma calibração do preview approved.
  const soleCalibration = calibrateSoleGround({ model: inner, mixer, clips, clearance: 0.005 });
  if (soleCalibration?.ok) {
    inner.position.y += soleCalibration.correction;
    inner.updateMatrixWorld(true);
    // A calibração de carga é a autoridade: o ajuste runtime pelo osso do
    // dedal mediria um referencial diferente e desfaria esta correção.
    if (groundFix) { groundFix.alvo = inner.position.y; groundFix.done = true; groundFix.aplicando = false; }
    console.log(`[patient] solo: mínimo do ciclo ${soleCalibration.minY.toFixed(3)} m → ajuste ${soleCalibration.correction.toFixed(3)} m (folga ${(soleCalibration.clearance * 1000).toFixed(0)} mm, ${soleCalibration.soleVertices} vértices, oscilação ${soleCalibration.spread.toFixed(3)} m)`);
  } else {
    console.warn(`[patient] solo: calibração indisponível (${soleCalibration?.reason || 'motivo desconhecido'}) — o ground-fix por osso assume`);
  }

  const api = {
    get root() { return root; },
    setMood(m) { mood = m || 'neutro'; computeTargets(); },
    setPose(name) {
      if (!BONE_POSES[name] && poseName === name) return;
      poseName = BONE_POSES[name] ? name : 'idle';
      computeTargets();
    },
    setStyle(a = {}) {
      for (const m of tintables) {
        const nm = (m.name || '').toLowerCase();
        const col = /shirt|cloth|top|jacket/.test(nm) ? a.camisa
          : /pant|jean|trouser|leg/.test(nm) ? a.calca
          : /hair/.test(nm) ? a.cabelo
          : /skin/.test(nm) ? a.pele
          : /shoe|boot/.test(nm) ? a.sapato
          : null;
        if (col != null && m.color) m.color.set(col);
      }
    },
    speakStart(line = '', progress = null, duration = null) {
      speak.active = true;
      mouthAnimation.start(line);
      if (Number.isFinite(progress)) mouthAnimation.setProgress(progress, duration);
    },
    speakProgress(progress, duration = null) { mouthAnimation.setProgress(progress, duration); },
    speakEnd() {
      speak.active = false;
      mouthAnimation.stop();
    },
    getSpeechMouthDiagnostics() {
      return {
        ...mouthAnimation.diagnostics,
        speakHookRegistered: Boolean(unhookSpeak),
        speakHookCount: TTS._speakHooks?.size ?? null,
      };
    },
    async enter(aparencia) {
      this.setStyle(aparencia || {});
      this.setPose('idle');
      root.visible = true;
      root.rotation.set(0, 0, 0);
      // faceEnd: no fim da chegada encara a câmera (não deixa "torta"/deitada no balcão)
      return this.walk(new THREE.Vector3(2.6, 0, -4.6), new THREE.Vector3(0, 0, 0.55), 2.2, true);
    },
    async leave() {
      const leaveMotion = this.walk(new THREE.Vector3(0, 0, 0.55), new THREE.Vector3(2.6, 0, -4.6), 1.8, false);
      const leaveVersion = motionVersion;
      await leaveMotion;
      if (motionVersion === leaveVersion) root.visible = false;
    },
    cancelMotion({ hide = false } = {}) {
      motionVersion++;
      const canceled = Boolean(walking);
      finishWalking();
      if (hide) root.visible = false;
      return canceled;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      motionVersion++;
      root.visible = false;
      finishWalking();
      return disposeResources();
    },
    walk(from, to, dur, faceEnd = false) {
      return new Promise((res) => {
        motionVersion++;
        finishWalking();
        const yaw = Math.atan2(to.x - from.x, to.z - from.z) || 0;
        root.rotation.set(0, yaw, 0);
        footGrounding?.reset();
        // com clip de walk: duração pela distância na velocidade da cadência
        if (mixer && clips.walk) dur = Math.min(12, Math.max(1.2, from.distanceTo(to) / WALK_V));
        walking = { from, to, dur, t: 0, res, yaw, faceEnd };
        if (mixer) {
          // A base do modelo fica fixa; o apoio é responsabilidade do clip.
          // Não reaplicar stanceDelta nem apagar Hips Y de contato assado.
          bobBaseY = groundFix && groundFix.done ? groundFix.alvo : inner.position.y;
          // se a base mudou (ex.: ground-fix completou entre um walk e outro),
          // recalibra o drop do walk na próxima caminhada
          if (walkCalib) { walkCalib = null; } // (27/09: legacy — sistema morto)
        }
        root.position.copy(from);
        if (mixer) playClip('walk');
      });
    },
    getModel: () => inner,
    // Pose do rig + swing de pernas no walk. Roda durante walking e em idle
    // (antes o early-return congelava a pose → deslizo/pose torta na chegada).
    applyBones(dt, t) {
      // A animação facial fica desativada enquanto o modelo não tiver rig facial.
      mouthAnimation.update(dt);
      const walkingNow = !!walking;
      const k = Math.min(1, dt * 3.2);
      if (mixer) {
        // Mixer cuida de Idle/Walk (clip in-place). Só sobrepõe o swing quando o
        // rig não tem clip de walk.
        // swing procedural de pernas só p/ rigs SEM clip de walk (com clip,
        // sobrescreveria a animação do mixer — juiz #6)
        if (walkingNow && !reduceMotion && !clips.walk) this.applyLegSwing(walking.t);
        return;
      }
      for (const [name] of bones) {
        const tgt = poseRot[name] || [0, 0, 0];
        const c = curRot.get(name);
        c.x += (tgt[0] - c.x) * k;
        c.y += (tgt[1] - c.y) * k;
        c.z += (tgt[2] - c.z) * k;
        const b = bones.get(name);
        const r = restEuler.get(name);
        b.rotation.set(r.x + c.x, r.y + c.y, r.z + c.z);
      }
      if (walkingNow && !reduceMotion) this.applyLegSwing(walking.t);
      if (reduceMotion) return;
      const br = Math.sin(t * 2.0) * 0.012;
      const sp2 = B('spine_03_05') || B('spine');
      if (sp2) sp2.rotation.x += br;
      const hd = B('head_07') || B('head');
      if (hd) hd.rotation.z += Math.sin(t * 0.9) * 0.006;
      blinkT -= dt;
      if (blinkT <= 0) { blinkT = 2.4 + Math.random() * 2.6; blinkAnim = 0.14; }
      if (blinkAnim > 0) {
        blinkAnim -= dt;
        const s = Math.abs(Math.sin((0.14 - blinkAnim) * 40));
        const bl = B('eyelid_l_017'), brr = B('eyelid_r_019');
        const amp = s * 0.55;
        if (bl) bl.rotation.z += amp;
        if (brr) brr.rotation.z -= amp;
      }
    },
    applyLegSwing(wt) {
      const step = Math.sin(wt * 7);
      const legL = pickWalk(['upperleg_l_074', 'legL']);
      const legR = pickWalk(['upperleg_r_081', 'legR']);
      const shinL = pickWalk(['lowerleg_l_075', 'shinL']);
      const shinR = pickWalk(['lowerleg_r_082', 'shinR']);
      const wl = rigParams.walk.upperleg_l_074;
      const wr = rigParams.walk.upperleg_r_081;
      const bend = Math.max(0, -step) * 0.9;
      const shinAmp = Math.abs(rigParams.walk.lowerleg_l_075[2]);
      if (legL) {
        const b = B(legL), r = restEuler.get(legL);
        b.rotation.set(r.x + wl[0] * step * 0.5, r.y + wl[1] * step * 0.5, r.z + wl[2] * step * 0.5);
      }
      if (legR) {
        const b = B(legR), r = restEuler.get(legR);
        b.rotation.set(r.x + wr[0] * step * 0.5, r.y + wr[1] * step * 0.5, r.z + wr[2] * step * 0.5);
      }
      if (shinL) {
        const b = B(shinL), r = restEuler.get(shinL);
        b.rotation.set(r.x, r.y, r.z + bend * shinAmp);
      }
      if (shinR) {
        const b = B(shinR), r = restEuler.get(shinR);
        b.rotation.set(r.x, r.y, r.z - bend * shinAmp);
      }
    },
    update(dt, t) {
      if (mixer) mixer.update(dt);
      if (groundFix && !groundFix.done) {
        if (!walking) {
          groundFix.parado += dt;
          const m = lowestToeY();
          if (Number.isFinite(m)) groundFix.min = Math.min(groundFix.min, m);
          if (groundFix.parado >= 0.7) {
            const m = groundFix.min;
            // Neste rig, a malha já nasce assentada pelo Box3; o ajuste pelo
            // osso fica limitado a correções pequenas de altura.
            if (Number.isFinite(m) && Math.abs(m) > 0.002 && Math.abs(m) <= 0.15) {
              groundFix.alvo = inner.position.y - m;
              groundFix.aplicando = true;
              console.log(`[patient] ground-fix: idle toes minY=${m.toFixed(3)} m → ajuste ${(-m).toFixed(3)} m`);
            } else {
              groundFix.alvo = inner.position.y;
              console.log(`[patient] ground-fix: SKIP (toes minY=${Number.isFinite(m) ? m.toFixed(3) : 'n/a'} — fora da faixa ±0,15 m; malha já assentada pelo Box3)`);
            }
            groundFix.done = true;
          }
        } else {
          groundFix.parado = 0; // reinicia a janela: só conta idle parado
        }
      }
      if (groundFix && groundFix.done && groundFix.aplicando) {
        // assenta suavemente (~0,3 s) para não dar "pulo" visível
        inner.position.y += (groundFix.alvo - inner.position.y) * Math.min(1, dt * 4);
        if (Math.abs(groundFix.alvo - inner.position.y) < 0.0005) {
          groundFix.aplicando = false;
        }
      }
      if (groundFix && groundFix.done && !groundFix.aplicando) {
        // calibração de solo concluída (o bob do walk captura a própria base)
      }
      root.rotation.x = 0;
      root.rotation.z = 0;
      if (walking) {
        const w = walking;
        w.t += dt;
        const p = Math.min(1, w.t / w.dur);
        // LINEAR, sem easing (PO 25/09: pés patinavam)
        const e = p;
        root.position.lerpVectors(w.from, w.to, e);
        // SOLO (PO 27/09: "define o chão — sem flutuar, sem afundar, sem subir"):
        // UMA altura só. groundFix (idle) + stanceDelta (diferença walk-vs-idle,
        // medida determinística no load). NENHUMA calibração runtime — o
        // walkCalib antigo flutuava → afundava → deslizava pra cima.
        if (mixer && bobBaseY !== null) {
          inner.position.y = bobBaseY; // constante durante TODO o walk
        }
        // Últimos 30% do trajeto: blend do yaw de caminhada → face da câmera
        // (evita snap duro = "deitada"/girada seca na chegada).
        const tFace = w.faceEnd && p > 0.7 ? (p - 0.7) / 0.3 : 0;
        const yawTgt = w.yaw + (0 - w.yaw) * tFace;
        const kRot = Math.min(1, dt * 6);
        root.rotation.y += (yawTgt - root.rotation.y) * kRot;
        // hop só p/ rigs SEM clip (o clip Walk tem bob próprio no Hips)
        if (!reduceMotion && !mixer) root.position.y = Math.abs(Math.sin(w.t * 7)) * 0.02;
        if (p >= 1) {
          const done = w.res;
          walking = null;
          root.position.y = 0;
          if (mixer && bobBaseY !== null) {
            inner.position.y = groundFix && groundFix.done ? groundFix.alvo : bobBaseY;
          }
          if (w.faceEnd) root.rotation.y = 0;
          if (mixer) playClip('idle');
          done();
        }
      } else if (!reduceMotion) {
        root.rotation.y += (0 - root.rotation.y) * Math.min(1, dt * 4);
      }
      this.applyBones(dt, t);
      if (walking && footGrounding) {
        const walkClip = clips.walk.getClip();
        const phase = walkClip.duration > 0 ? clips.walk.time / walkClip.duration : 0;
        if (footContactEnabled) footGrounding.apply(phase);
        else footGrounding.measure(phase);
      }
    },
    getWalkFootGroundingDiagnostics() { return footGrounding?.diagnostics ?? null; },
    get _speakHook() {
      return (on, line, progress, duration) => {
        if (!on) return api.speakEnd();
        if (!speak.active) api.speakStart(line, progress, duration);
        else if (Number.isFinite(progress)) api.speakProgress(progress, duration);
      };
    },
  };

  try {
    if (!disposed && typeof TTS.hookSpeak === 'function') unhookSpeak = TTS.hookSpeak(api._speakHook);
  } catch (e) {
    console.error('[patient] TTS hook', e);
  }

  rim.position.set(0.6, 2.2, -1.2);
  root.visible = false;
  return api;
}
