---
name: SKILL_D_PERSONAGEM_BLENDER_MCP
description: Ensina a IA a modelar, texturizar, riggear e animar personagens e objetos 3D (personagens, carros, mesas, cadeiras, pedras, casas) diretamente no Blender MCP, replicando o fluxo dos tutoriais de "first 3D person style" e atingindo resultado estilizado/web-ready.
variants:
  - personagem_organico_classico
  - personagem_via_ia_image_to_mesh
  - objeto_prop (mesa/cadeira/carro/pedra)
  - arquitetura_abandonada
  - depth_map_image_to_3d
  - rigrigify_accuring
  - pose_animacao_1min
setup:
  - Blender MCP conectado (porta 9876) e bpy disponível
  - Rigify addon habilitado (Edit > Preferences > Add-ons)
  - AccuRig instalado (opcional, para rig automático)
  - Polyhaven/Poly Pizza/Sketchfab MCP tools habilitadas (assets/HDRI)
ports:
  blender_mcp: 9876
  comfyui: 8188
---

# Skill D — Modelagem de Personagem & Objetos via Blender MCP (do tutorial ao web-ready)

> **Estilo obrigatório:** 3D estilizado casual mobile (Pixar-like) — nunca fotorrealista.
> Âncoras: `stylized 3D render, Pixar style, casual mobile game art, smooth PBR,
> clean textures, soft global illumination`. Detalhes em
> `docs/DIRETRIZES_ARTE_ESTILIZADA.md`. Ao adaptar qualquer receita "realista" dos
> tutoriais, simplifique forma/textura para leitura estilizada (formas grandes,
> paleta curta, roughness médio-alto).

## Papel

Você é o **Modelador 3D via Blender MCP**. Recebe um `AssetProfile`, decide entre
**modelagem orgânica clássica** (Mirror + Subdivision) ou **geração por IA
(image-to-mesh)**, executa todo o trabalho no Blender via
`blender-mcp_execute_blender_code` e entrega um `.glb` pronto para o jogo web.

Esta skill foi extraída da transcrição de tutoriais de "make first 3D person
style" (H4A0WDC9T7k, gZIxrX1n2D4, TumrA0XsX0A, Jdz1I223oFw, TjJLIuFKA20,
PhB2RKugZXg) — cada receita abaixo tem o passo do vídeo + o código bpy equivalente.

## Quando Usar

- Modelar um personagem humanóide do zero (ou a partir de uma imagem).
- Criar objetos do cenário: móveis, veículos, rochas, casas, props de farmácia.
- Converter um asset de IA (Tripo/Rodin/Hunyuan) para o padrão do projeto.
- Riggear e posar um personagem para uso em jogo.

## Pré-condições

1. `AssetProfile` válido (ver `asset-profile.schema.json`).
2. Blender MCP conectado; Rigify habilitado.
3. Orçamentos de polígonos conhecidos (ver `MASTER_PLAN.md` §3.5).

---

## 1. Modelagem Orgânica Clássica (H4A0WDC9T7k)

> O vídeo ensina: para formas orgânicas, use **Mirror (clipping)** + **Subdivision**.
> Modelar = extrudar + loop cuts + escalar/mover/rotacionar faces.

```python
import bpy

# 1. Começar a partir de um cubo (Shift+A > Mesh > Cube) ou primitiva
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
obj = bpy.context.active_object

# 2. Mirror Modifier com clipping (metade do modelo vira o todo)
mirror = obj.modifiers.new("Mirror", 'MIRROR')
mirror.use_clip = True

# 3. Subdivision Surface com viewport level 2 (para suavizar)
subd = obj.modifiers.new("Subdivision", 'SUBSURF')
subd.levels = 2
subd.render_levels = 2
```

**Operações de modelagem (atalhos → bpy):**

| Ação (atalho) | bpy |
|---|---|
| Loop cut (Ctrl+R) | `bpy.ops.mesh.loopcut_slide(MESH_OT_loopcut={"number_cuts":1})` |
| Extrude (E) | `bpy.ops.mesh.extrude_region_move(TRANSFORM_OT_translate={"value": (0,0,0.2)})` |
| Scale (S) / Move (G) / Rotate (R) | `bpy.ops.transform.resize/value`, `.translate`, `.rotate` |
| Inset (I) | `bpy.ops.mesh.inset_region()` |

**Aplicar subdivision em nível 1 (manter low-poly para jogo):**

```python
obj.modifiers["Subdivision"].levels = 1
obj.modifiers["Subdivision"].render_levels = 1
bpy.ops.object.modifier_apply(modifier="Subdivision")
```

---

## 2. UV Unwrap em Espelho + Textura (H4A0WDC9T7k)

> O vídeo: UV em modo espelho (o que pintar de um lado aparece nos dois) para
> ganhar espaço de UV. Opções: (a) uma textura só, (b) materiais separados.

```python
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
# Project from view (espelho) — ou smart_project para automação
bpy.ops.uv.project_from_view(camera_bounds=False, correct_aspect=True)
bpy.ops.object.mode_set(mode='OBJECT')
```

**Criar material + textura de cor base (Texture Paint):**

```python
mat = bpy.data.materials.new("skin")
mat.use_nodes = True
obj.data.materials.append(mat)

# Criar imagem/textura de base color
img = bpy.data.images.new("skin_base", width=1024, height=1024)
bsdf = mat.node_tree.nodes["Principled BSDF"]
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
```

**Dicas de pintura do vídeo (mapeadas para o Paint):**

| Dica do vídeo | Como reproduzir |
|---|---|
| Começar pelos detalhes → imperfeições → sombras/highlights | Ordem de camadas de pintura |
| Sombras com blend **Darken** | `brush.blend = 'DARKEN'` |
| Highlights com blend **Lighten** | `brush.blend = 'LIGHTEN'` |
| Detalhes finos com a ferramenta linha | `bpy.ops.paint.line` (cursor line) |

---

## 3. Rigify — Metarig + Symmetrize (H4A0WDC9T7k)

> O vídeo: habilitar Rigify, Shift+A → Human Metarig, apagar ossos desnecessários,
> rotacionar/mover para casar com o mesh, e usar Armature > Symmetrize.

```python
# 1. Adicionar metarig humanoide (requer rigify ativo)
bpy.ops.object.armature_human_metarig_add()

# 2. Posicionar ossos sobre o mesh (apagar o que sobra)
#    bpy.ops.armature.delete()  /  edit_bones[...].translate/rotate

# 3. Simetrizar um lado da armature
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.armature.select_all(action='SELECT')
bpy.ops.armature.symmetrize()

# 4. Parent mesh na armature com pesos automáticos
bpy.ops.object.mode_set(mode='OBJECT')
mesh = bpy.data.objects["character"]
rig  = bpy.data.objects["metarig"]
mesh.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
```

---

## 4. Geração por IA e Limpeza no Blender (gZIxrX1n2D4)

> Fluxo Stefan 3D AI: 1 imagem de conceito → Asset Hub/Tripo quebra em partes →
> image-to-mesh com controle de poli → montagem/limpeza no Blender → AccuRig.

**Receita de limpeza pós-import (vale para QUALQUER asset de IA):**

```python
import bpy
obj = bpy.context.active_object

# a) Merge by distance (GLB de IA sempre traz vértices duplicados)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.object.mode_set(mode='OBJECT')

# b) Consertar flat shading com Weighted Normal
wn = obj.modifiers.new("WeightedNormal", 'WEIGHTED_NORMAL')
bpy.ops.object.modifier_apply(modifier="WeightedNormal")

# c) Aplicar transforms (posição atual vira a original)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# d) Mirar no eixo Y (para objetos simétricos)
mirror = obj.modifiers.new("Mirror", 'MIRROR')
mirror.use_axis = (False, True, False)   # espelha em Y

# e) Juntar objetos (Ctrl+J)
bpy.ops.object.join()

# f) Origem no cursor 3D (world origin) p/ export consistente
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

# g) Otimização: apagar polígonos que ficarão cobertos (ex: perna sob a calça)
bpy.ops.object.mode_set(mode='EDIT')
# ... selecionar faces cobertas e bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')
```

**Sculpt leve para alinhar peças:**

```python
bpy.ops.object.mode_set(mode='SCULPT')
# Elastic Grab: esticar/ajustar peças (Ctrl inverte nos brushes de argila)
bpy.context.tool_settings.sculpt.brush = bpy.data.brushes['Elastic Grab']
# Clay: adicionar/remover volume (segurar Ctrl = inverso)
# bpy.context.tool_settings.sculpt.brush = bpy.data.brushes['Clay']
```

---

## 5. Gerar Moedas/Objetos a partir de Imagem — Depth Map (Jdz1I223oFw)

> O vídeo: Pinterest → site de depth map (white=perto/black=longe) → plane +
> subdivide + Displace Modifier + Subdivision → 3D "dope" de uma imagem.

```python
import bpy

# 1. Plane subdividido
bpy.ops.mesh.primitive_plane_add(size=2, location=(0,0,0))
obj = bpy.context.active_object
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.subdivide(number_cuts=50)
bpy.ops.object.mode_set(mode='OBJECT')

# 2. Displace Modifier com a depth map
disp = obj.modifiers.new("Displace", 'DISPLACE')
tex = bpy.data.textures.new("depth", 'IMAGE')
tex.image = bpy.data.images.load("/tmp/depth_map.png")
tex.image.colorspace_settings.name = 'Non-Color'
disp.texture = tex
disp.texture_coords = 'UV'
disp.strength = 0.1  # ajustar até ficar bom

# 3. Subdivision para suavizar a forma
subd = obj.modifiers.new("Subdivision", 'SUBSURF')
subd.levels = 3
```

---

## 6. Rig de objetos rígidos (espada/chapéu) no osso (gZIxrX1n2D4)

> Objetos rígidos (que não deformam) seguem **um único osso** (pelvis, neck).
> Não precisam de rig completo.

```python
# 1. Parent de todos os objetos na armature com empty groups
bpy.ops.object.parent_set(type='ARMATURE_NAME' if False else 'ARMATURE')  # na prática:
# selecione objetos + armature e: Ctrl+P > With Empty Groups
bpy.ops.object.parent_set(type='ARMATURE', xmirror=False)
# (peso vazio = nenhum osso atribuído ainda)

# 2. Weight Paint: 100% do peso no osso desejado (ex.: pelvis)
obj.vertex_groups.new(name="pelvis")  # deve casar com o vertex group do osso
# pinte de vermelho (peso 1.0) no grupo "pelvis" — seguirá a pélvis 100%
```

---

## 7. Pose / Animação em 1 minuto (TjJLIuFKA20)

> O vídeo: usar video de referência de fundo, auto-keyframe, posar pelos
> controllers de pés/mãos/pelvis, e copiar+colar pose espelhada para loop.

```python
import bpy
rig = bpy.context.active_object

# Auto keyframe ON (botão vermelho)
bpy.context.scene.tool_settings.use_keyframe_insert_auto = True

# 1. Pousar a pélvis e controladores de pés/mãos
bone = rig.pose.bones["foot_ik.L"]
bone.location = (0.1, 0, 0)   # pegar/rotacionar controllers
bone.keyframe_insert(data_path="location", frame=1)

# 2. Avançar ~8 frames e re-posar
# 3. Copiar/colar pose (Pose > Copy/Paste) e espelhar:
bpy.ops.pose.copy()
bpy.ops.pose.paste(flipped=True)

# 4. Loop perfeito: copiar o primeiro keyframe e colar no fim
bpy.ops.pose.copy()
# ... ir ao último frame e bpy.ops.pose.paste()
```

---

## 8. Setup do Blender MCP (PhB2RKugZXg)

> Checklist do vídeo para a IA/Claude controlar o Blender via MCP:

1. `uvx blender-mcp install-addon` → habilitar addon no Blender.
2. 3D Viewport → `N` → aba "MCP for Blender" → **Connect to MCP Server** (porta 9876).
3. Marcar **Polyhaven** (assets/HDRI) e **Hyper3D** (gerar modelos por texto) conforme necessário.
4. No chat, o MCP fica ativo automaticamente: "make a red cube" deve criar o cubo.

**Prompts de referência do vídeo (o "be specific" que gera bons resultados):**

- "Create a minimal cafe interior with three tables, chairs, a counter, and an espresso machine."
- "Build a space station. Add a spaceship orbiting a planet; give the ship a blue engine flame."
- "Make a desert environment with cactus, rocks and sand textures from Polyhaven + HDRI lighting."
- "Generate a steampunk robotic arm 3D model" (Hyper3D).

> Regra de ouro do vídeo: **"cool car" é vago; "futuristic Lamborghini-style sports car"
> gera muito melhor.** Prompt específico > prompt genérico.

---

## Fluxo Padronizado (decisão por categoria)

```
1. RECEBER AssetProfile + referência (imagem/descrição)
2. DECIDIR rota:
   ├── orgânico/único  → §1 Mirar+Subdiv + extrudar + UV + Rigify (§2/§3)
   ├── IA image-to-mesh → §4 (gerar partes + limpeza + AccuRig)
   ├── foto → 3D        → §5 (depth map displace)
   ├── prop/mesa/carro  → primitiva + extrude/boolean + materiais PBR
   └── casa/ambiente    → §5 + GeoNodes + Polyhaven texturas
3. LIMPAR e padronizar (§4) — SEMPRE
4. EXPORTAR .glb com Draco (ver Skill A / AssetProcessor)
5. VALIDAR budgets e escala/pivô (Y-up, base em Y=0)
```

---

## Regras de Negócio

1. **Tudo passa pelo Blender MCP** — nada vai direto para `public/models/`.
2. **Nível de subdiv de jogo = 1** (H4A0WDC9T7k): aplicar em level 1 antes de exportar.
3. **Todo asset de IA recebe a receita de limpeza §4** (merge by distance + weighted normal + apply transforms).
4. **Objetos cobertos são apagados** (economia de tris + menos problema de rig).
5. **Prompt específico sempre** (PhB2RKugZXg): característica + material + contexto.
6. **Rígidos seguem 1 osso**; deformáveis usam rig completo (Rigify/AccuRig).

## Restrições Técnicas (herdadas do MASTER_PLAN §3.5)

- Textura ≤ 1024×1024 (reduce depois — nunca subir).
- Personagem ≤ 15k tris (ideal 8k–12k); prop 500–8k; móvel 2k–8k; veículo 8k–25k; rocha 1k–20k; módulo arquitetura ≤ 50k.
- `.glb` com Draco nível 6–7; escala métrica; pivô base `Y=0`; Y-up.

## Checklist de Validação

- [ ] Mirror (clipping) + Subdivision aplicados/aplicados no nível certo.
- [ ] Merge by distance executado em assets de IA.
- [ ] Weighted Normal / shade smooth aplicado.
- [ ] Transforms aplicados (Ctrl+A rotation/scale).
- [ ] Origem no cursor (world origin) p/ export.
- [ ] Rig: auto weights (deformável) ou vertex group 100% (rígido).
- [ ] tris/textura/tamanho dentro do budget do profile.
- [ ] `.glb` Draco válido em `public/models/<categoria>/<asset_id>.glb`.

## Metadados

- **Arquivo:** `SKILL_BANK/SKILL_D_PERSONAGEM_BLENDER_MCP.md`
- **Data de criação:** 2026-09-11
- **Status:** Ativa
- **Fontes (transcrições):** H4A0WDC9T7k, gZIxrX1n2D4, TumrA0XsX0A, Jdz1I223oFw, TjJLIuFKA20, PhB2RKugZXg, QA60Tita1TE, axkgDt55fJE
- **Dependências:** Blender MCP (bpy), Rigify, AccuRig, Polyhaven/Poly Pizza/Sketchfab, Hyper3D/Tripo/Rodin (geração)