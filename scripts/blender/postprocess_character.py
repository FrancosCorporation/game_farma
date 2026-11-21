"""Pós-processo de personagem: GLB bruto (TRELLIS/gerador) -> GLB pronto para o jogo.

Uso:
  blender -b --python scripts/blender/postprocess_character.py -- <entrada.glb> <saida.glb> [tris_alvo=15000] [altura_m=1.72]

Faz: une malhas, decima ao orçamento, normaliza escala (altura em metros),
aterrissa e centraliza no eixo vertical detectado, shade smooth e exporta GLB.
Orçamentos: docs/DIRETRIZES_ARTE_ESTILIZADA.md §2 (personagem 6k–15k tris).
"""
import sys
import bpy
from mathutils import Vector


def log(*a):
    print('[post]', *a, flush=True)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def normalized_scale(current_scale, current_height, target_height):
    """Return imported scale multiplied by the ratio needed to reach target height."""
    scale = tuple(float(component) for component in current_scale)
    if target_height <= 0 or current_height <= 0:
        return scale
    ratio = float(target_height) / float(current_height)
    return tuple(component * ratio for component in scale)


def vertical_axis(dimensions):
    """Choose the dominant character-height axis; prefer legacy Z on exact ties."""
    return max(range(3), key=lambda axis: (float(dimensions[axis]), axis == 2))


def grounded_center_offset(bounds_min, bounds_max, up_axis):
    """Translate bounds to floor the up axis at zero and center the other axes."""
    return tuple(
        -float(bounds_min[axis]) if axis == up_axis
        else -(float(bounds_min[axis]) + float(bounds_max[axis])) / 2
        for axis in range(3)
    )


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

    # Basear a escala nos bounds world-space. Alguns importadores mantêm
    # obj.dimensions alinhado ao eixo local do GLB mesmo após a conversão para Z-up.
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    bounds_min = tuple(min(v[axis] for v in bb) for axis in range(3))
    bounds_max = tuple(max(v[axis] for v in bb) for axis in range(3))
    world_dimensions = tuple(bounds_max[axis] - bounds_min[axis] for axis in range(3))

    # GLB externos podem chegar Y-up ou Z-up no Blender. Para personagens,
    # a maior dimensão world-space identifica o eixo vertical; props mantêm Z.
    up_axis = vertical_axis(world_dimensions) if target_h > 0 else 2
    if target_h > 0 and world_dimensions[up_axis] > 0:
        # Bounds already include the imported object's current scale.
        # Apply the ratio relatively; replacing scale with it compounds size.
        obj.scale = normalized_scale(obj.scale, world_dimensions[up_axis], target_h)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # pivô: pés no chão e centro nos dois eixos restantes.
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    bounds_min = tuple(min(v[axis] for v in bb) for axis in range(3))
    bounds_max = tuple(max(v[axis] for v in bb) for axis in range(3))
    world_dimensions = tuple(bounds_max[axis] - bounds_min[axis] for axis in range(3))
    log('eixo vertical:', 'XYZ'[up_axis], '| altura final:', round(world_dimensions[up_axis], 3), 'm')
    offset = grounded_center_offset(bounds_min, bounds_max, up_axis)
    world_matrix = obj.matrix_world.copy()
    world_matrix.translation += Vector(offset)
    obj.matrix_world = world_matrix
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
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    final_min = tuple(min(v[axis] for v in bb) for axis in range(3))
    final_max = tuple(max(v[axis] for v in bb) for axis in range(3))
    log('exportado:', dst, '| tris finais:', tri_count(obj),
        '| bounds:', tuple(round(final_max[i] - final_min[i], 3) for i in range(3)))


if __name__ == '__main__':
    main()
