---
name: SKILL_C_FUNDACAO_NOVOS_JOGOS
description: Prompt mestre de inicialização para criar um novo simulador web 3D em Three.js vanilla + Vite + Tailwind, replicando a arquitetura do game_farma (cena procedural, POV por zonas, UI DOM, LLM local).
variants:
  - novo_simulador_tema
  - novo_jogo_educacional
  - novo_jogo_exploracao
setup:
  - Node.js + Vite
  - Three.js vanilla + Tailwind (SEM React/R3F/Rapier/Zustand)
  - ComfyUI + Blender MCP + llama.cpp disponíveis (opcional para assets/conteúdo)
  - Python (orquestrador de assets) opcional
---

# Skill C — Fundação para Novos Jogos (Prompt Mestre de Inicialização)

## Papel

Você é o **Arquiteto de Base de Novos Jogos**. Recebe um tema (ex.: simulador de emergência
médica, oficina mecânica, escola de aviação) e constrói a estrutura inicial em **Three.js
vanilla + Vite + Tailwind**, replicando a arquitetura do `game_farma` — cena procedural,
câmera POV por zonas, UI em DOM, conteúdo em dados e (opcional) LLM local.

## Quando Usar

- Criar um novo simulador web 3D a partir de zero.
- Replicar a arquitetura do `game_farma` em outro domínio/tema.
- Padronizar a comunicação frontend ↔ servidor ↔ llama.cpp ↔ pipeline de assets.

## Pré-condições

1. Tema do jogo definido pelo usuário.
2. Node.js + Vite instalados.
3. (Opcional) ComfyUI, Blender MCP e llama.cpp acessíveis.

## Fluxo Padronizado de Inicialização

```
1. Criar projeto Vite vanilla (npm create vite@latest -- --template vanilla)
2. Instalar: three + tailwindcss + postcss + autoprefixer
3. Criar estrutura de pastas padronizada (abaixo)
4. Criar bootstrap (src/main.js): canvas + ticker central + wiring de módulos
5. Criar máquina de estados (src/core/game.js): CAPA → BRIEFING → ANAMNESE → DECISAO → DEBRIEF
6. Criar cena procedural placeholder (src/scene/scene.js) com materiais estilizados
7. Criar POV por zonas (src/scene/pov.js) — ver Skill B
8. Criar UI em DOM/Tailwind (src/ui/) e conteúdo em src/data/
9. (Opcional) Servidor Node + LLM local; AssetProfile de exemplo para o tema
```

## Estrutura de Pastas Padrão

```
novo-jogo/
├── index.html                 # canvas + HUD em DOM (Tailwind)
├── public/
│   ├── models/                # GLBs otimizados (meshopt) — ESTILIZADOS
│   ├── audio/                 # SFX/voz
│   ├── capa/                  # arte da tela inicial
│   └── env/                   # HDRIs/ambiente (se houver)
├── src/
│   ├── main.js                # bootstrap: renderer, cena, ticker, wiring
│   ├── core/
│   │   └── game.js            # máquina de estados + regras de negócio
│   ├── scene/
│   │   ├── scene.js           # cena/luzes/loop
│   │   ├── pov.js             # câmera por zonas (Skill B)
│   │   ├── glbLoader.js       # GLTFLoader compartilhado (meshopt)
│   │   └── <conteudo>.js      # props/personagens
│   ├── ui/
│   │   ├── capa.js            # tela inicial + botões DOM
│   │   ├── i18n.js            # PT/EN
│   │   └── interacao.js       # proximidade + tecla E (Skill B)
│   ├── data/                  # conteúdo (casos, diálogos, parâmetros)
│   ├── audio/                 # sfx.js, tts.js, stt.js
│   └── ai/                    # prompts.js, llm client
├── server/
│   └── index.mjs              # servidor/proxy p/ LLM (opcional)
├── tools/                     # pipeline de assets (Python, opcional)
├── SKILL_BANK/                # skills A/B/C/D/F/G + schema
└── MASTER_PLAN.md
```

## Regras de Negócio

1. **Stack fixa:** Three.js vanilla + Vite + Tailwind + DOM. **Sem React, sem R3F, sem
   Rapier, sem Zustand.**
2. **Sem engine de física:** colisão = limites de zona + raios de interação (Skill B).
3. **Câmera é POV por zonas** (não FPS livre com PointerLock); look-around com limites e mola.
4. **Estado do jogo = máquina de estados explícita** (`game.state`), não store reativo.
5. **Conteúdo separado de código:** casos/diálogos em `src/data/`, nunca hardcoded na cena.
6. **Todo asset é estilizado** e segue os seis âncoras: `stylized 3D render, Pixar style,
   casual mobile game art, smooth PBR, clean textures, soft global illumination`.
   Ver `docs/DIRETRIZES_ARTE_ESTILIZADA.md`.
7. **Todo asset segue o `AssetProfile` schema** (`SKILL_BANK/asset-profile.schema.json`).
8. **Diálogo usa LLM local via llama.cpp** (quando houver) com fallback offline.

## Restrições Técnicas

- Bibliotecas permitidas: `three`, Vite, Tailwind, PostCSS. Python (orquestrador) opcional.
- Assets 3D: GLB com **meshopt** (meshopt aceito; Draco evitado), texturas ≤ 1024²,
  personagens ≤ 15k tris, props ≤ 8k.
- Escala real em metros, Y-up, pivô no chão (Y=0).
- Hardware: respeitar RX 6750 XT 12 GB — isolar GPU antes de inferência generativa.
- Nunca referenciar `future_projects/realism_core/` (realismo arquivado).

## Exemplo — Prompt para IA Menor

```markdown
# Novo Jogo: Simulador de Oficina Mecânica (Three.js vanilla)

Crie a base de um simulador web 3D em Three.js vanilla + Vite + Tailwind seguindo a
arquitetura do game_farma (Skill C). SEM React/R3F/Rapier/Zustand.

## Tema
O jogador é um mecânico. Diagnostica problemas de carros conversando com clientes (LLM local)
e interagindo com ferramentas.

## Requisitos
1. Setup Vite vanilla + three + tailwind.
2. Estrutura de pastas da Skill C (src/core, src/scene, src/ui, src/data, src/audio, src/ai).
3. Máquina de estados: CAPA → BRIEFING → ATENDIMENTO → DECISAO → DEBRIEF.
4. Cena procedural placeholder estilizada (galpão + carro caixa) com paleta casual.
5. POV por zonas: cliente, bancada, elevador — tween + look-around com limites (Skill B).
6. Interação por proximidade + tecla E com banner DOM.
7. UI em DOM/Tailwind (capa com botões reais, HUD, diálogo com input).
8. Conteúdo de exemplo em src/data/ (1 caso completo).
9. AssetProfile de exemplo "mecanico_cliente_v001" (category: character,
   generator: hunyuan3d_text) com prompt ESTILIZADO (ver âncoras).

## Restrições
- Sem bibliotecas fora da stack (three + Vite + Tailwind).
- Não alucine assets; use primitivas three (BoxGeometry, CapsuleGeometry) até haver GLB.
- JS válido (ESM), sem erros de sintaxe — valide com `npm run build`.
```

## Exemplo 2 — AssetProfile Inicial para Novo Tema

```json
{
  "asset_id": "mecanico_cliente_v001",
  "category": "character",
  "subcategory": "human_adult",
  "generator": "hunyuan3d_text",
  "generator_params": {
    "text_prompt": "stylized 3D render, Pixar style, casual mobile game art, friendly car owner, worried but hopeful expression, casual clothes, soft pastel palette, smooth PBR, clean textures, soft global illumination, full body, game asset"
  },
  "poly_budget": { "lod0": 12000, "lod1": 4000, "lod2": 1200 },
  "real_world_scale_m": 1.75,
  "pivot": "ground_center",
  "axis_up": "Y",
  "rigging": {
    "required": true,
    "skeleton_type": "humanoid",
    "animation_clips": ["idle", "talk", "worried"]
  },
  "materials": [
    { "slot_name": "body", "pbr_workflow": "metallic_roughness", "texture_resolution": 1024 }
  ],
  "collision": { "type": "capsule" },
  "tags": ["npc", "customer", "quest_giver"],
  "license": "Custom"
}
```

## Checklist de Validação da Base

- [ ] `npm run dev` inicia sem erros; `npm run build` passa.
- [ ] Canvas renderiza cenário placeholder com materiais estilizados.
- [ ] POV viaja entre zonas (tween) e look-around volta ao enquadramento.
- [ ] Banner "Pressione E" + ação correta por alvo mais próximo.
- [ ] Máquina de estados transita sem travar.
- [ ] Conteúdo em `src/data/` (nada hardcoded na cena).
- [ ] AssetProfile schema presente e prompt usa as âncoras estilizadas.
- [ ] MASTER_PLAN.md documenta tema e arquitetura.

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_C_FUNDACAO_NOVOS_JOGOS.md`
- **Data de revisão:** 2026-09-14 (antes: React/R3F — corrigido para vanilla)
- **Status:** Ativa
- **Dependências:** Node.js, Vite, Three.js, Tailwind, (opcional) Python/ComfyUI/Blender MCP/llama.cpp
