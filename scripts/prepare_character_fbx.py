#!/usr/bin/env python3
"""Prepare a static GLB candidate as a grounded, centered FBX for Mixamo.

Usage:
  blender -b --python scripts/prepare_character_fbx.py -- input.glb output.fbx

Never overwrites the source. Choose a new output path for each candidate.
"""
import os
import sys

import bpy
from mathutils import Vector


def bounds(meshes):
    bpy.context.view_layer.update()
    minimum = Vector((float('inf'),) * 3)
    maximum = Vector((float('-inf'),) * 3)
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    return minimum, maximum


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(args) != 2:
        raise SystemExit('Uso: blender -b --python scripts/prepare_character_fbx.py -- input.glb output.fbx')
    source, output = map(os.path.abspath, args)
    if not os.path.isfile(source) or not source.lower().endswith('.glb'):
        raise SystemExit(f'GLB de entrada inválido: {source}')
    if not output.lower().endswith('.fbx'):
        raise SystemExit(f'A saída deve terminar em .fbx: {output}')
    if os.path.exists(output):
        raise SystemExit(f'A saída já existe; escolha outro caminho para preservar o arquivo: {output}')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise SystemExit('O GLB não contém malhas renderizáveis.')

    triangles_before = sum(len(obj.data.polygons) for obj in meshes)
    minimum, maximum = bounds(meshes)
    print(f'Malhas={len(meshes)} triângulos={triangles_before}', flush=True)
    print(f'Bounds antes: min={tuple(round(v, 5) for v in minimum)} max={tuple(round(v, 5) for v in maximum)}', flush=True)

    # FBX/Mixamo uses Z-up. Ground all scene roots before centering mesh origins.
    roots = [obj for obj in bpy.context.scene.objects if obj.parent is None]
    for root in roots:
        root.location.z -= minimum.z
    bpy.context.view_layer.update()

    # Preserve the assembled world-space shape while placing each mesh origin at
    # its bounds center. This is the tested Mixamo framing fix for this project.
    for mesh in meshes:
        bpy.ops.object.select_all(action='DESELECT')
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        pivot_error = max(abs(value) for value in mesh.location)
        print(f'{mesh.name}: pivot local={tuple(round(v, 5) for v in mesh.location)}', flush=True)
        if pivot_error > 1e-5:
            raise SystemExit(f'Pivô não foi zerado em {mesh.name} (erro={pivot_error:.5f})')

    minimum_after, maximum_after = bounds(meshes)
    print(f'Bounds depois: min={tuple(round(v, 5) for v in minimum_after)} max={tuple(round(v, 5) for v in maximum_after)}', flush=True)
    if abs(minimum_after.z) > 0.01:
        raise SystemExit(f'Pés fora do chão após preparação (min Z={minimum_after.z:.4f})')

    os.makedirs(os.path.dirname(output) or '.', exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=output,
        object_types={'MESH'},
        add_leaf_bones=False,
        apply_scale_options='FBX_SCALE_NONE',
        use_mesh_modifiers=True,
        mesh_smooth_type='OFF',
        embed_textures=True,
        path_mode='AUTO',
    )
    if not os.path.isfile(output) or os.path.getsize(output) < 1024:
        raise SystemExit('FBX export falhou ou gerou arquivo vazio.')
    print(f'FBX pronto: {output} ({os.path.getsize(output)} bytes)', flush=True)


main()
