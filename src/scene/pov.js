// F2 — Controle de câmera em 1ª pessoa (POV do farmacêutico) por pontos de interesse.
// Look-around por drag (mouse/touch) com limites + snapping de volta ao enquadramento,
// e tween suave entre as zonas PACIENTE / COMPUTADOR / MESA. Respeita prefers-reduced-motion.
import * as THREE from 'three';

const easeInOut = (p) => p * p * (3 - 2 * p);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Zonas alinhadas à cena procedural (pharmacy.js):
// · paciente   — frente do balcão, olhando o cliente (z ~0.6)
//  · computador — monitor do bulário sobre a bancada, à esquerda (x -1.4)
//  · mesa       — bandeja do kit TLAC na mesa lateral, à direita (x 2.45)
export const ZONAS = {
  paciente: { pos: new THREE.Vector3(0, 1.62, 2.7), yaw: 0, pitch: -0.089 },
  computador: { pos: new THREE.Vector3(-0.78, 1.56, 2.48), yaw: 0.62, pitch: -0.33 },
  mesa: { pos: new THREE.Vector3(1.6, 1.52, 2.42), yaw: -0.7, pitch: -0.4 },
};

const LIM_YAW = 0.6;   // limite do look-around (rad)
const LIM_PITCH = 0.3;
const DUR_TWEEN = 0.9;

  // Andar livre (WASD) — limites do salão (piso 18x13, paredes em ±9 / z -6.5..6.5)
  const VEL = 2.6; // m/s
  const ANDAR = { x0: -8.4, x1: 8.4, z0: -5.6, z1: 5.8, balcaoX: 3.4, balcaoZ: 2.0 };
  const EYE = 1.6;

  // Colisões (PO 25/09: "os obstáculos voltam a bloquear — balcão, prateleiras,
  // modelos"). AABBs calibrados na cena (pharmacy.js): balcão central (z~1,55),
  // gôndolas 2,4×0,5 m (fundo e paredes) e vitrine. Margem ~0,25 m do corpo.
  const OBSTACULOS = [
    { x0: -3.6, x1: 3.6, z0: 1.0, z1: 2.15 },      // balcão central
    { x0: -4.65, x1: -1.75, z0: -5.15, z1: -4.05 }, // gôndola fundo esq
    { x0: -1.25, x1: 1.65, z0: -5.95, z1: -4.85 },  // gôndola fundo centro
    { x0: -8.3, x1: -7.3, z0: -3.65, z1: -0.75 },   // gôndola parede esq 1
    { x0: -8.3, x1: -7.3, z0: -5.85, z1: -2.95 },   // gôndola parede esq 2
    { x0: 7.1, x1: 8.1, z0: -4.85, z1: -1.95 },     // gôndola parede dir
    { x0: 7.7, x1: 8.7, z0: -2.0, z1: -1.0 },       // vitrine parede dir
  ];
  const colide = (x, z) => OBSTACULOS.some((o) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1);

  // Zona por proximidade (andar livre): a mais próxima dentro do raio, ou null.
  const RAIO_ZONA = 1.45;
  const zonaPorPos = (p) => {
    let melhor = null, dMin = RAIO_ZONA;
    for (const [nome, z] of Object.entries(ZONAS)) {
      const d = Math.hypot(p.x - z.pos.x, p.z - z.pos.z);
      if (d < dMin) { dMin = d; melhor = nome; }
    }
    return melhor;
  };

export function createPOV({ camera, addTicker, canvas, povControl }) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  camera.rotation.order = 'YXZ';

  let zonaAtual = 'paciente';
  let off = { yaw: 0, pitch: 0 };          // deslocamento do look-around (drag)
  let tween = null;                        // { t, dur, fromPos, toPos, fromYaw, toYaw, fromPitch, toPitch, snap }
  let drag = null;                         // { id, x, y, yaw0, pitch0, moveu }
  let retorno = null;                      // mola de volta ao enquadramento da zona
  const listeners = new Set();

  // modo livre (WASD): congela o enquadramento atual como base (sem mola de retorno)
  let livre = false;
  let baseYaw = ZONAS.paciente.yaw;
  let basePitch = ZONAS.paciente.pitch;
  const teclas = new Set();

  const aplicar = () => {
    camera.rotation.set(basePitch + off.pitch, baseYaw + off.yaw, 0);
  };

  function irPara(nome, { instantaneo = false } = {}) {
    if (!ZONAS[nome]) return;
    zonaAtual = nome;
    livre = false;
    teclas.clear();
    const z = ZONAS[nome];
    baseYaw = z.yaw;
    basePitch = z.pitch;
    off = { yaw: 0, pitch: 0 };
    retorno = null;
    if (instantaneo || reduceMotion) {
      tween = null;
      camera.position.copy(z.pos);
      aplicar();
    } else {
      tween = {
        t: 0,
        dur: DUR_TWEEN,
        fromPos: camera.position.clone(),
        toPos: z.pos.clone(),
        fromYaw: camera.rotation.y,
        toYaw: z.yaw,
        fromPitch: camera.rotation.x,
        toPitch: z.pitch,
      };
    }
    listeners.forEach((fn) => fn(zonaAtual));
  }

  // Entra no modo livre: congela o enquadramento atual como base do olhar
  const entrarLivre = () => {
    if (livre) return;
    livre = true;
    tween = null;
    retorno = null;
    baseYaw = camera.rotation.y;
    basePitch = camera.rotation.x;
    off = { yaw: 0, pitch: 0 };
  };

  // Mola do look-around de volta ao enquadramento da zona (snapping suave)
  const soltarLook = () => {
    if (livre) return; // andando livre: olhar fica onde ficou
    if (Math.abs(off.yaw) < 0.01 && Math.abs(off.pitch) < 0.01) { off = { yaw: 0, pitch: 0 }; return; }
    retorno = { t: 0, dur: 0.4, fromYaw: off.yaw, fromPitch: off.pitch };
  };

  addTicker((dt, t) => {
    // tween de zona
    if (tween) {
      tween.t += dt;
      const p = clamp(tween.t / tween.dur, 0, 1);
      const e = easeInOut(p);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      camera.rotation.y = tween.fromYaw + (tween.toYaw - tween.fromYaw) * e;
      camera.rotation.x = tween.fromPitch + (tween.toPitch - tween.fromPitch) * e;
      if (p >= 1) tween = null;
      return;
    }
    // andar livre (WASD): move no plano olhando para o yaw atual
    if (livre) {
      const f = (teclas.has('w') ? 1 : 0) - (teclas.has('s') ? 1 : 0);
      const r = (teclas.has('d') ? 1 : 0) - (teclas.has('a') ? 1 : 0);
      if (f || r) {
        const sy = Math.sin(baseYaw + off.yaw), cy = Math.cos(baseYaw + off.yaw);
        let nx = camera.position.x + (-sy * f + cy * r) * VEL * dt;
        let nz = camera.position.z + (-cy * f - sy * r) * VEL * dt;
        nx = clamp(nx, ANDAR.x0, ANDAR.x1);
        nz = clamp(nz, ANDAR.z0, ANDAR.z1);
        // colisão com deslize por eixo: tenta o movimento completo, senão
        // desliza ao longo do obstáculo (não gruda)
        const px = camera.position.x, pz = camera.position.z;
        if (!colide(nx, nz)) camera.position.set(nx, EYE, nz);
        else if (!colide(nx, pz)) camera.position.set(nx, EYE, pz);
        else if (!colide(px, nz)) camera.position.set(px, EYE, nz);
      }
      aplicar();
      // Zona por PROXIMIDADE (PO 24/09): andando livre, a zona acompanha onde
      // o jogador está — o hint da tecla E e o próprio E ficam contextuais.
      const zonaPerto = zonaPorPos(camera.position);
      if (zonaPerto !== zonaAtual) {
        zonaAtual = zonaPerto;
        listeners.forEach((fn) => fn(zonaAtual));
      }
      return;
    }
    // mola do look-around
    if (retorno) {
      retorno.t += dt;
      const p = clamp(retorno.t / retorno.dur, 0, 1);
      const e = easeInOut(p);
      off.yaw = retorno.fromYaw * (1 - e);
      off.pitch = retorno.fromPitch * (1 - e);
      if (p >= 1) retorno = null;
    }
    const z = ZONAS[zonaAtual];
    // micro-respiração (idle) só na zona do paciente, substituindo o balanço do scene.js
    const bob = zonaAtual === 'paciente' && !reduceMotion && !drag ? Math.sin(t * 1.1) * 0.008 : 0;
    camera.position.set(z.pos.x, z.pos.y + bob, z.pos.z);
    aplicar();
  });

  // ---- look-around por drag (mouse + touch via Pointer Events) ----
  const eNavegavel = () => !tween && !drag;
  canvas.addEventListener('pointerdown', (e) => {
    if (document.pointerLockElement === canvas) return; // com lock, o mouse já gira
    if (tween || retorno) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw0: off.yaw, pitch0: off.pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / window.innerWidth;
    const dy = (e.clientY - drag.y) / window.innerHeight;
    off.yaw = clamp(drag.yaw0 - dx * 2.4, -LIM_YAW, LIM_YAW);
    off.pitch = clamp(drag.pitch0 - dy * 1.6, -LIM_PITCH, LIM_PITCH);
  });
  const fimDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    soltarLook();
  };
  canvas.addEventListener('pointerup', fimDrag);
  canvas.addEventListener('pointercancel', fimDrag);

  // ---- Pointer Lock (PO 24/09): clicar no jogo trava o mouse (modo "tela
  // cheia" — olhar livre 360°), ESC destrava (nativo do browser). O drag com
  // botão pressionado continua valendo como fallback. ----
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      drag = null;            // cancela drag pendente do clique que travou
      entrarLivre();          // olhar livre ilimitado enquanto destravado
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (livre) {
      // modo livre: olhar 360°
      baseYaw -= e.movementX * 0.0024;
      basePitch = clamp(basePitch - e.movementY * 0.002, -1.25, 0.95);
      off = { yaw: 0, pitch: 0 };
    } else {
      // numa zona (1/2/3): look-around com os limites originais
      off.yaw = clamp(off.yaw - e.movementX * 0.0024, -LIM_YAW, LIM_YAW);
      off.pitch = clamp(off.pitch - e.movementY * 0.002, -LIM_PITCH, LIM_PITCH);
    }
    aplicar();
  });

  // Teclado: WASD anda livre; 1/2/3 (ou ←/→) navegam entre os pontos de interesse
  const ORDEM = ['paciente', 'computador', 'mesa'];
  document.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
      teclas.add(k);
      entrarLivre();
      e.preventDefault();
      return;
    }
    if (e.key === '1') irPara('paciente');
    else if (e.key === '2') irPara('computador');
    else if (e.key === '3') irPara('mesa');
    else if (e.key === 'ArrowLeft' && eNavegavel()) {
      const i = ORDEM.indexOf(zonaAtual);
      irPara(ORDEM[(i + ORDEM.length - 1) % ORDEM.length]);
    } else if (e.key === 'ArrowRight' && eNavegavel()) {
      const i = ORDEM.indexOf(zonaAtual);
      irPara(ORDEM[(i + 1) % ORDEM.length]);
    }
  });
  document.addEventListener('keyup', (e) => { teclas.delete(e.key.toLowerCase()); });
  window.addEventListener('blur', () => teclas.clear());

  povControl.owned = true; // desliga o balanço idle do scene.js (câmera agora é do POV)
  camera.position.copy(ZONAS.paciente.pos);
  aplicar();

  return {
    irPara,
    zonaAtual: () => zonaAtual,
    onChange: (fn) => listeners.add(fn),
    navegando: () => Boolean(tween || drag),
  };
}
