---
name: SKILL_B_CAMERA_INTERACAO
description: Câmera POV em 1ª pessoa por zonas (tween + look-around com limites e mola) e interação por proximidade (tecla E) em Three.js vanilla, sem React e sem engine de física.
variants:
  - camera_zones
  - tween_camera
  - drag_lookaround
  - proximity_interaction
  - dialog_focus
  - bone_axis_fix
setup:
  - Frontend vanilla Three.js + Vite (SEM React/R3F/Rapier)
  - Cena com pontos de interesse (paciente, computador, mesa)
  - HUD DOM com Tailwind para banner/ações
  - three r169+, câmera com rotation.order = 'YXZ'
---

# Skill B — Câmera POV e Interação (Three.js vanilla)

## Papel

Você é o **Engenheiro de Câmera e Interação vanilla Three.js**. Sua função é implementar
o POV do jogador por **zonas de interesse** (tween suave + look-around limitado), os
**gatilhos de interação por proximidade** e o **foco de diálogo** — tudo com DOM puro para
HUD e zero dependências de React.

## Quando Usar

- Adicionar/ajustar uma zona de câmera (paciente, computador, mesa, novo ponto de interesse).
- Criar interação "chegue perto e aperte E".
- Ajustar limites de look-around (yaw/pitch) e o snap de retorno.
- Corrigir eixos de bones de um GLB rigado importado do Blender.
- Focar a câmera/UI no diálogo da anamnese.

## Pré-condições

1. `camera.rotation.order = 'YXZ'` (evita roll e gimbal estranho).
2. Um `addTicker(fn)` central (loop único) — a câmera atualiza nele, não em RAF próprio.
3. `prefers-reduced-motion` respeitado (tween vira teleporte quando ativo).
4. HUD em DOM com IDs estáveis (`#pressione-e`, `#chat`, `#chat-input`).

## Fluxo Padronizado

```
1. Definir ZONAS: { pos: Vector3, yaw, pitch } por ponto de interesse
2. irPara(zona): tween posição+ângulos (easeInOut, ~0.9s) OU instantâneo (reduced-motion)
3. Look-around: pointerdown/move/up → off.yaw/off.pitch com clamp; soltar → mola de volta
4. Interação: ticker calcula alvo mais próximo em XZ (dist ≤ raio) → mostra banner "Pressione E"
5. keydown E (com guard de input focado) → dispara ação do alvo (atender/bulário/TLAC)
6. Ao focar o chat: exitPointerLock + focus no input
7. Bone fix: aplicar euler de repouso + delta calibrado por bone, de forma idempotente
```

## Regras de Negócio

1. **Jogador não anda livre na cena** — a câmera viaja entre zonas. Movimento livre WASD
   é legado e não é o padrão do FarmaCheck.
2. **Mouse/touch controla apenas yaw e pitch** — roll sempre 0.
3. **Nunca posicionar câmera por `camera.position` a cada frame fora do ticker** — um só
   dono da câmera (o módulo POV), com `povControl.owned = true` desligando o idle de outro módulo.
4. **Alvo de interação é o mais PRÓXIMO dentro do raio** (evita sobreposição paciente/mesa/PC).
5. **Guard de foco:** se `document.activeElement` é input/textarea/select, teclas de atalho
   (E, 1/2/3, setas) não disparam.
6. **Correção de eixos de bone é idempotente:** guardar o euler de repouso no load e somar
   apenas deltas — nunca mutar o repouso acumulando `+=` a cada frame.
7. **Reduced motion desliga:** tween, bob de respiração e oscilação de caminhada.

## Restrições Técnicas

- **Proibido:** `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, Zustand,
  `cannon-es`. A stack é `three` + DOM + Tailwind.
- **Sem engine de física.** "Colisão" = limites de zona + clamps de look-around + raio de
  interação. Não adicionar Rapier/Ammo sem aprovação do PO.
- Drag via **Pointer Events** (`pointerdown/move/up/cancel` + `setPointerCapture`) — cobre
  mouse e touch no mesmo código.
- Limites de fábrica: `LIM_YAW = 0.6 rad`, `LIM_PITCH = 0.3 rad`, `DUR_TWEEN = 0.9 s`.
- Raio de interação de fábrica: paciente `2.0 m`, computador `1.7 m`, mesa `1.7 m` (distância
  2D XZ).
- Bone delta: interpolar com `lerp(dt * 3.2)` e aplicar sobre o repouso.

## Exemplo 1 — Zonas + tween + drag (Three.js vanilla)

```js
import * as THREE from 'three';

const easeInOut = (p) => p * p * (3 - 2 * p);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ZONAS = {
  paciente:   { pos: new THREE.Vector3(0, 1.62, 2.7),     yaw: 0,      pitch: -0.089 },
  computador: { pos: new THREE.Vector3(-0.78, 1.56, 2.48), yaw: 0.62,  pitch: -0.33 },
  mesa:       { pos: new THREE.Vector3(1.6, 1.52, 2.42),   yaw: -0.7,  pitch: -0.4 },
};

export function createPOV({ camera, addTicker, canvas }) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  camera.rotation.order = 'YXZ';

  let zonaAtual = 'paciente';
  let off = { yaw: 0, pitch: 0 };
  let tween = null, retorno = null, drag = null;

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
        t: 0, dur: 0.9,
        fromPos: camera.position.clone(), toPos: z.pos.clone(),
        fromYaw: camera.rotation.y, toYaw: z.yaw,
        fromPitch: camera.rotation.x, toPitch: z.pitch,
      };
    }
  }

  addTicker((dt) => {
    if (tween) {
      tween.t += dt;
      const e = easeInOut(clamp(tween.t / tween.dur, 0, 1));
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      camera.rotation.y = tween.fromYaw + (tween.toYaw - tween.fromYaw) * e;
      camera.rotation.x = tween.fromPitch + (tween.toPitch - tween.fromPitch) * e;
      if (tween.t >= tween.dur) tween = null;
      return;
    }
    if (retorno) {
      retorno.t += dt;
      const e = easeInOut(clamp(retorno.t / retorno.dur, 0, 1));
      off.yaw = retorno.fromYaw * (1 - e);
      off.pitch = retorno.fromPitch * (1 - e);
      if (retorno.t >= retorno.dur) retorno = null;
    }
    const z = ZONAS[zonaAtual];
    const bob = zonaAtual === 'paciente' && !reduceMotion && !drag ? Math.sin(performance.now() / 900) * 0.008 : 0;
    camera.position.set(z.pos.x, z.pos.y + bob, z.pos.z);
    aplicar();
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (tween || retorno) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw0: off.yaw, pitch0: off.pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / window.innerWidth;
    const dy = (e.clientY - drag.y) / window.innerHeight;
    off.yaw = clamp(drag.yaw0 - dx * 2.4, -0.6, 0.6);
    off.pitch = clamp(drag.pitch0 - dy * 1.6, -0.3, 0.3);
  });
  const fim = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    retorno = { t: 0, dur: 0.4, fromYaw: off.yaw, fromPitch: off.pitch };
  };
  canvas.addEventListener('pointerup', fim);
  canvas.addEventListener('pointercancel', fim);

  document.addEventListener('keydown', (e) => {
    if (/input|textarea|select/i.test(e.target?.tagName || '')) return;
    if (e.key === '1') irPara('paciente');
    else if (e.key === '2') irPara('computador');
    else if (e.key === '3') irPara('mesa');
  });

  camera.position.copy(ZONAS.paciente.pos);
  aplicar();
  return { irPara, zonaAtual: () => zonaAtual, navegando: () => Boolean(tween || drag) };
}
```

## Exemplo 2 — Interação por proximidade + tecla E

```js
// alvo XZ (mundo) + raio (m) + ação
const ALVOS = [
  { nome: 'paciente',   pos: [0, 0.9],    raio: 2.0, acao: 'atender' },
  { nome: 'computador', pos: [-1.4, 1.78], raio: 1.7, acao: 'bulario' },
  { nome: 'mesa',       pos: [2.45, 1.45], raio: 1.7, acao: 'tlac' },
];

const dist2D = (px, pz, tx, tz) => Math.hypot(px - tx, pz - tz);

export function initInteracao({ game, pov, addTicker, atendimento }) {
  const banner = document.getElementById('pressione-e');
  const chat = document.getElementById('chat');
  let alvoAtual = null;

  addTicker(() => {
    const cam = pov.getPosition();
    const emAcao = game.state === 'ANAMNESE' || game.state === 'DECISAO';
    if (!emAcao) return banner.classList.add('hidden');

    let perto = null, melhorD = Infinity;
    for (const a of ALVOS) {                       // alvo MAIS PRÓXIMO vence
      const d = dist2D(cam.x, cam.z, a.pos[0], a.pos[1]);
      if (d <= a.raio && d < melhorD) { melhorD = d; perto = a; }
    }
    alvoAtual = perto;
    if (perto) { banner.querySelector('b').textContent = perto.nome; banner.classList.remove('hidden'); }
    else banner.classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e') return;
    if (/input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
    if (!alvoAtual) return;
    if (alvoAtual.acao === 'atender') {
      atendimento.voltarPaciente();
      document.exitPointerLock?.();                // digitar livre no chat
      document.getElementById('chat-input')?.focus();
    }
    else if (alvoAtual.acao === 'bulario') atendimento.abrirPainel('bulario', 'computador');
    else if (alvoAtual.acao === 'tlac') atendimento.abrirPainel('tlac', 'mesa');
  });

  return { alvoAtual: () => alvoAtual };
}
```

## Exemplo 3 — Correção de eixos de bone (idempotente)

```js
// guardar repouso UMA vez; somar apenas delta interpolado a cada frame
const restEuler = new Map();
const curRot = new Map();
inner.traverse((o) => {
  if (o.isBone) { restEuler.set(o.name, o.rotation.clone()); curRot.set(o.name, new THREE.Euler()); }
});

const k = Math.min(1, dt * 3.2);
for (const [name, bone] of bones) {
  const alvo = poseRot[name] || [0, 0, 0];         // delta calibrado (rigParams.json)
  const c = curRot.get(name);
  c.x += (alvo[0] - c.x) * k;
  c.y += (alvo[1] - c.y) * k;
  c.z += (alvo[2] - c.z) * k;
  const r = restEuler.get(name);
  bone.rotation.set(r.x + c.x, r.y + c.y, r.z + c.z); // repouso + delta, nunca acumulado
}
```

## Checklist de Validação

- [ ] Câmera viaja entre zonas com tween suave; sem roll.
- [ ] Drag olha em volta e volta ao enquadramento ao soltar.
- [ ] Teclas 1/2/3 (e setas) navegam; atalhos não disparam com input focado.
- [ ] Banner "Pressione E" aparece só no alvo mais próximo dentro do raio.
- [ ] E abre a ação certa; ao atender, chat recebe foco e pointer lock é liberado.
- [ ] Bone fix sem distorção e sem acumular a cada frame.
- [ ] `prefers-reduced-motion` elimina tween/bob.
- [ ] FPS estável ≥ 60.

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_B_CAMERA_INTERACAO.md` (substitui o antigo `SKILL_B_FISICA_R3F.md`)
- **Implementação de referência:** `src/scene/pov.js`, `src/ui/interacao.js`, `src/scene/patient.js`
- **Data de revisão:** 2026-09-14
- **Status:** Ativa
- **Dependências:** `three` (r169+), DOM + Tailwind, `addTicker` central
