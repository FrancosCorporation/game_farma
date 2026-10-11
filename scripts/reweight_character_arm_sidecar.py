#!/usr/bin/env python3
"""Build a conservative diagnostic arm-weight sidecar for an already-skinned GLB.

Usage:
  blender -b --python scripts/reweight_character_arm_sidecar.py -- \
    input.glb output.weights [innerRadius=0.05] [outerRadius=0.13]

Arm weights are redistributed only among arm joints that already influence a
vertex on the same side. Source side-arm mass and non-arm weights are preserved
before the GLTF four-influence limit is applied. The source GLB is never
modified; apply the result with
scripts/apply_gltf_weight_sidecar.mjs to a new GLB, then perform visual QA.
"""
import hashlib
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Vector


MAGIC = b'FARMAW1\0'
RECORD = struct.Struct('<4H4f')
ARM_BONES = {
    f'mixamorig:{side}{suffix}'
    for side in ('Left', 'Right')
    for suffix in ('Shoulder', 'Arm', 'ForeArm', 'Hand')
}
MIN_SIDE_ARM_MASS = 0.02
REQUIRED = [
    'mixamorig:Spine2',
    'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm',
    'mixamorig:LeftHand', 'mixamorig:LeftHandIndex1',
    'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm',
    'mixamorig:RightHand', 'mixamorig:RightHandIndex1',
]


def args_after_double_dash():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def segment_distance(point, start, end):
    delta = end - start
    length_squared = delta.length_squared
    if length_squared <= 1e-14:
        return (point - start).length, 0.0
    factor = max(0.0, min(1.0, (point - start).dot(delta) / length_squared))
    return (point - (start + delta * factor)).length, factor


def smooth_falloff(distance, inner_radius, outer_radius):
    if distance <= inner_radius:
        return 1.0
    if distance >= outer_radius:
        return 0.0
    t = (distance - inner_radius) / (outer_radius - inner_radius)
    return 1.0 - t * t * (3.0 - 2.0 * t)


def blend_influences(first, second, factor):
    result = {}
    for name, weight in first.items():
        result[name] = result.get(name, 0.0) + weight * (1.0 - factor)
    for name, weight in second.items():
        result[name] = result.get(name, 0.0) + weight * factor
    return result


def normalized_top_four(weights):
    items = [(name, weight) for name, weight in weights.items()
             if math.isfinite(weight) and weight > 1e-8]
    items.sort(key=lambda item: (-item[1], item[0]))
    items = items[:4]
    total = sum(weight for _, weight in items)
    if not total:
        raise ValueError('vértice ficaria sem peso')
    return [(name, weight / total) for name, weight in items]


def joint_segment(armature, bones_by_name, name):
    bone = bones_by_name[name]
    child_name = {
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
    }.get(name)
    child = bones_by_name.get(child_name) if child_name else None
    if child is None and len(bone.children) == 1:
        child = bone.children[0]
    end = child.head_local if child else bone.tail_local
    return armature.matrix_world @ bone.head_local, armature.matrix_world @ end


def arm_target_weights(side, segment_index, factor):
    names = {
        'torso': 'mixamorig:Spine2',
        'shoulder': f'mixamorig:{side}Shoulder',
        'arm': f'mixamorig:{side}Arm',
        'forearm': f'mixamorig:{side}ForeArm',
        'hand': f'mixamorig:{side}Hand',
    }
    profiles = [
        ({names['torso']: 0.35, names['shoulder']: 0.55, names['arm']: 0.10},
         {names['shoulder']: 0.15, names['arm']: 0.85}),
        ({names['arm']: 0.95, names['forearm']: 0.05},
         {names['arm']: 0.05, names['forearm']: 0.95}),
        ({names['forearm']: 0.95, names['hand']: 0.05},
         {names['forearm']: 0.15, names['hand']: 0.85}),
        ({names['hand']: 1.0}, {names['hand']: 1.0}),
    ]
    start, end = profiles[segment_index]
    return blend_influences(start, end, factor)


def main():
    argv = args_after_double_dash()
    if len(argv) not in (2, 3, 4):
        raise SystemExit(
            'Uso: reweight_character_arm_sidecar.py -- input.glb output.weights '
            '[innerRadius=0.05] [outerRadius=0.13]'
        )
    source, output = map(os.path.abspath, argv[:2])
    inner_radius = float(argv[2]) if len(argv) >= 3 else 0.05
    outer_radius = float(argv[3]) if len(argv) >= 4 else 0.13
    if not os.path.isfile(source) or not source.lower().endswith('.glb'):
        raise SystemExit(f'GLB ausente/inválido: {source}')
    if os.path.exists(output):
        raise SystemExit(f'O sidecar já existe; escolha outro caminho: {output}')
    if not (0.02 <= inner_radius < outer_radius <= 0.24):
        raise SystemExit('Radii devem satisfazer 0.02 <= innerRadius < outerRadius <= 0.24 m.')

    with open(source, 'rb') as stream:
        source_bytes = stream.read()
    if source_bytes[:4] != b'glTF':
        raise SystemExit('O arquivo de entrada não tem cabeçalho GLB.')
    source_sha = hashlib.sha256(source_bytes).hexdigest()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    meshes = [obj for obj in bpy.context.scene.objects
              if obj.type == 'MESH' and any(m.type == 'ARMATURE' for m in obj.modifiers)]
    if len(armatures) != 1 or len(meshes) != 1:
        raise SystemExit(f'Esperado 1 rig e 1 mesh skinned; rigs={len(armatures)} meshes={len(meshes)}.')
    armature, mesh = armatures[0], meshes[0]
    if len(armature.data.bones) != 65:
        raise SystemExit(f'Esperados 65 joints; encontrados {len(armature.data.bones)}.')
    armature.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    bones_by_name = {bone.name: bone for bone in armature.data.bones}
    missing = sorted(set(REQUIRED) - set(bones_by_name))
    if missing:
        raise SystemExit(f'Faltam bones exigidos pela cadeia Mixamo: {missing}')
    group_by_index = {group.index: group.name for group in mesh.vertex_groups}
    missing_groups = sorted(set(bones_by_name) - set(group_by_index.values()))
    if missing_groups:
        raise SystemExit(f'Faltam vertex groups do rig: {missing_groups}')

    chains = {}
    for side in ('Left', 'Right'):
        names = [f'mixamorig:{side}{suffix}' for suffix in ('Shoulder', 'Arm', 'ForeArm', 'Hand')]
        chains[side] = [joint_segment(armature, bones_by_name, name) for name in names]
    old_by_vertex = []
    positions = []
    for vertex in mesh.data.vertices:
        positions.append(mesh.matrix_world @ vertex.co)
        old_by_vertex.append({group_by_index[entry.group]: float(entry.weight)
                              for entry in vertex.groups
                              if entry.group in group_by_index and entry.weight > 1e-8})

    records = bytearray()
    affected = {'Left': 0, 'Right': 0}
    blended = {'Left': 0, 'Right': 0}
    skipped_no_side_arm_support = {'Left': 0, 'Right': 0}
    skipped_no_target_joint_support = {'Left': 0, 'Right': 0}
    distance_samples = {'Left': [], 'Right': []}
    mass = {}
    maximum_arm_mass_delta_by_side = {'Left': 0.0, 'Right': 0.0}
    joint_index = {name: index for index, name in enumerate(bones_by_name)}
    for vertex_index, point in enumerate(positions):
        nearest = {}
        for side, segments in chains.items():
            options = []
            for index, (start, end) in enumerate(segments):
                distance, factor = segment_distance(point, start, end)
                options.append((distance, index, factor))
            nearest[side] = min(options)
        side, (distance, segment_index, segment_factor) = min(
            nearest.items(), key=lambda item: item[1][0])
        amount = smooth_falloff(distance, inner_radius, outer_radius)
        original = old_by_vertex[vertex_index]
        original_total = sum(original.values())
        if original_total <= 1e-8:
            raise SystemExit(f'Vértice {vertex_index} sem pesos de origem.')
        final = {name: weight / original_total for name, weight in original.items()}

        target_side_arm = {
            name: weight for name, weight in final.items()
            if name in ARM_BONES and name.startswith(f'mixamorig:{side}')
        }
        side_arm_mass = sum(target_side_arm.values())
        if amount > 0 and side_arm_mass >= MIN_SIDE_ARM_MASS:
            proposed_target = arm_target_weights(side, segment_index, segment_factor)
            # Keep the existing influence set per vertex. Adding a fifth joint
            # and then truncating to VEC4 can silently discard non-arm mass.
            target = {name: weight for name, weight in proposed_target.items()
                      if name in target_side_arm}
            target_total = sum(target.values())
            if target_total > 1e-8:
                target = {name: weight / target_total for name, weight in target.items()}
                old_distribution = {name: weight / side_arm_mass
                                    for name, weight in target_side_arm.items()}
                new_distribution = blend_influences(old_distribution, target, amount)
                for name in target_side_arm:
                    final.pop(name, None)
                for name, weight in new_distribution.items():
                    final[name] = final.get(name, 0.0) + side_arm_mass * weight
                affected[side] += 1
                blended[side] += int(amount < 0.999)
                distance_samples[side].append(distance)
            else:
                skipped_no_target_joint_support[side] += 1
        elif amount > 0:
            skipped_no_side_arm_support[side] += 1

        entries = normalized_top_four(final)
        serialized = dict(entries)
        for check_side in ('Left', 'Right'):
            old_side_mass = sum(weight / original_total for name, weight in original.items()
                                if name in ARM_BONES and name.startswith(f'mixamorig:{check_side}'))
            new_side_mass = sum(weight for name, weight in serialized.items()
                                if name in ARM_BONES and name.startswith(f'mixamorig:{check_side}'))
            maximum_arm_mass_delta_by_side[check_side] = max(
                maximum_arm_mass_delta_by_side[check_side], abs(new_side_mass - old_side_mass))
        indices = [joint_index[name] for name, _ in entries]
        weights = [weight for _, weight in entries]
        for name, weight in entries:
            mass[name] = mass.get(name, 0.0) + weight
        indices.extend([0] * (4 - len(indices)))
        weights.extend([0.0] * (4 - len(weights)))
        if abs(sum(weights) - 1.0) > 1e-5 or any(not math.isfinite(weight) for weight in weights):
            raise SystemExit(f'Pesos finais inválidos no vértice {vertex_index}.')
        records.extend(RECORD.pack(*indices, *weights))

    joint_names = list(bones_by_name)
    header = {
        'format': 'farmacheck-weight-sidecar-v1',
        'sourceSha256': source_sha,
        'vertexCount': len(mesh.data.vertices),
        'jointNames': joint_names,
        'algorithm': 'preserve-side-arm-mass-chain-distance-v2',
        'innerRadiusMeters': inner_radius,
        'outerRadiusMeters': outer_radius,
        'minimumOriginalSideArmMass': MIN_SIDE_ARM_MASS,
        'affectedVerticesBySide': affected,
        'taperedVerticesBySide': blended,
        'skippedNoSideArmSupportBySide': skipped_no_side_arm_support,
        'skippedNoTargetJointSupportBySide': skipped_no_target_joint_support,
        'maximumSerializedSideArmMassDeltaBySide': maximum_arm_mass_delta_by_side,
        'nearestArmChainDistanceMeters': {
            side: {
                'p50': sorted(values)[int(0.50 * (len(values) - 1))] if values else None,
                'p95': sorted(values)[int(0.95 * (len(values) - 1))] if values else None,
                'max': max(values) if values else None,
            } for side, values in distance_samples.items()
        },
        'armJointWeightMass': {name: round(mass.get(name, 0.0), 4)
                               for name in sorted(ARM_BONES)},
        'recordBytes': RECORD.size,
    }
    header_bytes = json.dumps(header, separators=(',', ':')).encode('utf-8')
    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    with open(output, 'xb') as stream:
        stream.write(MAGIC)
        stream.write(struct.pack('<I', len(header_bytes)))
        stream.write(header_bytes)
        stream.write(records)
    print('[arm-weight-sidecar] ' + json.dumps(header, ensure_ascii=False), flush=True)
    print(f'[sidecar] output={output} bytes={os.path.getsize(output)} sourceSha256={source_sha}', flush=True)


main()
