#!/usr/bin/env python3
"""Audit spatial correspondence before transferring Mixamo weights.

Usage:
  blender -b --python scripts/audit_character_weight_map.py -- reference_rigged.glb target_raw.glb

The target is aligned with the historical v53 transfer frame, then each target
vertex is compared with its nearest reference vertex. This is diagnostic only:
it does not create or modify any asset.
"""
import os
import sys

import bpy
from mathutils import kdtree, Matrix, Vector


ALIGN = (
    Matrix.Translation(Vector((0.0, 1.0, 0.0)))
    @ Matrix.Rotation(3.141592653589793 / 2, 4, 'X')
    @ Matrix.Scale(1.0 / 0.575, 4)
)


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return tuple(min(point[axis] for point in points) for axis in range(3)), tuple(
        max(point[axis] for point in points) for axis in range(3)
    )


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) != 2:
        raise SystemExit('Passe a referência rigged e a malha crua depois de --.')
    reference, target = map(os.path.abspath, argv)
    for path in (reference, target):
        if not os.path.isfile(path) or not path.lower().endswith('.glb'):
            raise SystemExit(f'GLB ausente/inválido: {path}')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=reference)
    reference_mesh = max((obj for obj in bpy.context.scene.objects if obj.type == 'MESH'),
                         key=lambda obj: len(obj.data.vertices), default=None)
    reference_arm = next((obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE'), None)
    if reference_mesh is None or reference_arm is None:
        raise SystemExit('A referência precisa conter malha e armature.')
    reference_arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()

    existing = {obj.name for obj in bpy.context.scene.objects}
    bpy.ops.import_scene.gltf(filepath=target)
    targets = [obj for obj in bpy.context.scene.objects
               if obj.type == 'MESH' and obj.name not in existing]
    target_mesh = max(targets, key=lambda obj: len(obj.data.vertices), default=None)
    if target_mesh is None:
        raise SystemExit('A malha alvo não foi importada.')

    target_mesh.matrix_world = ALIGN @ target_mesh.matrix_world
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    target_mesh.select_set(True)
    bpy.context.view_layer.objects.active = target_mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    tree = kdtree.KDTree(len(reference_mesh.data.vertices))
    for index, vertex in enumerate(reference_mesh.data.vertices):
        tree.insert(reference_mesh.matrix_world @ vertex.co, index)
    tree.balance()

    distances = []
    nearest_info = []
    for vertex in target_mesh.data.vertices:
        point = target_mesh.matrix_world @ vertex.co
        nearest, source_index, distance = tree.find(point)
        distances.append(distance)
        nearest_info.append((distance, vertex.index, tuple(point), source_index, tuple(nearest)))

    ordered = sorted(distances)
    quantile = lambda p: ordered[min(len(ordered) - 1, int(p * (len(ordered) - 1)))]
    print(f'reference={reference_mesh.name} verts={len(reference_mesh.data.vertices)} '
          f'groups={len(reference_mesh.vertex_groups)}')
    print(f'target={target_mesh.name} verts={len(target_mesh.data.vertices)}')
    print(f'refBounds={bounds(reference_mesh)} targetAlignedBounds={bounds(target_mesh)}')
    print('nearestDistanceMeters=' + str({
        'min': round(ordered[0], 5), 'p50': round(quantile(.50), 5),
        'p90': round(quantile(.90), 5), 'p95': round(quantile(.95), 5),
        'p99': round(quantile(.99), 5), 'p999': round(quantile(.999), 5),
        'max': round(ordered[-1], 5),
        'over_2cm': sum(distance > .02 for distance in distances),
        'over_5cm': sum(distance > .05 for distance in distances),
        'over_10cm': sum(distance > .10 for distance in distances),
    }))
    print('farthestTargetVertices:')
    for distance, index, point, source_index, source_point in sorted(nearest_info, reverse=True)[:30]:
        print(f'  target={index} d={distance:.4f} targetXYZ={tuple(round(v, 4) for v in point)} '
              f'source={source_index} sourceXYZ={tuple(round(v, 4) for v in source_point)}')


main()
