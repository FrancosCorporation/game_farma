# SKILL_BANK — Banco de Skills do game_farma

Este diretório contém prompts/playbooks padronizados para que IAs menores (modelos locais de ~9B) consigam expandir o simulador clínico ou criar novos jogos seguindo a mesma arquitetura.

> **Duas regras transversais (14/09/2026):**
> 1. **Stack real = Three.js vanilla + Vite + Tailwind + DOM.** Não há (e não haverá)
>    migração para React/R3F/Rapier/Zustand — skills B/C/F foram corrigidas.
> 2. **Direção de arte = 3D estilizado casual mobile** (âncoras: `stylized 3D render,
>    Pixar style, casual mobile game art, smooth PBR, clean textures, soft global
>    illumination`). Ver `docs/DIRETRIZES_ARTE_ESTILIZADA.md`. Realismo arquivado em
>    `future_projects/realism_core/`.

## Skills Disponíveis

| Skill | Arquivo | Quando Usar |
|---|---|---|
| **A — Pipeline 3D Universal** | `SKILL_A_PIPELINE_3D_UNIVERSAL.md` | Gerar ou importar qualquer asset 3D (personagem, prop, arquitetura, natureza) e consolidá-lo no Blender MCP. |
| **B — Câmera & Interação (vanilla)** | `SKILL_B_CAMERA_INTERACAO.md` | Câmera POV por zonas (tween + look-around com limites/mola), interação por proximidade (tecla E), correção de rigging e auto-focus de diálogo — em Three.js vanilla, sem React/física. |
| **C — Fundação para Novos Jogos** | `SKILL_C_FUNDACAO_NOVOS_JOGOS.md` | Inicializar um novo simulador/jogo web replicando a arquitetura do game_farma. |
| **D — Personagem & Objetos via Blender MCP** | `SKILL_D_PERSONAGEM_BLENDER_MCP.md` | Modelar/texturizar/riggear/animar personagens, props, rochas, casas via Blender MCP, replicando o fluxo dos tutoriais "first 3D person style". |
| **E — Fontes de Asset por Scan/IA** | ~~arquivada~~ | Arquivada em 14/09/2026 (era photogrammetry/LiDAR — direção realista). Ver `future_projects/realism_core/skills/`. |
| **F — Gameplay: Câmera, Raycast, Interação** | `SKILL_F_GAMEPLAY_CAMERA_RAYCAST.md` | Câmera 1ª/3ª pessoa com suavização, raycasting de seleção/tiro e alternância de perspectiva no frontend web. |
| **G — Princípios de Modelagem 3D** | `SKILL_G_PRINCIPIOS_MODELAGEM_3D.md` | **Ler antes de modelar qualquer objeto.** Esqueleto/eixos antes da forma, base universal + variações por parâmetro, pesquisa de domínio. Diretriz do PO aplicável às skills A e D. |

## Schema de Referência

- `asset-profile.schema.json` — JSON Schema para descrição padronizada de qualquer asset 3D.

## Documento Estratégico

- `../MASTER_PLAN.md` — Plano diretor com arquitetura, pipeline, física, gestão de estado e migração incremental.

## Formato das Skills

Cada skill segue o padrão do banco de skills corporativo (`/Git/site_corp`):

1. YAML front-matter com `name`, `description`, `variants`, `setup`, `ports`.
2. Seções fixas: Papel, Quando Usar, Pré-condições, Fluxo Padronizado, Regras de Negócio, Restrições Técnicas, Exemplos, Checklist, Metadados.
3. Blocos de código JSON/TSX/Python reais e copiáveis.

## Como Usar

Para delegar uma tarefa a uma IA menor, envie o arquivo `.md` completo + o contexto específico do asset/cena. Não envie apenas o nome da skill sem o conteúdo.
