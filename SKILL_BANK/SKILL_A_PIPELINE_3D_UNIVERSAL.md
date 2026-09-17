---
name: SKILL_A_PIPELINE_3D_UNIVERSAL
description: Orquestra a geração e o pós-processamento de qualquer asset 3D (personagem, prop, arquitetura, natureza) usando ComfyUI/Hunyuan3D/Hyper3D/Polyhaven/Poly Pizza/Sketchfab e consolidando tudo no Blender MCP.
variants:
  - character_from_text
  - character_from_image
  - prop_from_store
  - architecture_procedural
  - nature_geonodes
setup:
  - ComfyUI rodando com --lowvram --fp16 (porta 8188)
  - Blender MCP conectado e com bpy disponível
  - llama.cpp pausável via -ngl 0
  - Docker com permissão para pause/unpause nos containers dolphinflix-ffmpeg e blender-cpu
ports:
  comfyui: 8188
  hunyuan3d: 8090
  hyper3d: cloud/api externa
---

# Skill A — Pipeline 3D Universal (Geração + Consolidação)

## Papel

Você é o **Orquestrador de Assets 3D**. Sua função é receber um `AssetProfile`, escolher a ferramenta generativa ou fonte de asset correta, gerenciar a VRAM do servidor, processar o resultado no Blender MCP e entregar um `.glb` pronto para web.

## Direção de Arte (OBRIGATÓRIA — ler antes de gerar)

Este projeto é **3D estilizado casual mobile** (leitura Pixar), não fotorrealista.
Todo prompt/fonte deve nascer com os seis âncoras:

```
stylized 3D render, Pixar style, casual mobile game art,
smooth PBR, clean textures, soft global illumination
```

**Nunca pedir:** `photorealistic, hyperrealistic, GTA V, 8k detail, skin pores,
photogrammetry, scan, grunge, dirt, realistic human face`.
Detalhes completos: `docs/DIRETRIZES_ARTE_ESTILIZADA.md`. Realismo está arquivado
em `future_projects/realism_core/` — não referenciar.

## Quando Usar

- Gerar um novo personagem, NPC, objeto, móvel, prédio, rocha, árvore ou veículo.
- Otimizar um asset externo (Sketchfab, Poly Pizza, Polyhaven) para o jogo.
- Converter um asset de formato bruto (FBX/OBJ/GLB) no padrão do projeto.

## Pré-condições

1. O `AssetProfile` está completo e válido (veja `asset-profile.schema.json`).
2. O Blender MCP está conectado.
3. Nenhum outro serviço de GPU está rodando (orquestrador fará o isolamento).

## Fluxo Padronizado

```
1. RECEBER AssetProfile
2. ISOLAR GPU (pausar containers, descarregar llama.cpp)
3. GERAR / BAIXAR asset conforme profile.generator
   ├── hunyuan3d_text  → blender-mcp_generate_hunyuan3d_model
   ├── hyper3d_text    → blender-mcp_generate_hyper3d_model_via_text
   ├── trellis_comfyui → POST /prompt no ComfyUI
   ├── polyhaven_model → blender-mcp_download_polyhaven_asset
   ├── polypizza       → blender-mcp_download_polypizza_model
   └── sketchfab       → blender-mcp_download_sketchfab_model
4. AGUARDAR conclusão (poll status quando aplicável)
5. LIBERAR GPU (retomar containers, recarregar llama.cpp)
6. PROCESSAR no Blender MCP (AssetProcessor)
7. VALIDAR limites (tris, textura, tamanho, escala)
8. MOVER para public/models/<categoria>/<asset_id>.glb
9. REGISTRAR no asset registry do frontend
```

## Matriz de Decisão Rápida

| Categoria do Asset | Gerador/Fonte | Ferramenta MCP |
|---|---|---|
| Personagem humanoide | Hunyuan3D-2 text/image | `blender-mcp_generate_hunyuan3d_model` |
| Criatura/animal | Hyper3D Rodin text/image | `blender-mcp_generate_hyper3d_model_via_*` |
| Prop pequeno | Poly Pizza / Polyhaven | `blender-mcp_download_polypizza_model` / `download_polyhaven_asset` |
| Prop médio / veículo | Sketchfab downloadable | `blender-mcp_download_sketchfab_model` |
| Arquitetura / natureza | Blender Geometry Nodes | `blender-mcp_execute_blender_code` com script GeoNodes |

## Regras de Negócio

1. **Tudo passa pelo Blender.** Nenhum asset vai direto para `public/models/` sem processamento.
2. **Isolamento de GPU é obrigatório** antes de qualquer inferência generativa.
3. **Fila serial:** um asset por vez na GPU. Nunca dispare dois jobs generativos simultâneos.
4. **AssetProfile é a única fonte de verdade.** Não altere budgets, escala ou motor sem atualizar o profile.
5. **Blender processa apenas em CPU/RAM**, nunca na GPU.

## Restrições Técnicas

- **VRAM alvo livre:** ≥ 10 GB antes de iniciar inferência.
- **Texturas:** ≤ 1024×1024.
- **Triângulos avatar:** ≤ 15k (ideal 8k–12k).
- **Triângulos cenário/módulo:** ≤ 50k.
- **Formato de entrega:** `.glb` com compressão **meshopt** (o loader do jogo suporta; Draco é evitado por incompatibilidade com validadores/FBX pipelines).
- **Escala:** métrica real em metros.
- **Pivô:** base do asset em `Y=0`.
- **Eixo up:** Y-up.

## Exemplo 1 — Gerar personagem via Hunyuan3D

```json
{
  "asset_id": "character_farmer_v001",
  "category": "character",
  "generator": "hunyuan3d_text",
  "generator_params": {
    "text_prompt": "stylized 3D render, Pixar style, casual mobile game art, friendly farmer character, worn straw hat, plaid shirt, overalls, rubber boots, soft pastel palette, smooth PBR, clean textures, soft global illumination, full body, game asset"
  },
  "poly_budget": { "lod0": 12000, "lod1": 4000, "lod2": 1200 },
  "real_world_scale_m": 1.75,
  "rigging": { "required": true, "skeleton_type": "humanoid" }
}
```

Chamadas MCP:

```python
# 1. Isolar GPU
orchestrator.acquire_gpu()

# 2. Gerar
blender-mcp_generate_hunyuan3d_model(
  text_prompt=profile["generator_params"]["text_prompt"],
  user_prompt="Generate farmer character for game_farma"
)

# 3. Poll até DONE
blender-mcp_poll_hunyuan_job_status(job_id=...)

# 4. Liberar GPU
orchestrator.release_gpu()

# 5. Processar no Blender
blender-mcp_execute_blender_code(
  code="""
import sys; sys.path.append('/home/servidor/Git/game_farma/tools')
from asset_processor import AssetProcessor
p = {...}  # profile
r = AssetProcessor(p).process('/tmp/raw.glb', '/home/servidor/Git/game_farma/public/models/characters')
print(r)
""",
  user_prompt="Process generated character through Blender MCP hub"
)
```

## Exemplo 2 — Otimizar prop do Poly Pizza

```python
blender-mcp_download_polypizza_model(
  model_id="chair",
  normalize_size=True,
  target_size=1.0,
  user_prompt="Download chair prop for pharmacy scene"
)
# Em seguida, executar AssetProcessor com category="prop_medium"
```

## Checklist de Validação

- [ ] Arquivo `.glb` existe em `public/models/<categoria>/<asset_id>_lod0.glb`.
- [ ] Tamanho ≤ budget definido no profile.
- [ ] Triângulos ≤ `poly_budget.lod0`.
- [ ] Maior dimensão próxima a `real_world_scale_m`.
- [ ] Pivô na base (`Y=0`).
- [ ] Texturas ≤ 1024×1024.
- [ ] Meshopt aplicado (ou GLB sem compressão, se o validador rejeitar).
- [ ] Estilo confere com as âncoras estilizadas (sem traço fotorrealista).
- [ ] Relatório JSON gerado com tempo, tamanho, tris e status dos containers.

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_A_PIPELINE_3D_UNIVERSAL.md`
- **Data de criação:** 2026-09-10
- **Status:** Ativa
- **Dependências:** Blender MCP, ComfyUI, Hunyuan3D, Hyper3D, Polyhaven/Poly Pizza/Sketchfab MCP tools
