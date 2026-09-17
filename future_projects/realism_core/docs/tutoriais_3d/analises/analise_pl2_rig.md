# Análise playlist 2 (rig/vestuário/render) — Blender Complete Character Tutorial

## YA4DMhwtL_8
**Assunto:** Modelagem de vestido – duplicar faces do tronco, esculpir dobras, espessura e acabamento.
**Fluxo:** Importar esboço → esconder cabelo → selecionar faces do tronco/pernas → `Shift+D` duplicar + `Separate by Selection` → offset `Alt+S` (escala ao longo das normals) → modelar com snap/`G` duplo/escultura (elastic) → `K` knife loops + `Dissolve Edges` → mirror + clipping + smooth → espessura `Extrude`+`Solidify` → salvar versão "short dress blank".
**Addons:** nenhum (nativos + brushes de escultura).
**bpy:** `bpy.ops.mesh.duplicate()` / `bpy.ops.mesh.separate_by_selection()` / `modifier_add('SOLIDIFY')` thickness 0.05 / `modifier_add('MIRROR')` apply.

## I0j_YC4xzXk
**Assunto:** UV do vestido – seams, unwrap, pin e layout para Photoshop.
**Fluxo:** workspace UV Editing, isolar `/` → `Edge > Mark Seam` (cinto, barra, interior) → `Clear Seam` antigo → `UV > Unwrap` com proportional → `Pin` vértices → ajustar com `G/S/X/Y` → exportar layout UV.
**Addons:** nenhum.
**bpy:** `bpy.ops.uv.smart_project()` / `bpy.ops.edge.mark_seam()` / `bpy.ops.uv.unwrap()` / `bpy.ops.uv.export_layout()`.

## aka2iV4XqH4
**Assunto:** Esculpir dobras + bake de normal/albedo (Photoshop↔Blender).
**Fluxo:** Multi-Resolution + subdividir malha alta → esculpir (Clay Strips, Sharp, Smooth, Flatten, Pinch) → desativar/reativar mirror → costura a partir de edge loops (`Ctrl+R`, convert to curve, Array+Bevel) → exportar layout UV → textura albedo no PS (flores, stitching, Levels/Hue) → normal map no PS → no Blender conectar Image Texture→Normal → bake high→low (extrusion ~0.05).
**Addons:** Multi-Resolution; Photoshop.
**bpy:** `modifier_new('Multires','SUBSURF')` levels 3 / `sculpt.brush_preset('CLAY_STRIPS')` / `uv.export_layout()` / `object.bake(extrude=0.05)`.

## dv8dsKwPtV8
**Assunto:** Modelagem + UV do sapato (base, plataforma, salto).
**Fluxo:** duplicar/separar faces da perna → modelar sapato `E`/`S`/`F` → edge loops `Ctrl+R` p/ flexão → importar referências (frente/lateral/baixo) como Image Reference → plataforma/salto com extrusões + `S Z 0` + `Alt+S` + proportional → marcar seams → unwrap + align X/Y + pin → layout UV → paint (couro, metal, costura) → Solidify + Mark Sharp.
**Addons:** nenhum.
**bpy:** `mesh.duplicate()` / `mesh.extrude_region_move()` / `edge.crease()` / `edge.mark_seam()` / `uv.unwrap()`.

## j7nTlUzsdII
**Assunto:** Textura + normal do sapato (Photoshop) e bake.
**Fluxo:** exportar layout UV 2K/4K → no PS padrão diamante/couro/costura/metal → gerar albedo, roughness, metalness, normal (Levels/Sat/Brightness) → no Blender conectar Base Color/Roughness/Metallic/Normal → Cycles bake normal high→low (extrusion 0.05, ray distance).
**Addons:** Photoshop↔Blender.
**bpy:** `bpy.ops.image.open()` / conectar `nodes['Image Texture'].outputs[Color]`→`bsdf.inputs['Base Color']` / `object.bake(extrude=0.05)`.

## IOjH0eG43Ak
**Assunto:** Rigging com Rigify – gerar rig, pesos e integrar roupa.
**Fluxo:** habilitar Rigify → human metarig → posicionar/ajustar bones (cintura, tórax, membros) → weight paint para roupa seguir corpo → vertex groups → testar A/T-pose → exportar .glb Draco.
**Addons:** Rigify.
**bpy:** `preferences.addon_enable(module='rigify')` / `armature.rigify_preset()` / weight paint `vertex_group_assign()` / `export_scene.gltf(use_draco_compression=True)`.

## 62k9seQdARA
**Assunto:** Ajustar roupa ao rig – evitar penetração e otimizar topologia.
**Fluxo:** Pose Mode testar poses → `Vertex Groups` da roupa ajustar pesos (anti "poking through") → mirror+clipping nos pesos → `Dissolve Edges` p/ reduzir tris ≤15k → corrigir normals (Flip) + Subdivision baixo → exportar .glb Y-up.
**Addons:** nenhum.
**bpy:** `pose.pose_flip()` / weight paint assign / `mesh.dissolve_vertices()` / `export_scene.gltf(use_draco_compression=True, forward_axis='Y_UP')`.

## bA1QJHfoRIE
**Assunto:** Expressões via Shape Keys + Pose Library.
**Fluxo:** shape keys base (boca, olhos, sobrancelhas) → editar valores -1..1 → salvar Pose Library → vincular poses ao rig (drivers/constraints) → testar no Timeline → exportar shape keys (morph targets p/ Three.js).
**Addons:** shape keys nativas + Pose Library.
**bpy:** `object.shape_key_add()` / `active_shape_key.value = 0.5` / `wm.save_pose_library()` / `export_scene.gltf(shape_key_export=True)`.

## Ir-PhXLkH2Y
**Assunto:** Render simples – Cycles, luz, câmera, output.
**Fluxo:** engine Cycles → luz ambiente + direcional (intensidade/cor) → câmera (`View > Camera to View`) + resolução/aspecto → World settings (sky/cor/AO) → output PNG 1024 → render.
**Addons:** nenhum.
**bpy:** `scene.render.engine='CYCLES'` / `bpy.data.lights.new(name='Sun', type='SUN')` energy 5 / `scene.render.resolution_x=1024` / `render.render(write_still=True)`.

## KUZx-787s4A
**Assunto:** Shape keys p/ ARKit / blend shapes (mocap).
**Fluxo:** shape keys nomeadas (mouth_open, eye_blink) → valores 0..1 evitando soma >1 → exportar GLTF 2.0 com Export Shape Keys → usar Morph Targets no Unity/ARKit → manter Y-up + pivô Y=0.
**Addons:** shape keys nativas; exportador glTF.
**bpy:** `object.shape_key_add(from_mix=False)` / `active_shape_key.name='mouth_open'` / `export_scene.gltf(export_shape_keys=True, forward_axis='Y_UP')`.