"""Stage a centered, grounded, textured FBX for Mixamo; does not create a rig."""
import bpy
import bmesh
import sys
from pathlib import Path
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
source, output = args[:2]
weld_seams = '--weld-seams' in args[2:]
output = Path(output).resolve(); output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for obj in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if weld_seams:
        before = len(obj.data.vertices)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        print('Coincident seam vertices welded:', before, '->', len(obj.data.vertices))
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
for obj in meshes:
    obj.location -= Vector(((low.x+high.x)/2, (low.y+high.y)/2, low.z))
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH': bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.export_scene.fbx(filepath=str(output), object_types={'MESH'}, add_leaf_bones=False,
                          apply_scale_options='FBX_SCALE_NONE', mesh_smooth_type='FACE',
                          path_mode='COPY', embed_textures=True, bake_anim=False)
print('Mixamo input staged:', output)
