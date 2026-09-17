# MASTER PLAN — Simulador Clínico Web (game_farma)

> ## ⚠️ REVISÃO — 14/09/2026 (ler antes de usar)
>
> Este plano foi escrito na era **fotorrealista** e com uma migração planejada para React.
> Duas diretrizes mudaram; o restante (pipeline de assets, Blender MCP como hub, orçamentos,
> isolamento de GPU) continua válido.
>
> 1. **NÃO há migração para React Three Fiber / Rapier / Zustand.** O frontend permanece
>    **vanilla Three.js + Vite + Tailwind + DOM**. Skills B/C/F do `SKILL_BANK` estavam
>    escritas para R3F e foram corrigidas para a stack real.
> 2. **A direção de arte NÃO é fotorrealista.** O alvo é **3D estilizado casual mobile**
>    (Pixar-like, low-poly, PBR suave). Ver `docs/DIRETRIZES_ARTE_ESTILIZADA.md`.
>    Todo asset/textura/prompt deve nascer estilizado — realismo está arquivado em
>    `future_projects/realism_core/`.
>
> Trate as seções 3.x de assets como referência de infraestrutura; ignore-as onde falarem
> em realismo, e ignore integralmente a estratégia de migração React.

## 1. Resumo Executivo

O `game_farma` é um simulador clínico em primeira pessoa, atualmente em **vanilla Three.js + Vite**. A meta é torná-lo **100% jogável, fotorrealista e otimizado**, com um pipeline de assets 3D capaz de gerar personagens, objetos, ambientes internos e elementos naturais de forma automatizada e padronizada.

A estratégia definitiva consolidada é:

1. **Migrar o frontend para React Three Fiber (R3F) + @react-three/rapier + Zustand**, de forma incremental, aproveitando ecossistema declarativo, física WASM e state management reativo.
2. **Estabelecer o Blender MCP como hub único de consolidação de assets 3D**: qualquer fonte (ComfyUI/TRELLIS, Hunyuan3D, Hyper3D, Polyhaven, Poly Pizza, Sketchfab, Blender Geometry Nodes) passa obrigatoriamente pelo Blender para decimação, material PBR, escala real, pivô e compressão Draco/meshopt.
3. **Isolar a GPU durante inferência generativa** pausando containers Docker e descarregando o `llama.cpp` (`-ngl 0`), garantindo os **10 GB de VRAM livres** necessários na RX 6750 XT.

> **Escopo de bibliotecas permitidas:** React Three Fiber, Drei, @react-three/rapier, Zustand, ComfyUI, Llama.cpp, Blender MCP/bpy. Nenhuma biblioteca fora desse ecossistema deve ser introduzida sem aprovação explícita.

---

## 2. Estado Atual (Diagnóstico)

| Aspecto | Estado Atual | Risco / GAP |
|---|---|---|
| Engine 3D | Three.js r169 (vanilla) | Alto boilerplate, difícil de escalar |
| UI | Vanilla DOM + Tailwind | Funcional, mas desacoplada de R3F |
| Estado | `createProgressStore` custom | Não reativo, sem tipagem |
| Física | **Ausente** | Personagem flutua, sem colisão com cenário |
| Controles | Câmera free-fly manual | Não imersivo; não é FPS 360º |
| Assets | ~35 GLBs manuais em `public/models/` | Sem pipeline automatizado |
| LLM | `llm.js` → llama.cpp via `fetch` | Síncrono, sem fila nem cache |
| Build | Vite 5 | Pode receber plugin React incrementalmente |

---

## 3. Pipeline de Assets 3D Universal

### 3.1 Princípios de Ouro

- **Tudo passa pelo Blender MCP.** Nenhum asset entra no frontend sem processamento.
- **Separação GPU/CPU:** geração generativa na GPU (ComfyUI/Hunyuan/Hyper3D) → processamento determinístico no Blender usando CPU/RAM.
- **Escala real em metros, pivô no chão (`Y=0`), eixo Y up.**
- **Compressão obrigatória:** Draco nível 6–7 + meshopt quando disponível.
- **Orçamentos poligonais rigorosos por categoria de asset.**

### 3.2 Matriz de Decisão por Categoria

| Categoria | Fonte/Gerador Recomendado | Justificativa | Orçamento LOD0 | GLB Alvo |
|---|---|---|---|---|
| **Personagem humanoide** | Hunyuan3D-2 (text/image) → Blender | Melhor anatomia/topologia para rigging | 8k–15k tris | 2–5 MB |
| **Criatura / animal** | Hyper3D Rodin → Blender retopo | Silhuetas orgânicas superiores | 5k–12k tris | 1,5–4 MB |
| **Prop pequeno** (remédio, ferramenta) | Poly Pizza / Polyhaven → Blender | Pronto, só otimizar | 500–3k tris | 100–500 KB |
| **Prop médio** (balcão, computador) | Sketchfab (downloadable) → Blender | Variedade + licença controlada | 2k–8k tris | 500 KB–2 MB |
| **Arquitetura** (farmácia, sala) | Blender Geometry Nodes + Polyhaven texturas | Controle total, modular, LODs | 10k–50k por módulo | 2–8 MB |
| **Natureza: rochas / montanhas** | Blender Geometry Nodes + texturas | Variação infinita, LODs paramétricos | 1k–20k | 200 KB–3 MB |
| **Natureza: vegetação** | SpeedTree/GeoNodes + alpha cards | Padrão indústria para folhagem | 2k–8k | 500 KB–2 MB |
| **Veículo** | Sketchfab → Blender retopo | Modelos complexos prontos | 8k–25k | 3–8 MB |

### 3.3 Blender MCP Hub — `AssetProcessor`

O processador é invocado via `blender-mcp_execute_blender_code` ou script headless:

```python
class AssetProcessor:
    def process(self, input_path, output_dir, profile):
        # 1. Importar GLB/FBX/OBJ/Blend conforme profile.source_format
        # 2. Normalizar escala real e pivô no chão
        # 3. Decimar/respeitar poly_budget.lod0
        # 4. Gerar LODs (lod1, lod2, billboard se necessário)
        # 5. Padronizar materiais PBR metallic/roughness
        # 6. Exportar GLB com Draco
        # 7. Validar triângulos, tamanho, dimensões e reportar
```

Implementação completa e exemplos de chamada MCP estão na **Skill A**.

### 3.4 Gerenciamento de Recursos (VRAM)

```python
class ResourceOrchestrator:
    REQUIRED_FREE_VRAM_GB = 10

    def acquire_gpu(self):
        docker.pause("dolphinflix-ffmpeg")
        docker.pause("blender-cpu")
        llama.set_ngl(0)        # descarrega camadas da GPU
        wait_until_vram_free(min_gb=self.REQUIRED_FREE_VRAM_GB)

    def release_gpu(self):
        docker.unpause("dolphinflix-ffmpeg")
        docker.unpause("blender-cpu")
        llama.set_ngl(33)       # restaura camadas na GPU
```

### 3.5 Limites Hard

| Parâmetro | Limite | Como garantir |
|---|---|---|
| Textura | ≤ 1024×1024 | Redimensionamento no Blender + lock no ComfyUI |
| Triângulos avatar | ≤ 15k (ideal 8k–12k) | Modificador `DECIMATE` |
| Triângulos cenário/módulo | ≤ 50k | `DECIMATE` + Geometry Nodes |
| Compressão | Draco nível 6–7 | Flag de exportação GLB |
| Escala | Métrica real (metros) | Normalização no Blender |
| Pivô | Base em `Y=0` | Normalização no Blender |
| Rig | Humanoide padrão | Metarig / Rigify |

---

## 4. Física e Interação

### 4.1 Tecnologia Escolhida

Usar **@react-three/rapier** (WASM):

- Física determinística e performática.
- API declarativa integrada ao R3F.
- Colisores: cápsula para jogador, cápsula/trigger para NPCs, box/mesh para cenário.

### 4.2 PointerLockControls FPS 360º

- Usar `PointerLockControls` do `@react-three/drei`.
- Movimento baseado em velocidade do `RigidBody` do jogador.
- Mouse controla yaw/pitch; roll bloqueado.
- WASD + Shift (correr) + Espaço (pulo, se necessário).

### 4.3 Correção de Rigging / Eixos

Blender é Z-up; Three.js é Y-up. A correção principal é feita no Blender (`AssetProcessor._fix_axis_orientation`). Reforço na carga R3F:

```tsx
scene.traverse((obj) => {
  if (obj.isBone) {
    obj.rotation.x -= Math.PI / 2;
  }
});
```

Para ossos invertidos, usar quaternions e validar a hierarquia no Blender antes do export.

### 4.4 Auto-Focus Dinâmico da Anamnese

Quando o diálogo é ativado, a câmera faz `lerp` suave para um ponto focal no rosto do NPC (~1,5 m de altura), sem travar o movimento do jogador:

```tsx
useFrame(() => {
  if (dialogActive && npcPos) {
    target.lerp(facePosition, 0.08);
    camera.lookAt(target);
  }
});
```

---

## 5. Gestão de Estado

### 5.1 Stores Zustand

| Store | Responsabilidade |
|---|---|
| `useGameStore` | Fase do jogo, caso atual, progresso, pontuação |
| `useUIStore` | Diálogo ativo, modo de câmera, alvo de interação |
| `useAssetStore` | Registro de assets, status do pipeline, progresso de geração |
| `usePipelineStore` | WebSocket com orquestrador, eventos do pipeline |

### 5.2 Comunicação Frontend ↔ Backend ↔ Agentes

```
Frontend (Zustand)  <--WebSocket-->  Orchestrator (Python/asyncio)
                                      |--HTTP/WS--> ComfyUI
                                      |--subprocess--> Blender MCP
                                      |--Docker API--> containers
                                      |--fetch--> llama.cpp
```

Eventos canônicos do pipeline:

| Evento | Significado |
|---|---|
| `vram.acquired` | GPU isolada, pronta para inferência |
| `comfy.queued` | Tarefa enviada ao ComfyUI |
| `comfy.progress` | Percentual de progresso |
| `blender.start` | GPU liberada, Blender processando |
| `asset.ready` | GLB validado e copiado para `public/models/` |
| `containers.restored` | Todos os serviços retomados |

### 5.3 Anti-Gargalo

- WebSocket throttled a cada 100 ms para eventos de progresso.
- Fallback para polling REST `/api/pipeline/status/{asset_id}`.
- Fila de geração **serial** (não paralela) para evitar contenção de GPU.
- Blender processa em CPU/RAM enquanto a GPU fica livre para o próximo job.

---

## 6. Plano de Migração Incremental

| Semana | Foco | Entregável |
|---|---|---|
| 1 | Setup R3F + Rapier + Zustand no Vite | `R3FRenderer.tsx`, stores, plugin React |
| 2 | Migração de câmera, input e carregamento de assets | `FPSController`, `useGLTF` |
| 3 | Migração de entidades: jogador, NPCs, farmácia | Componentes React |
| 4 | Física, colisões e interação | Rapier colliders, diálogo |
| 5 | Pipeline 3D end-to-end (1 asset real) | `AssetProcessor`, `ResourceOrchestrator` |
| 6 | Integração LLM, diálogo dinâmico e polimento | Testes, ajustes |

---

## 7. Checklist de Qualidade

- [ ] Texturas ≤ 1024×1024.
- [ ] Avatares ≤ 15k tris.
- [ ] Pivô em `Y=0` e escala real em metros.
- [ ] Draco ativado em todos os GLBs.
- [ ] Rig humanoide validado no Blender.
- [ ] FPS ≥ 60 em desktop.
- [ ] Diálogo com auto-focus funcional.
- [ ] Física sem clipping (jogador não atravessa paredes).
- [ ] Pipeline gera 1 asset do zero em < 15 min.

---

*Documento gerado a partir da análise arquitetural dos subagentes e do contexto do projeto. Atualizar conforme implementação.*
