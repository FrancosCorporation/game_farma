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

export function createPOV({ camera, addTicker, canvas, povControl }) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  camera.rotation.order = 'YXZ';

  let zonaAtual = 'paciente';
  let off = { yaw: 0, pitch: 0 };          // deslocamento do look-around (drag)
  let tween = null;                        // { t, dur, fromPos, toPos, fromYaw, toYaw, fromPitch, toPitch, snap }
  let drag = null;                         // { id, x, y, yaw0, pitch0, moveu }
  let retorno = null;                      // mola de volta ao enquadramento da zona
  const listeners = new Set();

  const aplicar = () => {
    const z = ZONAS[zonaAtual];
    camera.rotation.set(z.pitch + off.pitch, z.yaw + off.yaw, 0);
  };

  function irPara(nome, { instantaneo = false } = {}) {
    if (!ZONAS[nome]) return;
    zonaAtual = nome;
    const z = ZONAS[nome];
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

  // Mola do look-around de volta ao enquadramento da zona (snapping suave)
  const soltarLook = () => {
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

  // Teclado: 1/2/3 (ou ←/→) navegam entre os pontos de interesse
  const ORDEM = ['paciente', 'computador', 'mesa'];
  document.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
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
