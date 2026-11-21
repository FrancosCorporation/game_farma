"""Blender CPU: candidato do balcão, metros, pivô na base, duas famílias de material.

Uso: blender -b --python scripts/create_pharmacy_counter.py -- saída.glb
"""
import bpy
import sys
from pathlib import Path

output = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def rgb(hex_color):
    return tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def material(name, roughness, color=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.05
    if color:
        bsdf.inputs['Base Color'].default_value = rgb(color)
    else:
        vertex = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'Color'
        mat.node_tree.links.new(vertex.outputs['Color'], bsdf.inputs['Base Color'])
    return mat


palette = material('FarmaPalette', 0.65)
wood = material('WarmWood', 0.62, 'B89068')
pieces = {palette.name: [], wood.name: []}


def box(name, size, center, mat, color, radius=0.018):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new('Soft edges', 'BEVEL')
    bevel.width = radius
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    weighted = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    weighted.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=weighted.name)
    obj.data.materials.append(mat)
    if mat == palette:
        attr = obj.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for item in attr.data:
            item.color = rgb(color)
    pieces[mat.name].append(obj)
    return obj


# Blender é Z-up; o exportador glTF converte para Y-up.
box('Plinth', (4.54, 0.70, 0.10), (0, 0, 0.05), palette, '37414B')
box('Counter body', (4.60, 0.78, 0.89), (0, 0, 0.545), palette, 'F4F1DE', 0.035)
box('Wood worktop', (4.80, 0.95, 0.06), (0, 0, 1.03), wood, None, 0.020)
box('Guest teal accent', (4.40, 0.025, 0.085), (0, 0.402, 0.86), palette, '0D9488', 0.012)
box('Staff teal accent', (4.40, 0.025, 0.055), (0, -0.402, 0.90), palette, '0D9488', 0.010)
for i in range(12):
    box('Guest wood panel', (0.20, 0.022, 0.65), (-2.08 + i * 0.378, 0.405, 0.46), wood, None, 0.009)

# Consolidar por material reduz draw calls sem achatar a paleta de vertex colors.
for name, objects in pieces.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True,
                          export_animations=False, export_skins=False)
print('Counter candidate exported:', output)
