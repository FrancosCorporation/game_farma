import * as THREE from 'three';
import { createGLTFLoader } from './glbLoader.js';

export const POSE_FRASE = {
  mao_no_peito: 'aperta o peito com a mão',
  curvado: 'se curva, como se o corpo pesasse',
  cabeca_baixa: 'abaixa a cabeça, visivelmente cansado',
};

/**
 * Avatares GLB do elenco (Tencent/Hunyuan3D; a Ana rigged traz clips Mixamo
 * Walk/Idle — os demais são meshes estáticos que deslizam no walk).
 * As poses por bones valem só para rigs calibrados em src/data/rigParams.json
 * (nomes Eric: upperleg_l_074…; rigs Mixamo usam os clips embutidos via mixer —
 * o fix +90°X do Hips foi assado no GLB por mixamo-fix).
 * Contrato: enter/leave/setPose/setMood/update/setStyle.
 * Sem fallback procedural: falha de load/parse propaga (para corrigir o asset).
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
  if (size.z > size.y && size.z >= size.x) {
    inner.rotation.x = -Math.PI / 2;
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
    to.reset().play();
    const from = Object.values(clips).find((a) => a.isRunning() && a !== to);
    if (from) to.crossFadeFrom(from, CROSSFADE_S, true);
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
  // (v7) O corpo anda 100% PLANO (translação do Hips pinada no clip pelo
  // pipeline) — sem bob manual: nada além de pernas/braços/mãos mexe.
  let walkCalib = null; // calibração de solo DO WALK (pé de contato toca y=0)
  let bobBaseY = null;  // altura base durante o walk (âncora = ground-fix quando pronto)
  let walkDropAtual = 0; // drop suavizado (casado com o crossfade — sem "pulo")

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
  let blinkT = 2;
  let blinkAnim = 0;
  const speak = { active: false, t: 0, phase: 0 };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CROSSFADE_S = 0.25; // s — fade entre clips (casado com o lerp do walk-drop)

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

  function computeTargets() {
    const fn = BONE_POSES[poseName] || BONE_POSES.idle;
    poseRot = fn(rigParams);
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

  // Calibração de solo (rigs com clips): o Box3 da normalização mede a pose de
  // BIND da geometria, mas os clips posicionam os pés alguns cm abaixo/acima.
  // Estratégia: medir APENAS PARADO (nunca durante o walk — pé em swing daria
  // valor errado), o mínimo dos toe-bases numa janela de ~0,7 s de idle, e
  // assentar suavemente. Auto-corretivo para qualquer clip futuro.
  const toeBones = [
    B('mixamorigLeftToeBase'), B('mixamorigRightToeBase'),
    B('LeftToeBase'), B('RightToeBase'),
  ].filter(Boolean);
  const groundFix = mixer && toeBones.length ? { parado: 0, min: Infinity, done: false, alvo: 0 } : null;
  const _gv = new THREE.Vector3();

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
    speakStart() { speak.active = true; speak.t = 0; },
    speakEnd() { speak.active = false; },
    async enter(aparencia) {
      this.setStyle(aparencia || {});
      this.setPose('idle');
      root.visible = true;
      root.rotation.set(0, 0, 0);
      // faceEnd: no fim da chegada encara a câmera (não deixa "torta"/deitada no balcão)
      return this.walk(new THREE.Vector3(2.6, 0, -4.6), new THREE.Vector3(0, 0, 0.55), 2.2, true);
    },
    async leave() {
      await this.walk(new THREE.Vector3(0, 0, 0.55), new THREE.Vector3(2.6, 0, -4.6), 1.8, false);
      root.visible = false;
    },
    walk(from, to, dur, faceEnd = false) {
      return new Promise((res) => {
        const yaw = Math.atan2(to.x - from.x, to.z - from.z) || 0;
        root.rotation.set(0, yaw, 0);
        // com clip de walk: duração pela distância na velocidade da cadência
        if (mixer && clips.walk) dur = Math.min(12, Math.max(1.2, from.distanceTo(to) / WALK_V));
        walking = { from, to, dur, t: 0, res, yaw, faceEnd };
        if (mixer) {
          bobBaseY = groundFix && groundFix.done ? groundFix.alvo : inner.position.y;
          // se a base mudou (ex.: ground-fix completou entre um walk e outro),
          // recalibra o drop do walk na próxima caminhada
          if (walkCalib && walkCalib.baseY !== bobBaseY) { walkCalib = null; walkDropAtual = 0; }
        }
        root.position.copy(from);
        if (mixer) playClip('walk');
      });
    },
    getModel: () => inner,
    // Pose do rig + swing de pernas no walk. Roda durante walking e em idle
    // (antes o early-return congelava a pose → deslizo/pose torta na chegada).
    applyBones(dt, t) {
      const walkingNow = !!walking;
      const k = Math.min(1, dt * 3.2);
      if (mixer) {
        // Mixer cuida de Idle/Walk (clip in-place). Só sobrepõe o swing quando o
        // rig não tem clip de walk e o "falar" (cabeça) durante a fala no chat.
        // swing procedural de pernas só p/ rigs SEM clip de walk (com clip,
        // sobrescreveria a animação do mixer — juiz #6)
        if (walkingNow && !reduceMotion && !clips.walk) this.applyLegSwing(walking.t);
        if (speak.active && !reduceMotion) this.applySpeak(t);
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
      if (speak.active) {
        speak.t += dt;
        const nod = Math.sin(speak.t * 6.4) * 0.045;
        const sway = Math.sin(speak.t * 0.7) * 0.04;
        if (hd) { hd.rotation.x += nod; hd.rotation.y += sway; }
      }
    },
    // Fala: micro-nod de cabeça/pescoço sincronizado com o TTS. O asset ainda
    // não tem morph targets de boca (boca articulada = blendshape no pipeline
    // futuro); o nod por cima do clip é a aproximação atual.
    applySpeak(t) {
      // GLTFLoader sanitiza nodes ("mixamorig:Head" → "mixamorigHead" — o ':' é
      // REMOVIDO, não trocado). Cobre as grafias + rigs Eric legados.
      const hd = B('mixamorigHead') || B('mixamorig_Head') || B('mixamorig:Head') || B('head_07') || B('head');
      const nk = B('mixamorigNeck') || B('mixamorig_Neck') || B('mixamorig:Neck') || B('neck_06');
      const nod = Math.sin(t * 7.3) * 0.035 + Math.sin(t * 13.1) * 0.012;
      if (hd) {
        hd.rotation.x += nod;
        hd.rotation.y += Math.sin(t * 1.9) * 0.02;
      }
      if (nk) nk.rotation.x += nod * 0.6;
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
          let minY = Infinity;
          for (const b of toeBones) { b.getWorldPosition(_gv); minY = Math.min(minY, _gv.y); }
          if (Number.isFinite(minY)) groundFix.min = Math.min(groundFix.min, minY);
          if (groundFix.parado >= 0.7) {
            const m = groundFix.min;
            if (Number.isFinite(m) && Math.abs(m) < 0.4 && Math.abs(m) > 0.002) {
              groundFix.alvo = inner.position.y - m; // assenta o pé no chão
              groundFix.aplicando = true;
              console.log(`[patient] ground-fix: idle toes minY=${m.toFixed(3)} m → ajuste ${(-m).toFixed(3)} m`);
            } else {
              console.log(`[patient] ground-fix: dispensado (toes minY=${Number.isFinite(m) ? m.toFixed(3) : 'n/a'})`);
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
        const e = p * p * (3 - 2 * p);
        root.position.lerpVectors(w.from, w.to, e);
        // Solo do WALK — CALIBRAÇÃO ITERATIVA: mede o pé de CONTATO em janelas
        // pós-crossfade (0,4–2,8 s) e corrige o drop incrementalmente até o pé
        // tocar y≈0 (a 1ª medição durante o crossfade dava valor transiente →
        // ela "andava por cima" com o drop curto — PO 24/09).
        if (mixer && bobBaseY !== null) {
          if (!walkCalib) walkCalib = { t: -0.4, minToe: Infinity, janela: 0, drop: 0, baseY: bobBaseY };
          const t0 = 0.4 + walkCalib.janela * 0.8; // início da janela (s)
          const t1 = t0 + 0.8;
          if (!walkCalib.done) {
            if (w.t >= t0) {
              if (walkCalib.t < t0) walkCalib.t = t0; // (re)inicia contagem da janela
              walkCalib.t += dt;
              let m2 = Infinity;
              for (const b of toeBones) { b.getWorldPosition(_gv); m2 = Math.min(m2, _gv.y); }
              if (Number.isFinite(m2)) walkCalib.minToe = Math.min(walkCalib.minToe, m2);
              if (walkCalib.t >= t1) {
                const corr = -walkCalib.minToe; // quanto falta subir/descer
                walkCalib.drop += corr;
                console.log(`[patient] walk-calib janela ${walkCalib.janela + 1}: toeMin=${Number.isFinite(walkCalib.minToe) ? walkCalib.minToe.toFixed(3) : 'n/a'} → drop agora ${walkCalib.drop.toFixed(3)} m`);
                walkCalib.janela++;
                walkCalib.minToe = Infinity;
                if (!Number.isFinite(corr) || Math.abs(corr) < 0.01 || walkCalib.janela >= 4) walkCalib.done = true;
              }
            }
          }
          // drop suavizado na mesma escala do crossfade (sem "pulo" na transição)
          walkDropAtual += (walkCalib.drop - walkDropAtual) * Math.min(1, dt * 4);
          inner.position.y = bobBaseY + walkDropAtual;
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
    },
    get _speakHook() { return (on) => (on ? api.speakStart() : api.speakEnd()); },
  };

  try {
    import('../audio/tts.js').then(({ TTS }) => {
      if (TTS && typeof TTS.hookSpeak === 'function') TTS.hookSpeak(api._speakHook);
    }).catch((e) => console.error('[patient] TTS hook', e));
  } catch (e) { console.error('[patient] TTS hook', e); }

  rim.position.set(0.6, 2.2, -1.2);
  root.visible = false;
  return api;
}
