#!/usr/bin/env python3
"""Convert one already-rigged FBX action to a GLB without retargeting.

Usage:
  blender -b --python scripts/export_fbx_action_glb.py -- input.fbx Walk output.glb

The source mesh, armature, weights, and its own action are exported together.
Use once per clip, then combine clips at the glTF level after rest-pose checks.
"""
import os
import sys

import bpy


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) not in (3, 4):
        raise SystemExit('Uso: blender -b --python scripts/export_fbx_action_glb.py -- input.fbx Walk output.glb [--static]')
    source, clip_name, output = argv[:3]
    static_only = len(argv) == 4 and argv[3] == '--static'
    if len(argv) == 4 and not static_only:
        raise SystemExit(f'Opção desconhecida: {argv[3]}')
    source, output = os.path.abspath(source), os.path.abspath(output)
    if not os.path.isfile(source) or not source.lower().endswith('.fbx'):
        raise SystemExit(f'FBX ausente/inválido: {source}')
    if not clip_name or not output.lower().endswith('.glb') or os.path.exists(output):
        raise SystemExit(f'Nome de clip inválido ou saída já existe: {output}')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=source)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    actions = list(bpy.data.actions)
    if len(armatures) != 1 or not meshes or len(actions) != 1:
        raise SystemExit(f'Esperado 1 rig, malha(s) e ação; rigs={len(armatures)} meshes={len(meshes)} actions={len(actions)}')
    arm = armatures[0]
    action = actions[0]
    bone_names = {bone.name.removeprefix('mixamorig:').removeprefix('mixamorig') for bone in arm.data.bones}
    allowed_profiles = {33, 57, 65}
    if len(bone_names) not in allowed_profiles:
        raise SystemExit(f'Rig inesperado: {len(bone_names)} joints (perfis aceitos: {sorted(allowed_profiles)})')
    required_bones = {
        'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
        'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
        'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
    }
    missing_bones = sorted(required_bones - bone_names)
    if missing_bones:
        raise SystemExit(f'Rig Mixamo sem juntas humanoides necessárias: {missing_bones}')
    weighted_meshes = [mesh for mesh in meshes if mesh.vertex_groups and mesh.data.vertices]
    if not weighted_meshes:
        raise SystemExit('Nenhuma malha com vertex groups foi importada')
    groups = {group.name.removeprefix('mixamorig:').removeprefix('mixamorig')
              for mesh in weighted_meshes for group in mesh.vertex_groups}
    missing_groups = sorted(required_bones - groups)
    if missing_groups:
        raise SystemExit(f'Malha sem grupos de peso para juntas humanoides necessárias: {missing_groups}')
    action.name = clip_name
    if not static_only:
        arm.animation_data_create()
        arm.animation_data.action = action
        start, end = action.frame_range
        bpy.context.scene.frame_start = int(start)
        bpy.context.scene.frame_end = int(end)
    else:
        arm.animation_data_clear()
        start, end = 1.0, 1.0
        bpy.context.scene.frame_start = 1
        bpy.context.scene.frame_end = 1
    bpy.context.scene.render.fps = 30
    bpy.context.scene.render.fps_base = 1.0
    bpy.context.view_layer.update()

    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    options = {
        'filepath': output,
        'export_format': 'GLB',
        'export_animations': not static_only,
        'export_skins': True,
        'export_yup': True,
    }
    if 'export_animation_mode' in props:
        options['export_animation_mode'] = 'ACTIONS'
    if 'export_nla_strips' in props:
        options['export_nla_strips'] = False
    if 'export_force_sampling' in props:
        options['export_force_sampling'] = True
    if 'export_frame_range' in props:
        options['export_frame_range'] = True

    bpy.ops.export_scene.gltf(**options)
    if not os.path.isfile(output) or os.path.getsize(output) < 1024:
        raise SystemExit('GLB export falhou ou criou um arquivo vazio')
    print(
        f'[fbx-action] {clip_name}{" (static)" if static_only else ""}: source={source} bones={len(arm.data.bones)} '
        f'meshes={len(weighted_meshes)} bones={len(bone_names)} vertexGroups={len(groups)} frames={start:.2f}..{end:.2f} '
        f'output={output} bytes={os.path.getsize(output)}',
        flush=True,
    )


main()
