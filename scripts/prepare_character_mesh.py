"""Prepare a provisional humanoid mesh in Blender CPU; no rig/approval implied.

blender -b --python scripts/prepare_character_mesh.py -- raw.glb candidate.glb height budget
"""
import bpy
import sys
import json
from pathlib import Path
from mathutils import Vector

source, destination, height, budget = sys.argv[sys.argv.index('--')+1:]
height, budget = float(height), int(budget)
destination=Path(destination).resolve();destination.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not meshes: raise ValueError('No meshes')
for obj in meshes:
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
bpy.ops.object.join()
obj=bpy.context.object
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
before=sum(len(p.vertices)-2 for p in obj.data.polygons)
if before>budget:
    decimate=obj.modifiers.new('Web mesh', 'DECIMATE')
    decimate.ratio=budget/before
    decimate.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in obj.data.polygons: face.use_smooth=True
# Collapse interpolates imported custom normals across joints. Rebuild them on
# the final surface so neutral shoulders/face do not acquire triangular seams.
if obj.data.has_custom_normals:
    obj.data.normals_split_custom_set([(0.0,0.0,0.0)] * len(obj.data.loops))
for mat in obj.data.materials:
    if not mat or not mat.use_nodes: continue
    for node in mat.node_tree.nodes:
        if node.type=='BSDF_PRINCIPLED':
            node.inputs['Metallic'].default_value=0
            node.inputs['Roughness'].default_value=.65
            for slot in ['Metallic','Roughness']:
                for link in list(node.inputs[slot].links): mat.node_tree.links.remove(link)
        if node.type=='TEX_IMAGE' and node.image:
            w,h=node.image.size
            if max(w,h)>1024:
                scale=1024/max(w,h)
                node.image.scale(max(1,round(w*scale)),max(1,round(h*scale)))
points=[obj.matrix_world@Vector(c) for c in obj.bound_box]
mn=Vector(tuple(min(p[i] for p in points) for i in range(3)))
mx=Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale=height/(mx.z-mn.z)
obj.scale*=scale
obj.location.x-=(mn.x+mx.x)*scale/2
obj.location.y-=(mn.y+mx.y)*scale/2
obj.location.z-=mn.z*scale
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.context.scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',export_yup=True,export_animations=False,export_skins=False)
after=sum(len(p.vertices)-2 for p in obj.data.polygons)
report={'source':source,'candidate':str(destination),'status':'provisional_mesh_not_rigged','trianglesBefore':before,'trianglesAfter':after,'budget':budget,'height':height,'materials':len(obj.data.materials),'textureMax':1024}
destination.with_suffix('.report.json').write_text(json.dumps(report,indent=2)+'\n')
print(report)
