# Análise de Modelagem Blender – 12 Vídeos

## 5eIxHQnLqr0
**Assunto:** Início do tutorial de personagem: configuração de referências, key bindings e addons essenciais.

**Fluxo/Passos técnicos:**
- Mudança de key binding shift Z para alternar wireframe
- Ativação de addons: F2, Node Wrangler, Mesh tools (extra objects), Loop tools
- Criação de template front/side usando *shift+A* → *Image → Reference*
- Escala do cube como referência de altura (63.7 in → 1.62 m)
- Uso do 3D cursor e snap (*shift+S*) para posicionar cursor e origin
- Mirror modifier com *clipping* ativado para modelagem simétrica
- Proportional editing (*O* key) para suavizar movimentos de vértices
- Topology loops ao redor de olhos, nariz e boca
- Escultura com brushes *smooth* e *elastic*;
- Verificação de quads/poles/tris para boa deformação durante animação

**Addons/ferramentas:** F2, Node Wrangler, Mesh tools, Loop tools

**Replicar via Blender MCP (bpy):**
- `bpy.ops.preferences.addon_enable(module='f2')`
- `bpy.ops.preferences.addon_enable(module='node_wrangler')`
- `bpy.ops.preferences.addon_enable(module='extra_mesh_tools')`
- `bpy.ops.object.mode_set(mode='EDIT')`
- `bpy.ops.mesh.mirror(limit=0.001)` (aplicar mirror)
- `bpy.ops.transform.resize(value=(1.5,1.5,1.5))`

---

## 5d1vca8R43A
**Assunto:** Configuração de templates e referência de altura no Blender.

**Fluxo/Passos técnicos:**
- Criação de cube como referência de altura (1.6 m) e conversão para wireframe
- Adição de imagens front e side como *reference* (*shift+A → Image → Reference*)
- Rotacionar imagem side 180° (*R* → *Z* → *180* → *Enter*)
- Escala individual origins para ajustar altura de cada imagem
- Transparência 0.25 e modo “one‑sided” para imagens
- Organização em coleção “templates” e desmarcar *selectable*
- Configuração de navegação: track ball, *shift+Z* (wireframe), *Alt+Z* (X‑ray)
- Lista de plugins: F2, Node Wrangler, Mesh edit tools, Add mesh extra objects

**Addons/ferramentas:** F2, Node Wrangler, Mesh edit tools, Add mesh extra objects

**Replicar via Blender MCP (bpy):**
- `bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)`
- `bpy.ops.object.modifier_add(type='MIRROR')`
- `bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')`
- `bpy.ops.object.collection_member_move(to=bpy.data.collections['templates'])`
- `bpy.ops.object.shade_smooth()`

---

## teV6HmFyGoI
**Assunto:** Modelagem do corpo e membros: bloqueio de geometria, loops e escultura.

**Fluxo/Passos técnicos:**
- Extrude neck down (*E* → *Z*) e escala X para alargar
- Extrude Z para corpo, *G Y* para posicionar
- *Ctrl+R* loop cuts para clavícula, ombro e pectoral
- *Proportional editing* (*O* key) para modelagem suave
- Escultura em *Sculpt mode* com brush *smooth* e *elastic*
- Adição de geometry for arm, leg, foot com loop cuts adequados
- Formato de mão com dedos, knuckles e webbing entre dedos
- Uso de *Loop tools circle* para definir forma de dedos
- Fechamento de buracos com *F* e *M dissolve*

**Addons/ferramentas:** Loop tools, proportional editing, brushes de escultura

**Replicar via Blender MCP (bpy):**
- `bpy.ops.mesh.extrude_vertices_move(value=(0,0,-1))`
- `bpy.ops.transform.resize(value=(1.2,1.2,1.2))`
- `bpy.ops.mesh.duplicate()`
- `bpy.ops.object.mode_set(mode='SCULPT')`
- `bpy.ops.sculpt.brush_pressure(value=0.5)`
- `bpy.ops.mesh.normals_make_consistent()`

---

## ySH7wCj44tc
**Assunto:** Modelagem de mãos e pés com topologia para articulações.

**Fluxo/Passos técnicos:**
- Extrude thumb e fingers (*E*), escala e rotação com *3D cursor*
- *Ctrl+R* loop cuts para knuckles; *K* cut tool para separar geometria
- *Dissolve vertices* (*X → Dissolve*) para limpar malhas
- Posicionamento de webbing entre dedos usando *loop tools circle*
- Mirror e duplicate para mão/pé contralateral
- Preparação para UV unwrapping (marcar seams, *Mark Seam*)

**Addons/ferramentas:** Loop tools, proportional editing, edge split

**Replicar via Blender MCP (bpy):**
- `bpy.ops.mesh.extrude_vertices_move(value=(0,0,0))`
- `bpy.ops.transform.resize(value=(0.8,0.8,0.8))`
- `bpy.ops.mesh.delete(type='EDGE')`
- `bpy.ops.mesh.dissolve_vertices()`
- `bpy.ops.object.mode_set(mode='EDIT')`
- `bpy.ops.mesh.mark_seam()`

---

## NhczQYLkCkg
**Assunto:** Criação de cabelo tubular com path e textura procedural.

**Fluxo/Passos técnicos:**
- Cylinder hair tube (*Shift+A → Mesh → Cylinder*)
- Path curve modifier; origin set to 3D cursor (*Shift+S → 2* then *Object → Set Origin → 3D Cursor*)
- UV mark seam e *unwrap* para cada tamanho de cabelo (large, medium, small)
- Textura procedural: *Noise Texture → Color Ramp → Mix Shader* para variação de cor e brilho
- Escala de UVs proporcional ao tamanho do cabelo
- Transparência raiz/dica usando *Alpha* e *Ramp* combinados

**Addons/ferramentas:** Nenhum addon específico (uso de nodes nativos)

**Replicar via Blender MCP (bpy):**
- `bpy.ops.mesh.primitive_cylinder_add(radius=1.5, depth=3)`
- `bpy.ops.object.origin_set(type='ORIGIN_3D', center='MEDIAN')`
- `bpy.ops.object.modifier_add(type='CURVE')`
- `bpy.ops.object.mode_set(mode='EDIT')`
- `bpy.ops.mesh.mark_seam()`
- `bpy.ops.uv.unwrap()`

---

## K2fEdcz70Jw
**Assunto:** Modelagem de sobrancelhas e cílios com geometria leve.

**Fluxo/Passos técnicos:**
- Escultura do queixo (*Sculpt mode*) para ajustar ângulo
- Duplicate geometry for eyelashes; *Ctrl+R* loop cuts para adicionar loops
- UV unwrap e alinhamento de textura hair material
- Edge crease + *Sharp* para definir bordas
- Duplicate and flip normals para camadas front/back
- Adicionar randomness via textura e escala de brush
- Posicionamento de múltiplas camadas de cílios

**Addons/ferramentas:** F2 (para atalhos), brushes de escultura

**Replicar via Blender MCP (bpy):**
- `bpy.ops.object.mode_set(mode='SCULPT')`
- `bpy.ops.sculpt.brush_select_all()`
- `bpy.ops.mesh.duplicate()`
- `bpy.ops.mesh.normals_make_consistent()`
- `bpy.ops.object.mode_set(mode='EDIT')`
- `bpy.ops.mesh.mark_seam()`

---

## sdE9q_784F0
**Assunto:** Baking de texturas procedurais a mapas de textura (albedo, alpha, normal).

**Fluxo/Passos técnicos:**
- Criação de coleção “bake”, ocultar geometria desnecessária
- Render setup: *Cycles*, samples 128, desativar indirect, glossy, transmission, ambient, emission
- Bake *Albedo* (cor); salvar como *//textures/albedo.png*
- Bake *Normal*; ajustar *sample bias* (–0.5) e salvar *//textures/normal.png*
- Bake *Alpha*; definir cores pretas/white para transparência; salvar *//textures/alpha.png*
- Criar material novo usando texturas baked; plug em *Emission* / *BSDF*
- Definir *Non-Color* para alpha e normal

**Addons/ferramentas:** Nenhum

**Replicar via Blender MCP (bpy):**
- `bpy.ops.object.mode_set(mode='OBJECT')`
- `bpy.ops.object.collection_member_move(to=bpy.data.collections['bake'])`
- `bpy.ops.render.bake_type('COLOUR')`
- `bpy.ops.image.save_as(filepath='//textures/albedo.png')`
- `bpy.ops.render.bake_type('NORMAL')`
- `bpy.ops.image.save_as(filepath='//textures/normal.png')`

---

## vZtuiBNt7xs
**Assunto:** Desenvolvimento de layout UV para personagem.

**Fluxo/Passos técnicos:**
- Marcar seams em bordas selecionadas (*Mark Seam*)
- *UV Unwrap* para cada parte (mão, pé, rosto, etc.)
- Ver distorção via textura overlay; ajustar escala das ilhas
- *Average Island Scale* para uniformizar tamanhos
- *Pack Islands* para organizar layout no espaço 2D
- Orientar e espelhar partes quando necessário
- Exportar layout UV para revisão externa

**Addons/ferramentas:** Nenhum

**Replicar via Blender MCP (bpy):**
- `bpy.ops.mesh.mark_seam()`
- `bpy.ops.uv.unwrap()`
- `bpy.ops.uv.smart_project()`
- `bpy.ops.uv.island_scale()`
- `bpy.ops.uv.pack_islands()`
- `bpy.ops.uv.export_layout(filepath='//uv_layout.png')`

---

## oCorBaZyygI
**Assunto:** Pintura de textura albedo, sardas, lábios, sombra de olhos e blush.

**Fluxo/Passos técnicos:**
- Mudar para workspace *Texture Paint*
- Configurar material com *Image Texture* (albedo 4096×4096)
- Brushes: *Soft*, *Fill*, *Blur*, *Clone*
- Pintura da pele base; uso de *Texture Mask* para sardas
- Pintura de lábios com máscara e ajuste de brilho
- Sombra de olhos e blush usando brush *Soft* e *Mirror mode*
- Salvamento da textura como imagem (*Image → Save As*)

**Addons/ferramentas:** Nenhum

**Replicar via Blender MCP (bpy):**
- `bpy.ops.object.mode_set(mode='TEXTURE_PAINT')`
- `bpy.ops.paint.brush_select('BRUSH')`
- `bpy.ops.paint.fill()`
- `bpy.ops.paint.mask()`
- `bpy.ops.paint.blur()`
- `bpy.ops.image.save_as(filepath='//textures/albedo.png')`

---

## E61LwNLOsGI
**Assunto:** Baking de normal map de alta para baixa densidade.

**Fluxo/Passos técnicos:**
- Adicionar *Multi‑Res* modifier ao mesh de alta detalhe; nível 7
- Escultura detalhada em *Sculpt mode* com brush *standard*
- Baking: *high‑res mesh* shift‑click *low‑res mesh*, textura *Normal*, *sample bias* –0.5
- Salvar normal map; processar em Photoshop para anti‑aliasing
- Aplicar normal map ao material do low‑poly; ajustar *Non‑Color*

**Addons/ferramentas:** Nenhum

**Replicar via Blender MCP (bpy):**
- `bpy.ops.object.modifier_add(type='MULTI_RES')`
- `bpy.ops.object.modifier_set_cut_level(level=7)`
- `bpy.ops.object.mode_set(mode='SCULPT')`
- `bpy.ops.sculpt.brush_pressure(value=0.5)`
- `bpy.ops.object.mode_set(mode='OBJECT')`
- `bpy.ops.render.bake_type('NORMAL')`

---

## _l3su14sxUI
**Assunto:** Criação de mapa de subsurface scattering para pele translúcida.

**Fluxo/Passos técnicos:**
- Duplicate character; esconder cabelo/outros elementos
- *Image Texture* non‑color; plug em *Subsurface Scattering* panel
- Strength inicial .025; pintar áreas translúcidas (orelhas, ponta do nariz, dedos)
- Ajustar luz *empty* animada para visualizar efeito enquanto pinta
- Salvar textura; combinar com *Color Ramp* para variações de vermelho/laranja

**Addons/ferramentas:** Nenhum

**Replicar via Blender MCP (bpy):**
- `bpy.ops.object.duplicate()`
- `bpy.ops.object.mode_set(mode='TEXTURE_PAINT')`
- `bpy.ops.image.new(name='sss', width=4096, height=4096)`
- `bpy.ops.object.texture_slot_assign(index=0)`
- `bpy.ops.object.modifier_add(type='SUBSURFACE')`
- `bpy.ops.object.modifier_set_show_in_editmode(state=True)`

---

## ruosyTT2FmM
**Assunto:** Finalização da série: subsurface scattering e próximo passo (roupa).

**Fluxo/Passos técnicos:**
- Manter subsurface scattering ativo; pintar áreas finas (orelhas, nariz, dedos)
- Animar *empty* de luzes para controlar direção enquanto pinta
- Salvar textura SSS; próximo vídeo cobrirá criação de roupa/dress

**Addons/ferramentas:** Nenhum

**Replicar via Blender MCP (bpy):**
- `bpy.ops.object.modifier_add(type='SUBSURFACE')`
- `bpy.ops.object.modifier_set_show_in_editmode(state=False)`
- `bpy.ops.object.mode_set(mode='TEXTURE_PAINT')`
- `bpy.ops.image.save_as(filepath='//textures/sss.png')`
- `bpy.ops.object.mode_set(mode='OBJECT')`
- `bpy.ops.object.collection_member_move(to=bpy.data.collections['dress'])`