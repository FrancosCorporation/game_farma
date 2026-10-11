#!/usr/bin/env python3
"""Generate weights on a same-character voxel proxy and transfer them back.

This avoids nearest-vertex transfer from a differently posed reference mesh.
The original target geometry is preserved; only vertex-group weights are new.
The reference rig supplies the 65-bone Mixamo hierarchy and bind pose.

Usage:
  blender -b --python scripts/rebind_character_voxel_auto.py -- \
    reference_rigged.glb target_raw.glb output_skinned.glb [voxel_size=0.012] [max_transfer_distance=0.06]
"""
import math
import os
import sys

import bpy
from mathutils import kdtree, Matrix, Vector


ALIGN = (
    Matrix.Translation(Vector((0.0, 1.0, 0.0)))
    @ Matrix.Rotation(math.pi / 2, 4, 'X')
    @ Matrix.Scale(1.0 / 0.575, 4)
)


def args_after_double_dash():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def main():
    argv = args_after_double_dash()
    if len(argv) not in (3, 4, 5, 6):
        raise SystemExit(
            'Uso: blender -b --python scripts/rebind_character_voxel_auto.py -- '
            'reference_rigged.glb target_raw.glb output_skinned.glb '
            '[voxel_size=0.012] [max_transfer_distance=0.06] [export_animations=0|1]'
        )
    reference, target, output = map(os.path.abspath, argv[:3])
    voxel_size = float(argv[3]) if len(argv) >= 4 else 0.012
    max_transfer_distance = float(argv[4]) if len(argv) >= 5 else 0.06
    include_animations = len(argv) >= 6 and argv[5] == '1'
    if len(argv) >= 6 and argv[5] not in ('0', '1'):
        raise SystemExit('export_animations deve ser 0 ou 1.')
    if not (0.006 <= voxel_size <= 0.04):
        raise SystemExit('voxel_size deve ficar entre 0,006 e 0,04 m.')
    if not (0.01 <= max_transfer_distance <= 0.12):
        raise SystemExit('max_transfer_distance deve ficar entre 0,01 e 0,12 m.')
    for path in (reference, target):
        if not os.path.isfile(path) or not path.lower().endswith('.glb'):
            raise SystemExit(f'GLB ausente/inválido: {path}')
    if not output.lower().endswith('.glb') or os.path.exists(output):
        raise SystemExit(f'A saída deve ser um novo GLB ainda inexistente: {output}')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=reference)
    arm = next((obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE'), None)
    ref_mesh = max((obj for obj in bpy.context.scene.objects if obj.type == 'MESH'),
                   key=lambda obj: len(obj.data.vertices), default=None)
    if arm is None or ref_mesh is None or len(arm.data.bones) != 65:
        raise SystemExit('Referência inválida: esperado 1 rig Mixamo de 65 ossos e uma malha.')
    action_names = [action.name for action in bpy.data.actions]
    print(f'[source] actions={action_names}', flush=True)
    if include_animations and not {'Walk', 'Idle'}.issubset(set(action_names)):
        raise SystemExit(f'Esperados clips Walk/Idle na referência; recebidos {action_names}.')
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()

    existing = {obj.name for obj in bpy.context.scene.objects}
    bpy.ops.import_scene.gltf(filepath=target)
    candidates = [obj for obj in bpy.context.scene.objects
                  if obj.type == 'MESH' and obj.name not in existing]
    mesh = max(candidates, key=lambda obj: len(obj.data.vertices), default=None)
    if mesh is None:
        raise SystemExit('A malha alvo não foi importada.')

    # Match the historical v53 GLB→Blender frame before measuring or weighting.
    mesh.matrix_world = ALIGN @ mesh.matrix_world
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    # Produce a closed, low-complexity surface derived from this exact character.
    proxy = mesh.copy()
    proxy.data = mesh.data.copy()
    proxy.name = 'AnaVoxelWeightProxy'
    bpy.context.collection.objects.link(proxy)
    proxy.matrix_world = mesh.matrix_world.copy()
    proxy.data.remesh_mode = 'VOXEL'
    proxy.data.remesh_voxel_size = voxel_size
    proxy.data.remesh_voxel_adaptivity = 0.0
    proxy.data.use_remesh_fix_poles = True
    bpy.ops.object.select_all(action='DESELECT')
    proxy.select_set(True)
    bpy.context.view_layer.objects.active = proxy
    bpy.ops.object.voxel_remesh()
    bpy.context.view_layer.update()
    if len(proxy.data.vertices) < 500 or len(proxy.data.vertices) > 150_000:
        raise SystemExit(f'Proxy voxel fora do limite seguro: {len(proxy.data.vertices)} vértices.')
    print(f'[voxel] source={len(mesh.data.vertices)} proxy={len(proxy.data.vertices)} '
          f'voxel={voxel_size:.4f}m', flush=True)

    # Bone-heat solve runs only on the proxy, not on the dense clothing mesh.
    bpy.ops.object.select_all(action='DESELECT')
    proxy.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        result = bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError as error:
        raise SystemExit(f'Bone-heat falhou até no proxy: {error}')
    if 'FINISHED' not in result:
        raise SystemExit(f'Bone-heat não concluiu no proxy: {result}')
    for bone in arm.data.bones:
        if proxy.vertex_groups.get(bone.name) is None:
            proxy.vertex_groups.new(name=bone.name)
    bpy.context.view_layer.objects.active = proxy
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

    # Refuse incomplete auto-weights before touching even the in-memory target.
    proxy_weight_sums = []
    for vertex in proxy.data.vertices:
        total = sum(entry.weight for entry in vertex.groups)
        if not math.isfinite(total) or abs(total - 1.0) > 1e-3:
            raise SystemExit(f'Proxy sem pesos normalizados no vértice {vertex.index}: {total}.')
        proxy_weight_sums.append(total)
    print(f'[weights] proxy normalized {len(proxy_weight_sums)}/{len(proxy.data.vertices)}', flush=True)

    tree = kdtree.KDTree(len(proxy.data.vertices))
    for index, vertex in enumerate(proxy.data.vertices):
        tree.insert(proxy.matrix_world @ vertex.co, index)
    tree.balance()

    mesh.vertex_groups.clear()
    target_groups = {bone.name: mesh.vertex_groups.new(name=bone.name) for bone in arm.data.bones}
    group_names = [group.name for group in proxy.vertex_groups]
    transfer_distances = []
    for vertex in mesh.data.vertices:
        world_point = mesh.matrix_world @ vertex.co
        _, proxy_index, distance = tree.find(world_point)
        transfer_distances.append(distance)
        if distance > max_transfer_distance:
            raise SystemExit(
                f'Transfer proxy→malha excede limite no vértice {vertex.index}: '
                f'{distance:.4f}m > {max_transfer_distance:.4f}m.'
            )
        source_vertex = proxy.data.vertices[proxy_index]
        weights = [(group_names[entry.group], entry.weight)
                   for entry in source_vertex.groups if entry.weight > 1e-6]
        total = sum(weight for _, weight in weights)
        if not total:
            raise SystemExit(f'Proxy sem influências no vértice {proxy_index}.')
        for name, weight in weights:
            target_groups[name].add([vertex.index], weight / total, 'REPLACE')
    ordered = sorted(transfer_distances)
    p95 = ordered[min(len(ordered) - 1, int(0.95 * (len(ordered) - 1)))]
    p99 = ordered[min(len(ordered) - 1, int(0.99 * (len(ordered) - 1)))]
    print(f'[transfer] targetVertices={len(mesh.data.vertices)} distance p95={p95:.4f}m '
          f'p99={p99:.4f}m max={ordered[-1]:.4f}m', flush=True)

    # Keep only target mesh and reference armature; no source/proxy geometry leaks.
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj != mesh:
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.type == 'ARMATURE' and obj != arm:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_NAME')

    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    export_options = {
        'filepath': output,
        'export_format': 'GLB',
        'export_animations': include_animations,
        'export_skins': True,
        'export_apply': False,
        'export_yup': True,
    }
    export_properties = bpy.ops.export_scene.gltf.get_rna_type().properties
    if include_animations and 'export_animation_mode' in export_properties:
        export_options['export_animation_mode'] = 'ACTIONS'
    if include_animations and 'export_force_sampling' in export_properties:
        export_options['export_force_sampling'] = True
    if include_animations and 'export_frame_range' in export_properties:
        export_options['export_frame_range'] = True
    if 'export_nla_strips' in export_properties:
        export_options['export_nla_strips'] = False
    bpy.ops.export_scene.gltf(**export_options)
    if not os.path.isfile(output) or os.path.getsize(output) < 1024:
        raise SystemExit('Export skinned do proxy falhou.')
    print(f'[export] animations={include_animations} output={output} bytes={os.path.getsize(output)}', flush=True)


main()
