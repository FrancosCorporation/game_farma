#!/usr/bin/env python3
"""Read-only report of GLB skin weights and their spatial relation to bones.

Usage:
  blender -b --python scripts/audit_gltf_anatomical_weights.py -- candidate.glb

Reports per-joint weight mass, useful influence counts, weighted centroid and
distance of influenced vertices to the joint's rest-pose bone segment. It does
not modify or export the asset. Values are diagnostic, not universal targets.
"""
import json
import os
import struct
import sys

import bpy
from mathutils import Vector


def quantile(sorted_values, fraction):
    if not sorted_values:
        return None
    index = min(len(sorted_values) - 1, int(fraction * (len(sorted_values) - 1)))
    return sorted_values[index]


def point_segment_distance(point, start, end):
    direction = end - start
    length_squared = direction.length_squared
    if length_squared <= 1e-14:
        return (point - start).length
    factor = max(0.0, min(1.0, (point - start).dot(direction) / length_squared))
    return (point - (start + factor * direction)).length


CORE_JOINT_NAMES = {
    'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
    'mixamorig:Neck', 'mixamorig:Head',
    'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
    'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
    'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:LeftToeBase',
    'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot', 'mixamorig:RightToeBase',
}


def matrix_rows(matrix):
    return [[round(value, 6) for value in row] for row in matrix]


def bone_segment_end(bone, bone_by_name):
    preferred_children = {
        'mixamorig:Hips': 'mixamorig:Spine',
        'mixamorig:Spine': 'mixamorig:Spine1',
        'mixamorig:Spine1': 'mixamorig:Spine2',
        'mixamorig:Spine2': 'mixamorig:Neck',
        'mixamorig:LeftShoulder': 'mixamorig:LeftArm',
        'mixamorig:LeftArm': 'mixamorig:LeftForeArm',
        'mixamorig:LeftForeArm': 'mixamorig:LeftHand',
        'mixamorig:LeftHand': 'mixamorig:LeftHandIndex1',
        'mixamorig:RightShoulder': 'mixamorig:RightArm',
        'mixamorig:RightArm': 'mixamorig:RightForeArm',
        'mixamorig:RightForeArm': 'mixamorig:RightHand',
        'mixamorig:RightHand': 'mixamorig:RightHandIndex1',
        'mixamorig:LeftUpLeg': 'mixamorig:LeftLeg',
        'mixamorig:LeftLeg': 'mixamorig:LeftFoot',
        'mixamorig:LeftFoot': 'mixamorig:LeftToeBase',
        'mixamorig:RightUpLeg': 'mixamorig:RightLeg',
        'mixamorig:RightLeg': 'mixamorig:RightFoot',
        'mixamorig:RightFoot': 'mixamorig:RightToeBase',
    }
    child_name = preferred_children.get(bone.name)
    child = bone_by_name.get(child_name) if child_name else None
    if child is None and len(bone.children) == 1:
        child = bone.children[0]
    if child is not None:
        return child.head_local.copy(), child.name
    return bone.tail_local.copy(), 'tail_local_fallback'


def audit_mesh(mesh, armature, all_joints=False):
    group_names = {group.index: group.name for group in mesh.vertex_groups}
    bones = armature.data.bones
    bone_by_name = {bone.name: bone for bone in bones}
    positions = [mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices]
    per_group = {
        name: {'mass': 0.0, 'max': 0.0, 'counts': {'ge0_01': 0, 'ge0_05': 0,
                                                     'ge0_10': 0, 'ge0_25': 0,
                                                     'ge0_50': 0},
               'centroidNumerator': Vector((0.0, 0.0, 0.0)),
               'boundsAt0_10': {'min': [float('inf')] * 3,
                                'max': [float('-inf')] * 3},
               'segmentDistancesAt0_05': []}
        for name in group_names.values()
    }
    sum_errors = []
    zero_vertices = 0
    influence_counts = []

    for vertex, point in zip(mesh.data.vertices, positions):
        total = 0.0
        count = 0
        for entry in vertex.groups:
            name = group_names.get(entry.group)
            if name is None or entry.weight <= 1e-8:
                continue
            weight = float(entry.weight)
            total += weight
            count += 1
            stats = per_group[name]
            stats['mass'] += weight
            stats['max'] = max(stats['max'], weight)
            stats['centroidNumerator'] += point * weight
            for threshold, key in ((0.01, 'ge0_01'), (0.05, 'ge0_05'),
                                   (0.10, 'ge0_10'), (0.25, 'ge0_25'),
                                   (0.50, 'ge0_50')):
                if weight >= threshold:
                    stats['counts'][key] += 1
            if weight >= 0.10:
                for axis in range(3):
                    stats['boundsAt0_10']['min'][axis] = min(
                        stats['boundsAt0_10']['min'][axis], point[axis])
                    stats['boundsAt0_10']['max'][axis] = max(
                        stats['boundsAt0_10']['max'][axis], point[axis])
            bone = bone_by_name.get(name)
            if bone and weight >= 0.05:
                start = armature.matrix_world @ bone.head_local
                end_local, _ = bone_segment_end(bone, bone_by_name)
                end = armature.matrix_world @ end_local
                stats['segmentDistancesAt0_05'].append(
                    point_segment_distance(point, start, end))
        if total <= 1e-8:
            zero_vertices += 1
        else:
            sum_errors.append(abs(total - 1.0))
        influence_counts.append(count)

    joint_stats = []
    for name in sorted(group_names.values()):
        stats = per_group[name]
        mass = stats['mass']
        bone = bone_by_name.get(name)
        head = (armature.matrix_world @ bone.head_local) if bone else None
        segment_end_local, end_source = bone_segment_end(bone, bone_by_name) if bone else (None, None)
        segment_end = (armature.matrix_world @ segment_end_local) if segment_end_local is not None else None
        pose_bone = armature.pose.bones.get(name)
        pose_head = (armature.matrix_world @ pose_bone.head) if pose_bone else None
        distances = sorted(stats['segmentDistancesAt0_05'])
        bounds = stats['boundsAt0_10']
        if bounds['min'][0] == float('inf'):
            bounds = None
        centroid = (stats['centroidNumerator'] / mass) if mass > 1e-12 else None
        joint_stats.append({
            'joint': name,
            'boneHeadWorld': [round(v, 6) for v in head] if head else None,
            'segmentEndWorld': [round(v, 6) for v in segment_end] if segment_end else None,
            'segmentEndSource': end_source,
            'poseBoneHeadWorld': [round(v, 6) for v in pose_head] if pose_head else None,
            'weightMass': round(mass, 6),
            'maxVertexWeight': round(stats['max'], 6),
            'verticesByMinimumWeight': stats['counts'],
            'weightedCentroidWorld': [round(v, 6) for v in centroid] if centroid else None,
            'verticesBoundsWeightAtLeast0_10': ({
                'min': [round(v, 6) for v in bounds['min']],
                'max': [round(v, 6) for v in bounds['max']],
            } if bounds else None),
            'distanceToBoneSegmentForWeightsAtLeast0_05World': {
                'count': len(distances),
                'p50': round(quantile(distances, 0.50), 6) if distances else None,
                'p95': round(quantile(distances, 0.95), 6) if distances else None,
                'max': round(distances[-1], 6) if distances else None,
            },
        })

    if not all_joints:
        joint_stats = [row for row in joint_stats if row['joint'] in CORE_JOINT_NAMES]

    limb_coverage = {}
    for side in ('Left', 'Right'):
        chain_names = [
            f'mixamorig:{side}Shoulder', f'mixamorig:{side}Arm',
            f'mixamorig:{side}ForeArm', f'mixamorig:{side}Hand',
        ]
        segments = []
        for name in chain_names:
            bone = bone_by_name.get(name)
            if bone is None:
                continue
            end_local, _ = bone_segment_end(bone, bone_by_name)
            segments.append((armature.matrix_world @ bone.head_local,
                             armature.matrix_world @ end_local))
        distances = sorted(min(point_segment_distance(point, start, end)
                               for start, end in segments)
                           for point in positions) if segments else []
        limb_coverage[f'{side}ArmChain'] = {
            'nearestSegmentDistanceWorld': {
                'p50': round(quantile(distances, 0.50), 6) if distances else None,
                'p90': round(quantile(distances, 0.90), 6) if distances else None,
                'p95': round(quantile(distances, 0.95), 6) if distances else None,
                'max': round(distances[-1], 6) if distances else None,
            },
            'verticesWithinDistance': {
                str(radius): sum(distance <= radius for distance in distances)
                for radius in (0.04, 0.06, 0.08, 0.10, 0.12, 0.16, 0.20)
            },
        }

    return {
        'mesh': mesh.name,
        'armature': armature.name,
        'vertices': len(mesh.data.vertices),
        'groups': len(group_names),
        'boneCount': len(bones),
        'meshWorldMatrix': matrix_rows(mesh.matrix_world),
        'armatureWorldMatrix': matrix_rows(armature.matrix_world),
        'unweightedVertices': zero_vertices,
        'weightSumAbsoluteError': {
            'p95': round(quantile(sorted(sum_errors), 0.95), 8) if sum_errors else None,
            'max': round(max(sum_errors), 8) if sum_errors else None,
        },
        'influencesPerVertex': {
            'min': min(influence_counts) if influence_counts else None,
            'max': max(influence_counts) if influence_counts else None,
        },
        'limbCoverage': limb_coverage,
        'joints': joint_stats,
    }


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
all_joints = '--all' in argv
argv = [arg for arg in argv if arg != '--all']
if len(argv) != 1:
    raise SystemExit('Passe um GLB depois de --; use --all para incluir todos os joints.')
path = os.path.abspath(argv[0])
if not os.path.isfile(path) or not path.lower().endswith('.glb'):
    raise SystemExit(f'GLB ausente/inválido: {path}')

with open(path, 'rb') as stream:
    glb = stream.read()
if glb[:4] != b'glTF' or len(glb) < 20:
    raise SystemExit(f'Cabeçalho GLB inválido: {path}')
json_length = struct.unpack_from('<I', glb, 12)[0]
gltf = json.loads(glb[20:20 + json_length].decode('utf-8'))
mesh_node_names = {
    node.get('name') for node in gltf.get('nodes', [])
    if node.get('name') and 'mesh' in node
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
armatures = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
meshes = [obj for obj in bpy.context.scene.objects
          if obj.type == 'MESH' and obj.name in mesh_node_names]
if len(armatures) != 1:
    raise SystemExit(f'Esperado 1 armature; encontrados {len(armatures)}.')
if not meshes:
    raise SystemExit('Nenhuma malha skinned correspondente aos mesh nodes do GLB.')
armature = armatures[0]
armature.data.pose_position = 'REST'
bpy.context.view_layer.update()
reports = [audit_mesh(mesh, armature, all_joints) for mesh in meshes]
print(json.dumps({'file': path, 'meshes': reports}, ensure_ascii=False, indent=2), flush=True)
