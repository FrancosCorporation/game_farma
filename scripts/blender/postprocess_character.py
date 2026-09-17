"""Pós-processo de personagem: GLB bruto (TRELLIS/gerador) -> GLB pronto para o jogo.

Uso:
  blender -b --python scripts/blender/postprocess_character.py -- <entrada.glb> <saida.glb> [tris_alvo=15000] [altura_m=1.72]

Faz: une malhas, decima ao orçamento, normaliza escala (altura em metros),
pivô nos pés (Z=0) e centralizado em X/Y, shade smooth e exporta GLB.
Orçamentos: docs/DIRETRIZES_ARTE_ESTILIZADA.md §2 (personagem 6k–15k tris).
"""
import sys
import bpy
from mathutils import Vector


def log(*a):
    print('[post]', *a, flush=True)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    src, dst = argv[0], argv[1]
    target_tris = int(argv[2]) if len(argv) > 2 else 15000
    target_h = float(argv[3]) if len(argv) > 3 else 1.72

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise SystemExit('nenhuma malha encontrada no GLB')
    log('malhas:', len(meshes), '| tris:', sum(tri_count(o) for o in meshes),
        '| dims entrada:', tuple(round(v, 3) for v in meshes[0].dimensions))

    # une tudo em uma malha
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object

    # decimação OPT-IN (default OFF): o Decimate do Blender destrói rostos detalhados.
    # O pipeline canônico (scripts/comfy/finalize_assets.py) usa gltf-transform simplify (meshopt).
    decimate = len(argv) > 4 and argv[4] == 'decimate'
    cur = tri_count(obj)
    if decimate and cur > target_tris:
        mod = obj.modifiers.new('dec', 'DECIMATE')
        mod.ratio = target_tris / cur
        bpy.ops.object.modifier_apply(modifier=mod.name)
        log('decimado:', cur, '->', tri_count(obj))

    # escala pela altura (Blender = Z-up); target_h <= 0 mantém as dimensões originais (props)
    dim = obj.dimensions
    if target_h > 0 and dim.z > 0:
        s = target_h / dim.z
        obj.scale = (s, s, s)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    log('altura final:', round(obj.dimensions.z, 3), 'm')

    # pivô: pés no chão (Z=0) e centro em X/Y
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    min_z = min(v.z for v in bb)
    cx = (max(v.x for v in bb) + min(v.x for v in bb)) / 2
    cy = (max(v.y for v in bb) + min(v.y for v in bb)) / 2
    obj.location.x -= cx
    obj.location.y -= cy
    obj.location.z -= min_z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    # sombreamento suave
    try:
        bpy.ops.object.shade_smooth()
    except Exception as e:
        log('shade_smooth falhou (segue):', e)

    # materiais: faixa estilizada (roughness alto, metalness baixo)
    for m in obj.data.materials:
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                if 'Roughness' in n.inputs:
                    n.inputs['Roughness'].default_value = max(0.5, n.inputs['Roughness'].default_value)
                if 'Metallic' in n.inputs:
                    n.inputs['Metallic'].default_value = min(0.1, n.inputs['Metallic'].default_value)

    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True)
    log('exportado:', dst, '| tris finais:', tri_count(obj),
        '| dims:', tuple(round(v, 3) for v in obj.dimensions))


if __name__ == '__main__':
    main()
