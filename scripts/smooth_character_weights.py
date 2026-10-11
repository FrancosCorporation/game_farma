#!/usr/bin/env python3
"""Smooth transferred skin weights on existing mesh topology, without changing geometry.

Usage:
  blender -b --python scripts/smooth_character_weights.py -- input.glb output.glb [iterations=3] [factor=0.25]

Exports a skin-only GLB. Transplant Walk/Idle separately with the validated
glTF helper so Blender animation export cannot alter the clips.
"""
import math
import os
import sys

import bpy


def parse_args():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(args) not in (2, 3, 4):
        raise SystemExit(
            'Uso: blender -b --python scripts/smooth_character_weights.py -- '
            'input.glb output.glb [iterations=3] [factor=0.25]'
        )
    source, output = map(os.path.abspath, args[:2])
    iterations = int(args[2]) if len(args) >= 3 else 3
    factor = float(args[3]) if len(args) >= 4 else 0.25
    if iterations < 1 or iterations > 12:
        raise SystemExit('iterations deve ficar entre 1 e 12')
    if factor <= 0 or factor > 0.5:
        raise SystemExit('factor deve ficar em (0, 0.5]')
    if not os.path.isfile(source) or not source.lower().endswith('.glb'):
        raise SystemExit(f'Entrada GLB ausente/inválida: {source}')
    if not output.lower().endswith('.glb') or os.path.exists(output):
        raise SystemExit(f'A saída deve ser um GLB novo ainda inexistente: {output}')
    return source, output, iterations, factor


def normalize(weights):
    weights = {group: weight for group, weight in weights.items() if weight > 1e-7}
    if not weights:
        return {}
    total = sum(weights.values())
    return {group: weight / total for group, weight in weights.items()}


def edge_roughness(weights, edges):
    total = 0.0
    for a, b in edges:
        wa, wb = weights[a], weights[b]
        for group in wa.keys() | wb.keys():
            total += abs(wa.get(group, 0.0) - wb.get(group, 0.0))
    return total / max(len(edges), 1)


def main():
    source, output, iterations, factor = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(armatures) != 1 or not meshes:
        raise SystemExit(f'Esperado 1 armature e mesh skinned; armatures={len(armatures)}, meshes={len(meshes)}')
    arm = armatures[0]
    mesh = max(meshes, key=lambda obj: len(obj.data.vertices))
    if len(mesh.vertex_groups) < 60:
        raise SystemExit(f'Poucos vertex groups: {len(mesh.vertex_groups)}')
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()

    vertex_count = len(mesh.data.vertices)
    group_names = [group.name for group in mesh.vertex_groups]
    group_index = {name: index for index, name in enumerate(group_names)}
    weights = []
    for vertex in mesh.data.vertices:
        per_vertex = {entry.group: entry.weight for entry in vertex.groups if entry.weight > 1e-7}
        if not per_vertex:
            raise SystemExit(f'Vértice sem peso antes do smooth: {vertex.index}')
        weights.append(normalize(per_vertex))

    edges = [(edge.vertices[0], edge.vertices[1]) for edge in mesh.data.edges]
    adjacency = [set() for _ in range(vertex_count)]
    for a, b in edges:
        adjacency[a].add(b)
        adjacency[b].add(a)
    before_roughness = edge_roughness(weights, edges)

    current = weights
    for _ in range(iterations):
        updated = []
        for index, own in enumerate(current):
            neighbors = adjacency[index]
            if not neighbors:
                updated.append(own)
                continue
            blended = {group: value * (1.0 - factor) for group, value in own.items()}
            neighbor_scale = factor / len(neighbors)
            for neighbor in neighbors:
                for group, value in current[neighbor].items():
                    blended[group] = blended.get(group, 0.0) + value * neighbor_scale
            # Three.js/glTF convention uses at most four influences per vertex.
            top = sorted(blended.items(), key=lambda item: item[1], reverse=True)[:4]
            updated.append(normalize(dict(top)))
        current = updated

    after_roughness = edge_roughness(current, edges)
    if not math.isfinite(after_roughness) or after_roughness >= before_roughness:
        raise SystemExit(
            f'Smoothing não reduziu o ruído: antes={before_roughness:.6f} '
            f'depois={after_roughness:.6f}'
        )

    # Rebuild groups in bulk using 0.001 quantization buckets. This keeps the
    # operation tractable on a 280k-vertex mesh and limits quantization error to
    # 0.0005 before final normalization by the GLB exporter.
    temp_names = [f'__smooth_weight_{index}' for index in range(len(group_names))]
    for name in temp_names:
        if mesh.vertex_groups.get(name):
            raise SystemExit(f'Grupo temporário já existe: {name}')
    new_groups = [mesh.vertex_groups.new(name=name) for name in temp_names]
    buckets = [dict() for _ in group_names]
    for vertex_index, per_vertex in enumerate(current):
        for group_index_value, value in per_vertex.items():
            quantized = int(round(value * 1000.0))
            if quantized > 0:
                buckets[group_index_value].setdefault(quantized, []).append(vertex_index)
    for group_index_value, quantized_weights in enumerate(buckets):
        group = new_groups[group_index_value]
        for quantized, indices in quantized_weights.items():
            group.add(indices, quantized / 1000.0, 'REPLACE')

    # Remove old groups and restore the exact bone names used by the armature.
    for name in group_names:
        old = mesh.vertex_groups.get(name)
        if old is not None:
            mesh.vertex_groups.remove(old)
    for temp_name, original_name in zip(temp_names, group_names):
        mesh.vertex_groups[temp_name].name = original_name

    # Guard against bucket rounding dropping all small weights at a vertex.
    empty = [vertex.index for vertex in mesh.data.vertices if not vertex.groups]
    if empty:
        raise SystemExit(f'Quantização deixou {len(empty)} vértices sem grupo.')
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

    sums = []
    max_influences = 0
    for vertex in mesh.data.vertices:
        values = [entry.weight for entry in vertex.groups]
        max_influences = max(max_influences, len(values))
        total = sum(values)
        if not math.isfinite(total) or abs(total - 1.0) > 1e-3:
            raise SystemExit(f'Soma de pesos inválida no vértice {vertex.index}: {total}')
        sums.append(total)

    print(
        f'[smooth] source={source} verts={vertex_count} edges={len(edges)} '
        f'groups={len(group_names)} iterations={iterations} factor={factor}', flush=True,
    )
    print(
        f'[smooth] edge-weight roughness {before_roughness:.6f} → {after_roughness:.6f} '
        f'({(1.0 - after_roughness / before_roughness) * 100.0:.1f}% reduction)', flush=True,
    )
    print(
        f'[smooth] coverage=100% maxInfluences={max_influences} '
        f'sums=[{min(sums):.6f},{max(sums):.6f}]', flush=True,
    )

    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output, export_format='GLB', export_animations=False,
        export_skins=True, export_apply=False, export_yup=True,
    )
    if not os.path.isfile(output) or os.path.getsize(output) < 1024:
        raise SystemExit('Export skin-only falhou.')
    print(f'[smooth] output={output} bytes={os.path.getsize(output)}', flush=True)


main()
