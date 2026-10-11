#!/usr/bin/env python3
"""Read-only inventory of local character FBX rigs, weights, meshes, and clips.

Usage: blender -b --python scripts/audit_character_fbx.py -- candidate1.fbx [candidate2.fbx ...]
"""
import os
import sys

import bpy


def action_curves(action):
    try:
        return list(action.fcurves)
    except AttributeError:
        curves = []
        for layer in getattr(action, 'layers', []):
            for strip in getattr(layer, 'strips', []):
                for bag in getattr(strip, 'channelbags', []):
                    curves.extend(list(bag.fcurves))
        return curves


def sample_action_pose(arm, meshes, action):
    arm.animation_data_create()
    arm.animation_data.action = action
    start, end = action.frame_range
    frames = sorted({int(round(start)), int(round(start + (end - start) * 0.25)),
                     int(round(start + (end - start) * 0.5)), int(round(end))})
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        bounds = []
        for mesh in meshes:
            evaluated = mesh.evaluated_get(depsgraph)
            data = evaluated.to_mesh()
            for vertex in data.vertices:
                bounds.append(evaluated.matrix_world @ vertex.co)
            evaluated.to_mesh_clear()
        if bounds:
            minimum = tuple(min(point[axis] for point in bounds) for axis in range(3))
            maximum = tuple(max(point[axis] for point in bounds) for axis in range(3))
            size = tuple(maximum[axis] - minimum[axis] for axis in range(3))
        else:
            minimum = maximum = size = (0.0, 0.0, 0.0)
        hips = arm.pose.bones.get('mixamorig:Hips') or arm.pose.bones.get('mixamorigHips')
        hips_head = tuple((arm.matrix_world @ hips.head)) if hips else None
        hips_rotation = tuple(round(value, 4) for value in hips.matrix.to_quaternion()) if hips else None
        arm_rotation = tuple(round(value, 4) for value in arm.matrix_world.to_quaternion())
        print(
            f'  pose frame={frame}: bboxSize={tuple(round(v, 3) for v in size)} '
            f'hipsHead={tuple(round(v, 3) for v in hips_head) if hips_head else None} '
            f'hipsWorldQuat={hips_rotation} armatureQuat={arm_rotation}',
            flush=True,
        )


def audit(path):
    path = os.path.abspath(path)
    if not os.path.isfile(path) or not path.lower().endswith('.fbx'):
        print(f'[skip] ausente/inválido: {path}', flush=True)
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.fbx(filepath=path)
    except Exception as error:
        print(f'[FAIL] import {path}: {error}', flush=True)
        return

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    actions = list(bpy.data.actions)
    print(f'\n=== {path} ({os.path.getsize(path)} bytes) ===', flush=True)
    print(f'armatures={len(armatures)} meshes={len(meshes)} actions={len(actions)}', flush=True)
    for arm in armatures:
        names = {bone.name for bone in arm.data.bones}
        print(
            f'  rig {arm.name}: bones={len(names)} keyBones={all(name in names for name in ("mixamorig:Hips", "mixamorig:LeftArm", "mixamorig:LeftUpLeg"))}',
            flush=True,
        )
    for mesh in meshes:
        group_names = {group.name for group in mesh.vertex_groups}
        covered = 0
        sums = []
        max_inf = 0
        weighted_group_ids = set()
        for vertex in mesh.data.vertices:
            entries = [entry for entry in vertex.groups if entry.weight > 1e-6]
            if entries:
                covered += 1
                sums.append(sum(entry.weight for entry in entries))
                max_inf = max(max_inf, len(entries))
                weighted_group_ids.update(entry.group for entry in entries)
        modifiers = [modifier.object.name for modifier in mesh.modifiers if modifier.type == 'ARMATURE' and modifier.object]
        if sums:
            min_sum, max_sum = min(sums), max(sums)
        else:
            min_sum = max_sum = 0.0
        print(
            f'  mesh {mesh.name}: verts={len(mesh.data.vertices)} polys={len(mesh.data.polygons)} '
            f'groups={len(group_names)} covered={covered}/{len(mesh.data.vertices)} '
            f'weightedGroups={len(weighted_group_ids)} influences<={max_inf} '
            f'weightSums=[{min_sum:.4f},{max_sum:.4f}] armatureModifiers={modifiers}',
            flush=True,
        )
    for action in actions:
        curves = action_curves(action)
        live = 0
        for curve in curves:
            if 'rotation' not in curve.data_path:
                continue
            values = [point.co.y for point in curve.keyframe_points]
            if values and max(values) - min(values) > 1e-5:
                live += 1
        print(
            f'  action {action.name}: curves={len(curves)} liveRotationCurves={live} '
            f'frames={tuple(round(value, 2) for value in action.frame_range)}',
            flush=True,
        )
    if armatures and meshes and actions:
        sample_action_pose(armatures[0], meshes, actions[0])


files = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not files:
    raise SystemExit('Passe um ou mais FBX depois de --')
for file_path in files:
    audit(file_path)
