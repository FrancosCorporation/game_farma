#!/usr/bin/env python3
"""Rebind a static character mesh by interpolating weights over the nearest source face.

This intentionally changes vertex weights only; it does not repair or replace
the target geometry, animations, or approved production assets.

Usage:
  blender -b --python scripts/rebind_character_polyinterp.py -- \
    reference_rigged.glb target_raw.glb output_skinned.glb [POLYINTERP_NEAREST|ARMATURE_AUTO]

The target is aligned with the Mixamo reference frame used by the historical
Ana v53 build. Export is skin-only; transplant clips separately after checking
the rest pose.
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
LANDMARK_BONES = (
    'mixamorig:Head', 'mixamorig:Hips', 'mixamorig:Spine2',
    'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
    'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot',
    'mixamorig:LeftToeBase',
)


def args_after_double_dash():
    if '--' not in sys.argv:
        return []
    return sys.argv[sys.argv.index('--') + 1:]


def world_box(obj):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return Vector(tuple(min(p[i] for p in points) for i in range(3))), Vector(
        tuple(max(p[i] for p in points) for i in range(3))
    )


def distance_to_segment(point, start, end):
    axis = end - start
    length_squared = axis.length_squared
    amount = 0.0 if length_squared < 1e-12 else max(
        0.0, min(1.0, (point - start).dot(axis) / length_squared)
    )
    return (point - (start + axis * amount)).length


def main():
    argv = args_after_double_dash()
    if len(argv) not in (3, 4):
        raise SystemExit(
            'Uso: blender -b --python scripts/rebind_character_polyinterp.py -- '
            'reference_rigged.glb target_raw.glb output_skinned.glb '
            '[POLYINTERP_NEAREST|ARMATURE_AUTO]'
        )
    reference, target, output = map(os.path.abspath, argv[:3])
    method = argv[3].upper() if len(argv) == 4 else 'POLYINTERP_NEAREST'
    if method not in {'POLYINTERP_NEAREST', 'ARMATURE_AUTO'}:
        raise SystemExit(f'Método de pesos desconhecido: {method}')
    for path in (reference, target):
        if not os.path.isfile(path) or not path.lower().endswith('.glb'):
            raise SystemExit(f'Entrada GLB ausente/inválida: {path}')
    if not output.lower().endswith('.glb') or os.path.exists(output):
        raise SystemExit(f'A saída deve ser um novo GLB ainda inexistente: {output}')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=reference)
    arm = next((obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE'), None)
    reference_mesh = max(
        (obj for obj in bpy.context.scene.objects if obj.type == 'MESH'),
        key=lambda obj: len(obj.data.vertices), default=None,
    )
    if arm is None or reference_mesh is None:
        raise SystemExit('Referência precisa conter um rig e uma malha ponderada.')
    if len(arm.data.bones) != 65:
        raise SystemExit(f'Rig de referência inesperado: {len(arm.data.bones)} ossos (esperado 65).')
    if len(reference_mesh.vertex_groups) < 60:
        raise SystemExit(f'Referência sem grupos de peso suficientes: {len(reference_mesh.vertex_groups)}.')
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()

    before = {obj.name for obj in bpy.context.scene.objects}
    bpy.ops.import_scene.gltf(filepath=target)
    candidates = [
        obj for obj in bpy.context.scene.objects
        if obj.type == 'MESH' and obj.name not in before
    ]
    if not candidates:
        raise SystemExit('A malha alvo não foi importada.')
    mesh = max(candidates, key=lambda obj: len(obj.data.vertices))
    print(
        f'ref={reference_mesh.name} ({len(reference_mesh.data.vertices)} verts, '
        f'{len(reference_mesh.vertex_groups)} grupos) | '
        f'alvo={mesh.name} ({len(mesh.data.vertices)} verts)', flush=True,
    )

    # Match the stable reference coordinate frame used for v53. Never modify
    # the source file; the transform is applied only to this freshly imported copy.
    mesh.matrix_world = ALIGN @ mesh.matrix_world
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    minimum, maximum = world_box(mesh)
    print(
        f'bound alvo alinhado: min={tuple(round(v, 4) for v in minimum)} '
        f'max={tuple(round(v, 4) for v in maximum)}', flush=True,
    )

    # Refuse a transfer if the armature landmarks do not fit the target body.
    tree = kdtree.KDTree(len(mesh.data.vertices))
    for index, vertex in enumerate(mesh.data.vertices):
        tree.insert(mesh.matrix_world @ vertex.co, index)
    tree.balance()
    worst = 0.0
    for name in LANDMARK_BONES:
        bone = arm.data.bones.get(name)
        if bone is None:
            raise SystemExit(f'Falta landmark no rig: {name}')
        _, _, distance = tree.find(arm.matrix_world @ bone.head_local)
        worst = max(worst, distance)
        print(f'fit {name.split(":")[-1]:12s}: {distance * 100:.2f} cm', flush=True)
    if worst > 0.16:
        raise SystemExit(f'Rig não se ajusta à malha: {worst:.3f} m (limite 0,16 m).')

    # Surface interpolation is one test against v53's NEAREST-vertex mapping.
    # ARMATURE_AUTO is the independent fallback: solve weights on the target
    # geometry itself instead of transferring labels across meshes.
    mesh.vertex_groups.clear()
    if method == 'POLYINTERP_NEAREST':
        transfer = mesh.modifiers.new(name='WeightSurfaceTransfer', type='DATA_TRANSFER')
        transfer.object = reference_mesh
        transfer.vert_mapping = 'POLYINTERP_NEAREST'
        transfer.mix_mode = 'REPLACE'
        transfer.data_types_verts = {'VGROUP_WEIGHTS'}
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.datalayout_transfer(modifier=transfer.name)
        bpy.ops.object.modifier_apply(modifier=transfer.name)
    else:
        bpy.ops.object.select_all(action='DESELECT')
        mesh.select_set(True)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        try:
            result = bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        except RuntimeError as error:
            raise SystemExit(f'Blender não conseguiu calcular automatic weights: {error}')
        if 'FINISHED' not in result:
            raise SystemExit(f'Blender cancelou o cálculo de automatic weights: {result}')
        for bone in arm.data.bones:
            if mesh.vertex_groups.get(bone.name) is None:
                mesh.vertex_groups.new(name=bone.name)
        print('[weights] Blender ARMATURE_AUTO aplicado na malha alvo', flush=True)

    # Missing assignments are not silently patched with arbitrary bones. An
    # uncovered vertex is a transfer failure that must be reviewed explicitly.
    empty_vertices = [vertex.index for vertex in mesh.data.vertices if not vertex.groups]
    if empty_vertices:
        raise SystemExit(
            f'Transfer deixou {len(empty_vertices)} vértices sem peso; '
            'candidato não exportado.'
        )
    if len(mesh.vertex_groups) != len(arm.data.bones):
        raise SystemExit(
            f'Grupos de peso={len(mesh.vertex_groups)}, ossos={len(arm.data.bones)}; '
            'hierarquia incompatível.'
        )

    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.context.view_layer.update()

    totals = []
    max_influences = 0
    for vertex in mesh.data.vertices:
        weights = [entry.weight for entry in vertex.groups]
        max_influences = max(max_influences, len(weights))
        total = sum(weights)
        if not math.isfinite(total) or abs(total - 1.0) > 1e-3:
            raise SystemExit(f'Pesos inválidos no vértice {vertex.index}: soma={total}.')
        totals.append(total)
    print(
        f'weights OK: {len(mesh.data.vertices)} verts; '
        f'método={method}; grupos={len(mesh.vertex_groups)}; influences<= {max_influences}; '
        f'somas=[{min(totals):.6f},{max(totals):.6f}]', flush=True,
    )

    # Drop the reference mesh and the target GLB's imported companion objects,
    # retaining the target geometry and the reference skeleton only.
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj != mesh:
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.type == 'ARMATURE' and obj != arm:
            bpy.data.objects.remove(obj, do_unlink=True)
    if method != 'ARMATURE_AUTO':
        bpy.ops.object.select_all(action='DESELECT')
        mesh.select_set(True)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type='ARMATURE_NAME')

    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output, export_format='GLB', export_animations=False,
        export_skins=True, export_apply=False, export_yup=True,
    )
    if not os.path.isfile(output) or os.path.getsize(output) < 1024:
        raise SystemExit('Export do candidato skinned falhou.')
    print(f'EXPORTADO: {output} ({os.path.getsize(output)} bytes)', flush=True)


main()
