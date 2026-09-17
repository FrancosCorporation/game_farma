---
name: SKILL_F_GAMEPLAY_CAMERA_RAYCAST
description: Gameplay de câmera e apontamento em Three.js vanilla — câmera 1ª/3ª pessoa com suavização (lag), raycast de seleção/tiro e alternância de perspectiva, sem React.
variants:
  - camera_tpp_suavizada
  - raycast_selecao
  - raycast_tiro_shooter
  - alternancia_perspectiva
setup:
  - Three.js vanilla + Vite (SEM React/R3F/Rapier)
  - Ticker central (um loop de render)
  - POV por zonas já configurado (Skill B) quando for 1ª pessoa
  - Raycaster do Three.js disponível
---

# Skill F — Gameplay: Câmera, Raycast e Interação (vanilla)

## Papel

Você é o **Engenheiro de Controle e Interação**. Implementa a camada de câmera
(1ª/3ª pessoa) e de apontamento/seleção (raycast) em **Three.js vanilla**, seguindo
os princípios de camera-lag, raycasting e alternância de perspectiva.

## Quando Usar

- Suavizar câmera de acompanhamento (3ª pessoa) com "lag".
- Fazer o jogador **apontar/clicar** em objetos (pegar item, falar com NPC).
- Implementar seleção/tiro à distância (linha de raio).
- Alternar 1ª/3ª pessoa.

> **Nota FarmaCheck:** o jogo base usa **POV por zonas + interação por proximidade**
> (Skill B) — não raycast. Use raycast quando a mecânica exigir apontar de verdade.

## Princípios por tema

### 1. Câmera TPP com suavização (lag) — -PZ531zo_P0

```js
// no ticker central: interpolando a câmera atrás do alvo
const offset = new THREE.Vector3(0, 1.8, -3.5);
const alvo = new THREE.Vector3().copy(playerPos).add(offset);
camera.position.lerp(alvo, 0.08);                 // 0.08 = lag suave
camera.lookAt(playerPos.x, playerPos.y + 1.5, playerPos.z);
```
> Quanto menor o fator do lerp, mais "lag" (peso). Equivalente ao valor 15 do blueprint
> do Unreal, invertido.

### 2. Raycast de seleção/interação

```js
const raycaster = new THREE.Raycaster();          // reusar instância, não criar por frame
const centro = new THREE.Vector2(0, 0);           // centro da tela
raycaster.setFromCamera(centro, camera);
const hits = raycaster.intersectObjects(interactables, true);
const alvo = hits.find((h) => h.distance <= alcance);
if (alvo) alvo.object.userData.onFocus?.();
```

Para clique em qualquer ponto da tela (mouse):

```js
canvas.addEventListener('pointerdown', (e) => {
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(interactables, true)[0];
  if (hit) hit.object.userData.onPick?.();
});
```

### 3. Raycast de tiro (mecânica FPS)

```js
// origem = câmera; direção = para onde ela aponta
const origem = camera.getWorldPosition(new THREE.Vector3());
const direcao = camera.getWorldDirection(new THREE.Vector3());
raycaster.set(origem, direcao);
raycaster.far = alcance;
const hit = raycaster.intersectObjects(alvosDeDano, true)[0];
if (hit) aplicarDano(hit.object, hit.point, hit.face?.normal);
```

### 4. Alternância 1ª/3ª pessoa

```js
// estado simples de gameplay (não store reativo)
let perspectiva = 'primeira';
function alternarPerspectiva() {
  perspectiva = perspectiva === 'primeira' ? 'terceira' : 'primeira';
  playerMesh.visible = perspectiva === 'terceira';
  camera.position.copy(perspectiva === 'primeira' ? ZONAS.paciente.pos : offsetTPP());
}
```
- **1ª pessoa:** imersão (FarmaCheck usa POV por zonas — Skill B).
- **3ª pessoa:** lê-se o corpo do avatar; câmera atrás/ombro com lag.

## Regras de Negócio

1. **Raycast contra `interactables`** (lista curada), nunca contra a cena inteira (perf).
2. **Reusar a instância do Raycaster**; não instanciar a cada frame.
3. **Throttle:** raycast contínuo só quando a mecânica exige (mira); caso contrário, só no evento.
4. **Câmera não atravessa geometria:** validar com um raycast curto da câmera ao alvo e
   encurtar a distância (sem engine de física).
5. **Perspectiva é estado de gameplay**, declarado explicitamente — não mutar por efeito colateral.
6. **Um só dono da câmera:** o módulo ativo (POV/share) controla posição/rotação; desligar
   qualquer bob/idle concorrente.

## Restrições Técnicas

- **Proibido:** `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, Zustand,
  `cannon-es`. Stack = `three` + DOM.
- Sem engine de física; colisão de câmera = raycast + clamp.
- `camera.rotation.order = 'YXZ'` para 1ª pessoa (Yaw→Pitch→Roll).
- Aplicar `userData.onPick/onFocus` nos objetos — handlers fora da malha, fáceis de trocar.
- `prefers-reduced-motion`: reduzir/eliminar lag e transições.

## Exemplo — pickups por clique (vanilla)

```js
const interagiveis = [];
for (const mesh of itensDaCena) {
  mesh.userData.onPick = () => coletar(mesh);
  interagiveis.push(mesh);
}

canvas.addEventListener('pointerdown', (e) => {
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(interagiveis, true)[0];
  hit?.object.userData.onPick?.();
});
```

## Checklist

- [ ] Câmera (1ª/3ª) funcional, com suavização quando 3ª pessoa.
- [ ] Raycast restrito aos objetos interativos e reutilizando instância.
- [ ] Sem atravessar geometria (raycast de validação).
- [ ] Um só dono da câmera (sem bob concorrente).
- [ ] `prefers-reduced-motion` respeitado.
- [ ] 60 FPS mantidos (raycast throttled).

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_F_GAMEPLAY_CAMERA_RAYCAST.md`
- **Data de revisão:** 2026-09-14 (antes: exemplos R3F — corrigido para vanilla)
- **Status:** Ativa
- **Fontes:** F3INIzAm1bI, -PZ531zo_P0, ECqUrT7IdqQ, B5vEfuLS2Qc
- **Dependências:** Three.js (Raycaster), ticker central; Skill B para POV por zonas
