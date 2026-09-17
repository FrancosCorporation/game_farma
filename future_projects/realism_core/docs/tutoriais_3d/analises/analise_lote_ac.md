# Análise de Transcrições de Vídeos Blender/MCP

## LReB826Xbd4.txt
- **Assunto**: Tutorial de como criar vídeos documentários 3D usando IA (ChatGPT + NovAI + Google VO3.1).
- **Fluxo/Passos técnicos**: Passar prompt no ChatGPT → selecionar tópicos → copiar Form 2 → gerar script → definir duração → gerar imagens via Google JMni/Nano Banana → converter imagens em vídeo via NovAI (image-to-video e text-to-video) → gerar áudio via Google AI Studio → montar vídeo final em editor.
- **Addons/ferramentas**: ChatGPT, Google JMni, Nano Banana Pro, Google Whisk, NovAI, Google AI Studio.
- **Replicar via Blender MCP (bpy)**: 
  1. `bpy.ops.object.select_all(action='SELECT')` + `bpy.ops.object.delete()` para limpar cena
  2. `bpy.ops.mesh.primitive_ico_sphere_add()` para criar base mesh
  3. `bpy.ops.object.modifier_apply(modifier=' subdivision_surface')` para aplicar subdivisão
  4. `bpy.ops.object.camera_add()` para adicionar câmera
  5. `bpy.context.scene.render.engine = 'CYCLES'` para motor de render
  6. `bpy.ops.render.render()` para gerar output

## Lxem4yMs5Dg.txt
- **Assunto**: Introdução à escultura (sculpting) para iniciantes no Blender.
- **Fluxo/Passos técnicos**: Configurar Blender para escultura → usar tablet de desenho → aprender atalhos (F/shift+F para radius/strength) → usar brushes principais (draw, clay strips, crease, smooth, inflate) → prática de escultura de peixe.
- **Addons/ferramentas**: Tablet de desenho (Wacom pequeno), Blender 3D.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.mode_set(mode='SCULPT')` para modo escultura
  2. `bpy.context.tool_settings.sculpt.brush = 'DRAW'` para brush draw
  3. `bpy.context.tool_settings.sculpt.brush = 'CLAY_STRIPS'` para clay strips
  4. `bpy.ops.sculpt.brush_select('INVOKE_DEFAULT', brush='CREASE')` para crease brush
  5. `bpy.ops.sculpt.brush_select('INVOKE_DEFAULT', brush='SMOOTH')` para smooth brush
  6. `bpy.ops.sculpt.pen_pressure_toggle()` para ativar pressão da caneta

## nESaz92SJ0w.txt
- **Assunto**: Tutorial "easier Blender ever" focando em recursos core para iniciantes absolutos.
- **Fluxo/Passos técnicos**: Mover na cena (scroll wheel, shift+click middle mouse, numpad views) → modo objeto vs edit mode → loop cut (Ctrl+R) → extrude (E) → inset (I) → aplicar transforms (Ctrl+A) → adicionar cilindros para rodas → usar modifier mirror → modifier boolean para cortar formas.
- **Addons/ferramentas**: Nenhum addon específico mencionado; Blender vanilla.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.mode_set(mode='EDIT')` para modo edit
  2. `bpy.ops.mesh.loopcut_slide()` para loop cut
  3. `bpy.ops.mesh.extrude()` para extrusão
  4. `bpy.ops.mesh.inset()` para inset
  5. `bpy.ops.object.modifier_apply(apply_as='DATA', modifier='Boolean')` para boolean
  6. `bpy.ops.object.mirror_modifier_toggle()` para mirror

## nRu41Wsfc8o.txt
- **Assunto**: Workflow para animações de nível Hollywood em Blender usando captura de movimento e rigs avançados.
- **Fluxo/Passos técnicos**: Importar modelo do Miximo → usar auto-rig tool → exportar FBX (apenas seleção, sem animation) → importar no Blender → adicionar control rig via Miximo add-on → aplicar animações non-linear → blending de animações (running + jumping) → IK constraints para armas.
- **Addons/ferramentas**: Miximo, RCOO motion capture suit, Miximo control rig add-on, Blender non-linear animation.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.mode_set(mode='POSE')` para pose mode
  2. `bpy.ops.pose.armature_apply()` para aplicar rig
  3. `bpy.ops.object.modifier_add(type='ARMATURE')` adicionar rig
  4. `bpy.ops.object.constraint_add(type='CHILD_OF')` constraint child of
  5. `bpy.ops.anim.nla_track_add()` adicionar track NLA
  6. `bpy.ops.pose.ikconstraint_add()` adicionar constraint IK

## nYM_9XZzPIE.txt
- **Assunto**: Como criar vídeos 3D cartoon animados que estão fazendo sucesso no YouTube e Instagram.
- **Fluxo/Passos técnicos**: Abrir ChatGPT → obter "print" com pergunta → gerar imagem no Google JMni/Nano Banana Pro → salvar imagem → abrir aplicativo Gok (Play Store) → colar imagem → gerar vídeo → baixar vídeo.
- **Addons/ferramentas**: ChatGPT, Google JMni, Nano Banana Pro, aplicativo Gok (Android).
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.camera_add()` para adicionar câmera
  2. `bpy.context.scene.render.resolution_x = 1920` definir resolução
  3. `bpy.context.scene.render.resolution_y = 1080`
  4. `bpy.ops.object.light_add()` adicionar luz
  5. `bpy.ops.render.render()` renderizar imagem
  6. `bpy.image.save_as_happy()` salvar imagem gerada

## O6HQhs-gk50.txt
- **Assunto**: Tutorial de modelagem box modeling para criar personagem low poly humano do zero.
- **Fluxo/Passos técnicos**: Adicionar cube (Shift+A) → tab para edit mode → selecionar tudo (A) → escala (S) → loop cut (Ctrl+R) → extrude (E) → inset (I) → mirror modifier → subdivision surface → smooth shading.
- **Addons/ferramentas**: Blender 4.1 (compatível com 3.0), modifier mirror, subdivision surface.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.mesh.primitive_cube_add()` adicionar cube
  2. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  3. `bpy.ops.mesh.select_all()` selecionar tudo
  4. `bpy.ops.mesh.extrude()` extrudar
  5. `bpy.ops.object.modifier_add(type='MIRROR')` modifier mirror
  6. `bpy.ops.object.modifier_apply(modifier='Subdivision Surface')` aplicar subdiv

## ogz-3r0EHKM.txt
- **Assunto**: Como criar personagem 3D para jogos do zero (esboço → modelagem → texturing → rig → animações).
- **Fluxo/Passos técnicos**: Instalar addons (loop tools, rigidify, images as planes) → importar esboço → modelagem com subdivision surface + mirror → UV unwrap com seams → texturing com color palette ou materiais separados → baking de texturas (diffuse + roughness + AO) → rig com addon rigidify → pintura de weights → exportar FBX → setup em Unity com animator.
- **Addons/ferramentas**: Loop Tools, Rigify, Images as Planes, Blender Cycles renderer.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.preferences.addon_enable_addon(name='loop_tools')` habilitar addon
  2. `bpy.ops.object.modifier_add(type='MIRROR')` mirror modifier
  3. `bpy.ops.object.modifier_apply(modifier='Subdivision Surface')` subdiv
  4. `bpy.ops.uv.unwrap()` unwrap UV
  5. `bpy.ops.object.modifier_add(type='SUBSURF')` subsurf
  6. `bpy.ops.ptc.bake()` baking de texturas (se disponível)

## OjiwRIE21UA.txt
- **Assunto**: Como criar cabeça low poly baseada em imagens de referência (frontal + lateral).
- **Fluxo/Passos técnicos**: Apagar cube padrão → adicionar round cube (mesh extra objects) → configurar imagens de referência (frontal + lateral + top) → escultura da cabeça em modo edit → usar mirror modifier → deletar metade → adicionar geometria para nariz → merge head + nose → UV unwrapping com cube projection → texturing básico.
- **Addons/ferramentas**: Add mesh: extra objects (para round cube), Blender vanilla.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.mesh.primitive_ico_sphere_add()` round cube
  2. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  3. `bpy.ops.mesh.delete()` deletar faces
  4. `bpy.ops.object.modifier_add(type='MIRROR')` mirror
  5. `bpy.ops.mesh.knife_project()` corte projetado
  6. `bpy.ops.uv.smart_project()` smart UV project

## peSv5IT5Ve4.txt
- **Assunto**: Aprendizado de Blender para iniciantes absolutos em 2025; fundamentos de navegação, modos e ferramentas básicas.
- **Fluxo/Passos técnicos**: Instalar Blender (download direto, sem conta) → navegar na viewport (scroll wheel, shift+middle mouse, numpad views) → modos objeto e edit → atalhos básicos (G=move, R=rotate, S=scale, Ctrl+R=loop cut, E=extrude, G+Z/Y/X para restrição) → adicionar objetos (Shift+A) → shade smooth auto smooth.
- **Addons/ferramentas**: Blender 2.3.2 / 3.2 (versões citadas), nenhum addon obrigatório.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.wm.append()` ou `bpy.ops.wm.link()` importar arquivos
  2. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  3. `bpy.ops.mesh.primitive_cube_add()` add cube
  4. `bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)` aplicar transforms
  5. `bpy.ops.object.shade_smooth()` shade smooth
  6. `bpy.ops.object.shade_auto_smooth()` auto smooth

## q6nh5sktCnI.txt
- **Assunto**: Desafio de aprender Blender em 3 dias fazendo streaming; modelagem, texturing e rigging básicos.
- **Fluxo/Passos técnicos**: Seguir tutorial do Louis Zong → aprender hotkeys básicos (space bar search, G, S, R, Ctrl+R, E) → modelar estágio → chair → window → adicionar objetos via Shift+A → texturing com materiais e nodes (complexo) → rigging com bones → animação básica.
- **Addons/ferramentas**: Blender vanilla, chat para ajuda durante stream.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.mode_set(mode='OBJECT')` modo objeto
  2. `bpy.ops.object.select_all(action='DESELECT')` deselecionar tudo
  3. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  4. `bpy.ops.mesh.loopcut_slide()` loop cut
  5. `bpy.ops.mesh.extrude()` extrudar
  6. `bpy.ops.object.mode_set(mode='OBJECT')` voltar modo objeto

## qO3D7LuV3Ys.txt
- **Assunto**: Tutorial completo para criar personagem low poly do zero; overview do workflow do criador.
- **Fluxo/Passos técnicos**: Preparar turnaround drawing → modeling em vista ortográfica (numpad 1/3) → usar cubes, cylinders, loop cuts → proportional editing → mirror modifier → extrude para mãos/pernas → UV unwrapping → texturing com brushes Artist Essentials → rigging básico.
- **Addons/ferramentas**: Addon Loop Tools, brush pack Artist Essentials (Naughty Dog, $10), Blender Eevee.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.preferences.addon_enable_addon(name='loop_tools')` habilitar loop tools
  2. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  3. `bpy.ops.mesh.extrude()` extrudar
  4. `bpy.ops.mesh.loopcut_slide()` loop cut
  5. `bpy.ops.object.modifier_add(type='MIRROR')` mirror
  6. `bpy.ops.uv.smart_project()` smart UV project

## qVz7MpbW8Mc.txt
- **Assunto**: Study do art style Overwatch; modeling, texturing e lighting para ambiente food cart.
- **Fluxo/Passos técnicos**: Gathering reference (pureref) → definir storytelling (local, habitantes, clima) → modeling with reusability (modular kit, trim sheets) → texturing com face weighted normals e Kiss method (keep it simple) → lighting setup com normals vertex blending → uso de emissive maps para highlights → editable spline actors.
- **Addons/ferramentas**: Pureref, Blender, Unreal Engine (para aplicação), face weighted normals technique.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.empty_add()` adicionar empty para referência
  2. `bpy.ops.object.modifier_add(type='NORMALS')` face weighted normals (via script)
  3. `bpy.ops.object.modifier_add(type='SUBSURF')` subsurf
  4. `bpy.ops.object.material_slot_add()` adicionar material slot
  5. `bpy.ops.texture.paint()` painting texture
  6. `bpy.ops.object.light_add()` adicionar luz

## qxUNrBOdwrg.txt
- **Assunto**: Auto-imposed challenge de aprender Blender em 3 dias (live streaming); do donut ao personagem PS1 horror.
- **Fluxo/Passos técnicos**: Dia 1: tutorial donut (Louis Zong) + começar stage/modelo; Dia 2: chair modeling + texturing com UV stencil; Dia 3: character modeling + rigging + animação básica; uso intensivo de hotkeys, trial and error, consultas ao chat.
- **Addons/ferramentas**: Blender vanilla, chat interaction durante stream, addons opcionais conforme necessidade.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.mode_set(mode='OBJECT')` modo objeto
  2. `bpy.ops.object.select_all(action='SELECT')` selecionar tudo
  3. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  4. `bpy.ops.mesh.primitive_cube_add()` cube
  5. `bpy.ops.mesh.extrude()` extrudar
  6. `bpy.ops.object.mode_set(mode='POSE')` pose mode para rig

## sbCW0Cs7aI8.txt
- **Assunto**: Fundamentos absolutos para iniciantes no Blender; interface, navegação e ferramentas básicas.
- **Fluxo/Passos técnicos**: Download direto do blender.org (sem conta) → viewport navigation (middle mouse rotate, shift+middle pan, roll zoom) → numpad views (1=front, 3=right, 7=top) → objeto mode vs edit mode → atalhos G (move), R (rotate), S (scale) → Shift+A add menu → loop cut Ctrl+R → extrude E → scale S → rotate R.
- **Addons/ferramentas**: Blender vanilla, nenhum addon necessário.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.wm.url_open()` abrir blender.org
  2. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  3. `bpy.ops.mesh.primitive_cube_add()` cube
  4. `bpy.ops.object.transform_apply()` aplicar transforms
  5. `bpy.ops.object.shade_smooth()` shade smooth
  6. `bpy.ops.object.shade_auto_smooth()` auto smooth

## sEAWgP8YCE8.txt
- **Assunto**: Técnica de esboço 3D a partir de conceitos 2D; criar personagens 3D sem necessidade de sculpt/retopology avançada.
- **Fluxo/Passos técnicos**: Iniciar com shoe como proof of concept → separar modelo em partes múltiplas → modelar com primitive shapes + grab brush → adicionar grease pencil lines → texturing com UV maps (hand-made ou smart UV) → paint com brush pack Artist Essentials ($10, Naughty Dog) → lattice modifier para deformar cabeça → composição final com noise e glare no compositor.
- **Addons/ferramentas**: Blender vanilla + addon opcional Artist Essentials brush pack; lattice modifier nativo.
- **Replicar via Blender MCP (bpy)**:
  1. `bpy.ops.object.mode_set(mode='SCULPT')` modo escultura
  2. `bpy.ops.sculpt.brush_select('INVOKE_DEFAULT', brush='GRAB')` brush grab
  3. `bpy.ops.object.modifier_add(type='LATTICE')` modifier lattice
  4. `bpy.ops.object.mode_set(mode='EDIT')` modo edit
  5. `bpy.ops.mesh.uv_smart_project()` smart UV project
  6. `bpy.ops.graph.node_add(type='COMPOSITE')` adicionar nodo compositor