---
name: SKILL_E_FONTES_ASSET_SCAN_IA
description: Fontes alternativas de asset 3D além dos geradores: photogrammetry/scan (Polycam/LiDAR), impressão 3D (mesh física) e IA-vídeo como referência de animação — tudo convergindo no Blender MCP para virar .glb web-ready.
variants:
  - photogrammetry_polycam
  - scan_lidar
  - impressao3d_mesh_para_web
  - ia_video_referencia_animacao
setup:
  - Polycam (app/web) ou captura LiDAR disponível
  - Blender MCP conectado (bpy) para limpeza/decimação
  - Ferramentas de IA vídeo (Picas.ai, VEO3, etc.) opcionais para referência
ports:
  blender_mcp: 9876
---

# Skill E — Fontes Alternativas de Asset 3D (Scan, Photogrammetry, IA)

## Papel

Você é o **Capturador de Assets Reais**. Quando o gerador (Hunyuan/Tripo/Rodin)
não é ideal — por exemplo, para reproduzir um objeto real, um rosto, uma bolsa ou
um móvel existente — você usa **photogrammetry/scan** para obter a mesh da
realidade, limpa-a no Blender MCP e entrega um `.glb` no padrão do projeto.

## Quando Usar

- Reproduzir um objeto/produto REAL (embalagem de remédio, mobiliário, ferramenta).
- Digitalizar uma pessoa/personagem a partir de fotos (referência fiel).
- Converter uma mesh feita para impressão 3D (STL) em asset de jogo.
- Usar vídeo/IA como referência de proporção e animação antes de modelar.

## Fontes e fluxo

### 1. Photogrammetry (Polycam) — nptDsPajfGU
```
1. Capturar objeto em passadas curtas (≤5min) no app Polycam (ou LiDAR).
2. Processar nuvem de pontos → mesh 3D (Polycam gera GLB/OBJ).
3. Importar no Blender MCP e LIMPAR (receita da Skill D §4):
   merge by distance → weighted normal → apply transforms → decimate.
4. Retopolizar/reduzir p/ budget (personagem ≤15k, prop ≤8k tris).
5. Exportar .glb Draco → public/models/.
```

### 2. Scaneamento LiDAR (iOS/Android)
Mesma receita; a mesh costuma vir alta-poly e suja. Passos críticos:
- `DECIMATE` (ratio 0.1–0.3) + `REMESH` (voxel) para fechar buracos.
- `weighted normal` para corrigir flat shading.

```python
import bpy
obj = bpy.context.active_object
# decimar
dec = obj.modifiers.new("Decimate", 'DECIMATE')
dec.ratio = 0.2
bpy.ops.object.modifier_apply(modifier="Decimate")
# remesh voxel (tapinza malha de scan)
rem = obj.modifiers.new("Remesh", 'REMESH')
rem.mode = 'VOXEL'; rem.voxel_size = 0.01
bpy.ops.object.modifier_apply(modifier="Remesh")
# weighted normal
wn = obj.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL')
bpy.ops.object.modifier_apply(modifier="WeightedNormal")
```

### 3. Impressão 3D → web (1a9rwE39GUs)
Mesh física (STL) vira asset de jogo apagando detalhes desnecessários:
```
modelagem/pré-impressão (boolean, decimate) → STL
  → importar no Blender MCP → remover internos/hidden → decimate p/ game
  → UV + textura (se não tiver) → exportar .glb
```

### 4. IA-vídeo como referência (Uz4WOAe3A4o, A3Tsj6-0zdU)
ChatGPT (prompt) + Picas.ai/VEO3 geram vídeo de referência de pose/expressão →
usar como *background reference* no Blender para animar (Skill D §7) ou como
brief de proporção antes de gerar o modelo.

## Regras de Negócio

1. **Todo scan passa pelo Blender MCP** antes de entrar no jogo (limpeza + budget).
2. **Scan é fonte de FORMA, não de textura final** — re-UV e textura PBR ≤1024px.
3. **Não usar mesh de impressão direto**: STL é sólido (fechado) e alta-poly; sempre decimar.
4. **Sempre respeitar escala métrica e pivô Y=0** — scans vêm com escala arbitrária.

## Restrições Técnicas

- Textura ≤1024×1024; Draco 6–7; personagem ≤15k tris; prop ≤8k.
- Remesh voxel só em malhas de scan (não em modelos limpos).

## Checkout

- [ ] Scan importado e limpo (merge by distance + weighted normal).
- [ ] Decimado/retopologizado dentro do budget.
- [ ] Escala métrica + pivô base Y=0.
- [ ] Re-UV + textura PBR (se necessário).
- [ ] `.glb` Draco válido.

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_E_FONTES_ASSET_SCAN_IA.md`
- **Data:** 2026-09-11
- **Status:** Ativa
- **Fontes:** nptDsPajfGU (Polycam), 1a9rwE39GUs (impressão 3D), Uz4WOAe3A4o/A3Tsj6-0zdU (IA vídeo)
- **Dependências:** Polycam/LiDAR, Blender MCP, ferramentas IA-vídeo opcionais