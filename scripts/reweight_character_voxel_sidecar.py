#!/usr/bin/env python3
"""Compute auto-weights on a voxel proxy of the exact GLB mesh, without export.

Usage:
  blender -b --python scripts/reweight_character_voxel_sidecar.py -- \
    candidate.glb output.weights [voxel_size=0.012] [max_distance=0.06] [preserve_original_foot_world_y|lower-leg]

The sidecar is keyed by the exact input GLB SHA and vertex index. Applying it
requires scripts/apply_gltf_weight_sidecar.mjs, which preserves the GLB rig,
inverse-bind matrices, hierarchy, geometry, and animations.
"""
import hashlib
import json
import math
import os
import struct
import sys

import bpy
from mathutils import kdtree


MAGIC = b'FARMAW1\0'
RECORD = struct.Struct('<4H4f')


def args_after_double_dash():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def apply_world_transform(obj, matrix):
    obj.parent = None
    obj.matrix_world = matrix.copy()
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()


def main():
    argv = args_after_double_dash()
    if len(argv) not in (2, 3, 4, 5):
        raise SystemExit(
            'Uso: reweight_character_voxel_sidecar.py -- candidate.glb output.weights '
            '[voxel_size=0.012] [max_distance=0.06] [preserve_original_foot_world_y|lower-leg]'
        )
    source, output = map(os.path.abspath, argv[:2])
    voxel_size = float(argv[2]) if len(argv) >= 3 else 0.012
    max_distance = float(argv[3]) if len(argv) >= 4 else 0.06
    preserve_region = argv[4] if len(argv) >= 5 else None
    preserve_foot_world_y = None
    preserve_original_lower_leg = preserve_region == 'lower-leg'
    if preserve_region is not None and not preserve_original_lower_leg:
        preserve_foot_world_y = float(preserve_region)
    if not os.path.isfile(source) or not source.lower().endswith('.glb'):
        raise SystemExit(f'GLB ausente/inválido: {source}')
    if os.path.exists(output):
        raise SystemExit(f'O sidecar já existe; escolha outro caminho: {output}')
    if not (0.006 <= voxel_size <= 0.04):
        raise SystemExit('voxel_size deve ficar entre 0,006 e 0,04 m.')
    if not (0.01 <= max_distance <= 0.12):
        raise SystemExit('max_distance deve ficar entre 0,01 e 0,12 m.')

    with open(source, 'rb') as stream:
        source_bytes = stream.read()
    if source_bytes[:4] != b'glTF':
        raise SystemExit('O arquivo de entrada não tem cabeçalho GLB.')
    source_sha = hashlib.sha256(source_bytes).hexdigest()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    arms = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    skinned = [
        obj for obj in bpy.context.scene.objects
        if obj.type == 'MESH' and any(mod.type == 'ARMATURE' for mod in obj.modifiers)
    ]
    if len(arms) != 1 or len(skinned) != 1:
        raise SystemExit(f'Esperado 1 rig e 1 mesh skinned; rigs={len(arms)} meshes={len(skinned)}.')
    arm, mesh = arms[0], skinned[0]
    if len(arm.data.bones) != 65:
        raise SystemExit(f'Esperados 65 joints no rig; encontrados {len(arm.data.bones)}.')
    if not mesh.data.vertices:
        raise SystemExit('Mesh sem vértices.')

    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    arm_world = arm.matrix_world.copy()
    mesh_world = mesh.matrix_world.copy()
    vertex_count = len(mesh.data.vertices)
    old_group_names = {group.index: group.name for group in mesh.vertex_groups}
    original_weights = [
        [(old_group_names[entry.group], entry.weight) for entry in vertex.groups
         if entry.weight > 1e-8 and entry.group in old_group_names]
        for vertex in mesh.data.vertices
    ]

    # Work on unparented copies with transforms baked into both mesh and rig.
    rig = arm.copy()
    rig.data = arm.data.copy()
    bpy.context.collection.objects.link(rig)
    rig.animation_data_clear()
    rig.data.pose_position = 'REST'
    apply_world_transform(rig, arm_world)

    target = mesh.copy()
    target.data = mesh.data.copy()
    bpy.context.collection.objects.link(target)
    apply_world_transform(target, mesh_world)
    for modifier in list(target.modifiers):
        target.modifiers.remove(modifier)
    target.vertex_groups.clear()

    proxy = target.copy()
    proxy.data = target.data.copy()
    bpy.context.collection.objects.link(proxy)
    proxy.name = 'VoxelAutoWeightProxy'
    proxy.data.name = 'VoxelAutoWeightProxyMesh'
    proxy.vertex_groups.clear()
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
    print(f'[voxel] target={vertex_count} proxy={len(proxy.data.vertices)} size={voxel_size:.4f}m', flush=True)

    bpy.ops.object.select_all(action='DESELECT')
    proxy.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    if 'FINISHED' not in result:
        raise SystemExit(f'ARMATURE_AUTO não concluiu: {result}')
    for bone in rig.data.bones:
        if proxy.vertex_groups.get(bone.name) is None:
            proxy.vertex_groups.new(name=bone.name)
    bpy.context.view_layer.objects.active = proxy
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

    for vertex in proxy.data.vertices:
        total = sum(entry.weight for entry in vertex.groups)
        if not math.isfinite(total) or abs(total - 1.0) > 1e-3:
            raise SystemExit(f'Peso proxy inválido no vértice {vertex.index}: {total}.')

    tree = kdtree.KDTree(len(proxy.data.vertices))
    for index, vertex in enumerate(proxy.data.vertices):
        tree.insert(proxy.matrix_world @ vertex.co, index)
    tree.balance()

    target.vertex_groups.clear()
    for bone in rig.data.bones:
        target.vertex_groups.new(name=bone.name)
    transfer_distances = []
    for vertex in target.data.vertices:
        _, proxy_index, distance = tree.find(target.matrix_world @ vertex.co)
        if not math.isfinite(distance) or distance > max_distance:
            raise SystemExit(
                f'Transfer proxy→mesh excede limite no vértice {vertex.index}: '
                f'{distance:.4f}m > {max_distance:.4f}m.'
            )
        transfer_distances.append(distance)
        proxy_vertex = proxy.data.vertices[proxy_index]
        entries = [
            (proxy.vertex_groups[entry.group].name, entry.weight)
            for entry in proxy_vertex.groups if entry.weight > 1e-8
        ]
        total = sum(weight for _, weight in entries)
        if not total:
            raise SystemExit(f'Proxy sem pesos no vértice {proxy_index}.')
        for name, weight in entries:
            group = target.vertex_groups.get(name)
            if group is None:
                raise SystemExit(f'Grupo do proxy não pertence ao rig: {name}')
            group.add([vertex.index], weight / total, 'REPLACE')

    joint_names = [bone.name for bone in rig.data.bones]
    joint_index = {name: index for index, name in enumerate(joint_names)}
    lower_leg_bones = {
        name for name in joint_names
        if name.endswith(('LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'))
    }
    records = bytearray()
    preserved_foot_vertices = 0
    preserved_lower_leg_vertices = 0
    for vertex in target.data.vertices:
        preserve_original = preserve_foot_world_y is not None and vertex.co.y >= preserve_foot_world_y
        if preserve_original_lower_leg:
            dominant = max(original_weights[vertex.index], key=lambda item: item[1], default=('', 0.0))
            if dominant[0] in lower_leg_bones and dominant[1] >= 0.35:
                preserve_original = True
                preserved_lower_leg_vertices += 1
        if preserve_original:
            influences = []
            for name, weight in original_weights[vertex.index]:
                index = joint_index.get(name)
                if index is None:
                    raise SystemExit(f'Peso original de pé fora do rig no vértice {vertex.index}: {name}')
                influences.append((index, weight))
            preserved_foot_vertices += 1
        else:
            influences = []
            for entry in vertex.groups:
                name = target.vertex_groups[entry.group].name
                index = joint_index.get(name)
                if index is None:
                    raise SystemExit(f'Influência fora do rig no vértice {vertex.index}: {name}')
                if entry.weight > 1e-8:
                    influences.append((index, entry.weight))
        influences.sort(key=lambda item: item[1], reverse=True)
        influences = influences[:4]
        total = sum(weight for _, weight in influences)
        if not total:
            raise SystemExit(f'Vértice sem pesos finais: {vertex.index}')
        joints = [index for index, _ in influences]
        weights = [weight / total for _, weight in influences]
        joints.extend([0] * (4 - len(joints)))
        weights.extend([0.0] * (4 - len(weights)))
        if abs(sum(weights) - 1.0) > 1e-5:
            raise SystemExit(f'Pesos finais não normalizados no vértice {vertex.index}.')
        records.extend(RECORD.pack(*joints, *weights))

    ordered = sorted(transfer_distances)
    quantile = lambda p: ordered[min(len(ordered) - 1, int(p * (len(ordered) - 1)))]
    header = {
        'format': 'farmacheck-weight-sidecar-v1',
        'sourceSha256': source_sha,
        'vertexCount': vertex_count,
        'jointNames': joint_names,
        'voxelSizeMeters': voxel_size,
        'transferDistanceMeters': {
            'p50': quantile(0.50), 'p95': quantile(0.95),
            'p99': quantile(0.99), 'max': ordered[-1],
        },
        'regionalOverride': ({
            'strategy': 'preserve-input-weights-by-foot-height',
            'worldYAtOrAbove': preserve_foot_world_y,
            'vertices': preserved_foot_vertices,
        } if preserve_foot_world_y is not None else ({
            'strategy': 'preserve-input-weights-by-dominant-lower-leg-bone',
            'dominantWeightAtLeast': 0.35,
            'bones': sorted(lower_leg_bones),
            'vertices': preserved_lower_leg_vertices,
        } if preserve_original_lower_leg else None)),
        'recordBytes': RECORD.size,
    }
    header_bytes = json.dumps(header, separators=(',', ':')).encode('utf-8')
    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    with open(output, 'xb') as stream:
        stream.write(MAGIC)
        stream.write(struct.pack('<I', len(header_bytes)))
        stream.write(header_bytes)
        stream.write(records)
    print(f'[weights] vertices={vertex_count} joints={len(joint_names)} maxInfluences=4', flush=True)
    if preserve_foot_world_y is not None:
        print(f'[weights] preserved original foot-region weights: {preserved_foot_vertices} vertices with worldY>={preserve_foot_world_y}', flush=True)
    if preserve_original_lower_leg:
        print(f'[weights] preserved original lower-leg/foot bone weights: {preserved_lower_leg_vertices} vertices', flush=True)
    print('[transfer] distances=' + json.dumps(header['transferDistanceMeters']), flush=True)
    print(f'[sidecar] output={output} bytes={os.path.getsize(output)} sourceSha256={source_sha}', flush=True)


main()
