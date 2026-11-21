"""Blender CPU: mobiliário estilizado O2–O5, atlas único e peças consolidadas.

Uso: blender -b --python scripts/create_pharmacy_collection.py -- atlas.png saída/
Coordenadas de construção Z-up; export glTF Y-up. Frente da loja em +Z glTF.
"""
import bpy
import json
import sys
from pathlib import Path

atlas_path = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
output = Path(sys.argv[sys.argv.index('--') + 2]).resolve()
output.mkdir(parents=True, exist_ok=True)
reports = []


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def color(code):
    return tuple(linear(int(code[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    global palette, labels, glass, pieces, products
    pieces, products = {}, []
    palette = bpy.data.materials.new('FarmaPalette')
    palette.use_nodes = True
    bsdf = shader(palette)
    bsdf.inputs['Roughness'].default_value = .64
    bsdf.inputs['Metallic'].default_value = .04
    vertex = palette.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Color'
    palette.node_tree.links.new(vertex.outputs['Color'], bsdf.inputs['Base Color'])
    labels = bpy.data.materials.new('FarmaLabels')
    labels.use_nodes = True
    bsdf = shader(labels)
    bsdf.inputs['Roughness'].default_value = .72
    tex = labels.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(atlas_path), check_existing=True)
    labels.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    glass = bpy.data.materials.new('SoftGlass')
    glass.use_nodes = True
    bsdf = shader(glass)
    bsdf.inputs['Base Color'].default_value = color('BDDCE0')
    bsdf.inputs['Roughness'].default_value = .5
    bsdf.inputs['Alpha'].default_value = .18
    glass.surface_render_method = 'BLENDED'


def shader(mat):
    # Node names depend on the host language; Blender 5.2 may create no default.
    mat.node_tree.nodes.clear()
    bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output_node = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output_node.inputs['Surface'])
    return bsdf


def finish(obj, mat, code=None):
    obj.data.materials.append(mat)
    if code:
        attr = obj.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for item in attr.data:
            item.color = color(code)
    pieces.setdefault(mat, []).append(obj)
    return obj


def box(name, size, center, code='F4F1DE', radius=.006, mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if radius:
        bevel = obj.modifiers.new('Soft edges', 'BEVEL')
        bevel.width = min(radius, min(size) * .35)
        bevel.segments = 1 if radius <= .004 else 2
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for face in obj.data.polygons:
            face.use_smooth = True
        weighted = obj.modifiers.new('Stable normals', 'WEIGHTED_NORMAL')
        weighted.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=weighted.name)
    return finish(obj, mat or palette, code if mat is None else None)


def cylinder(name, radius, height, center, code):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=height, location=center)
    obj = bpy.context.object
    obj.name = name
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return finish(obj, palette, code)


def label(name, center, width, height, tile, top=False):
    x, y, z = center
    if top:
        verts = [(x-width/2, y+height/2, z), (x+width/2, y+height/2, z),
                 (x+width/2, y-height/2, z), (x-width/2, y-height/2, z)]
        face = (3, 2, 1, 0)
    else:
        verts = [(x-width/2, y, z-height/2), (x+width/2, y, z-height/2),
                 (x+width/2, y, z+height/2), (x-width/2, y, z+height/2)]
        face = (0, 1, 2, 3)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], [face])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    uv = mesh.uv_layers.new(name='UVMap')
    col, row, pad = tile % 4, tile // 4, .003
    a, b = col / 4 + pad, 1 - (row + 1) / 4 + pad
    uvs = [(a,b),(a+.25-2*pad,b),(a+.25-2*pad,b+.25-2*pad),(a,b+.25-2*pad)]
    for loop in mesh.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    return finish(obj, labels)


def product(x, y, support, index, bottle=False):
    code = ['0D9488', '4F83AD', 'B97A43', '8B65A0', '509072'][index % 5]
    if bottle:
        h, r = .19, .043
        cylinder('Bottle', r, h, (x,y,support+h/2), 'B89068')
        cylinder('Bottle cap', r*.85, .035, (x,y,support+h+.0175), 'F4F1DE')
        label('Bottle label', (x,y-r-.001,support+h*.5), .069, .105, index % 10)
        top = support + h + .035
    else:
        w, h, d = .16, .20 + (index % 3)*.025, .075
        box('Medicine carton', (w,d,h), (x,y,support+h/2), 'F4F1DE', .003)
        box('Carton top band', (w+.001,d+.001,.026), (x,y,support+h-.02), code, .001)
        label('Carton label', (x,y-d/2-.001,support+h*.47), w*.91, h*.79, index % 10)
        top = support + h
    products.append({'base':support,'top':top,'x':x,'depth':y,'kind':'bottle' if bottle else 'carton'})


def export(name, budget):
    for mat, objects in pieces.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = mat.name
        bpy.context.scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    tris = sum(len(poly.vertices)-2 for obj in bpy.context.scene.objects
               if obj.type == 'MESH' for poly in obj.data.polygons)
    if tris > budget:
        raise ValueError(f'{name}: {tris} exceeds budget {budget}')
    target = output / f'{name}_v002.glb'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_yup=True,
                              export_animations=False, export_skins=False)
    reports.append({'name':name,'file':str(target),'triangles':tris,'budget':budget,
                    'materials':len(pieces),'products':products.copy()})


reset()
box('Plinth', (2.3,.45,.12), (0,0,.06), '37414B', .018)
box('Back', (2.4,.045,1.86), (0,.226,1.05), 'DDE3E8', .009)
for x in [-1.17,1.17]:
    box('Side upright', (.06,.5,1.94), (x,0,.97), 'F4F1DE', .012)
box('Header', (2.4,.08,.18), (0,.17,2.01), '0D9488', .014)
label('Header text', (0,.127,2.01), 1.35,.155,10)
for row, z in enumerate([.34,.76,1.18,1.60]):
    box('Shelf', (2.32,.47,.04), (0,-.005,z), 'F4F1DE', .004)
    box('Shelf lip', (2.32,.025,.05), (0,-.245,z-.003), '0D9488', .003)
    for j in range(9):
        product(-1.04+j*.26,-.11,z+.02,row*9+j,bottle=j in [3,7])
export('prop_gondola', 8000)

reset()
box('Display base', (1.2,.55,.12), (0,0,.06), '37414B', .02)
box('Display backing', (1.2,.045,2.08), (0,.25,1.16), 'F4F1DE', .012)
for x in [-.575,.575]:
    box('Display side', (.05,.55,2.08), (x,0,1.16), 'DDE3E8', .009)
box('Display top', (1.2,.55,.065), (0,0,2.1675), '0D9488', .012)
for row,z in enumerate([.42,.88,1.34,1.80]):
    box('Display shelf', (1.1,.48,.035), (0,0,z), 'DDE3E8', .003)
    for j in range(4):
        product(-.41+j*.27,-.13,z+.0175,row*4+j,bottle=j==3)
for x in [-.294,.294]:
    box('Glass panel', (.56,.01,1.96), (x,-.27,1.15), radius=0,mat=glass)
    box('Handle', (.016,.033,.13), (x+(.22 if x<0 else -.22),-.294,1.12), 'B89068', .005)
export('prop_vitrine', 8000)

reset()
box('Worktop', (.95,.7,.05), (0,0,.90), 'B89068', .014)
for x in [-.42,.42]:
    for y in [-.28,.28]:
        cylinder('Table leg', .025,.875,(x,y,.4375),'DDE3E8')
box('Tray floor', (.56,.36,.02), (0,0,.945), 'E5F2F0', .004)
for x in [-.28,.28]:
    box('Tray rim', (.012,.36,.02), (x,0,.962), '0D9488', .003)
for y in [-.18,.18]:
    box('Tray rim', (.56,.012,.02), (0,y,.962), '0D9488', .003)
box('Test cassette', (.16,.09,.018), (-.16,-.04,.964), 'F4F1DE', .004)
box('Test window', (.053,.029,.002), (-.18,-.04,.974), 'DDE3E8', .0005)
cylinder('Sample well', .011,.002,(-.105,-.04,.974),'A5C8CB')
label('Cassette marks', (-.18,-.04,.9755), .052,.025,14,top=True)
cylinder('Lancet', .016,.073,(.17,.10,.9915),'4F83AD')
cylinder('Lancet cap', .017,.017,(.17,.10,1.0365),'0D9488')
for x,y in [(.11,-.10),(.18,-.10),(.14,-.15)]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=.025, location=(x,y,.98))
    finish(bpy.context.object,palette,'FFFFFF')
cylinder('Sample bottle', .022,.073,(.02,.1,.9915),'BDDCE0')
cylinder('Sample bottle cap', .022,.016,(.02,.1,1.036),'0D9488')
export('prop_mesa', 8000)

reset()
# Local coordinates preserve the active PC group at (-1.4, 0, 1.78).
box('Monitor shell', (.44,.062,.30), (0,.06,1.21), '37414B', .012)
box('Monitor foot', (.18,.11,.012), (0,.06,1.066), '37414B', .004)
box('Monitor stand', (.045,.035,.13), (0,.072,1.13), 'DDE3E8', .006)
box('Keyboard base', (.34,.13,.012), (.02,-.07,1.068), '37414B', .006)
for row in range(4):
    for j in range(12):
        box('Key', (.021,.019,.007), (-.12+j*.025,-.115+row*.025,1.0775), 'DDE3E8', .001)
box('Space key', (.135,.019,.007), (.02,-.02,1.0775), 'DDE3E8', .001)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=(.28,-.08,1.077))
obj=bpy.context.object; obj.scale=(.026,.037,.017)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
finish(obj,palette,'37414B')
box('Mouse stripe', (.004,.03,.004), (.28,-.09,1.094), '0D9488', .0005)
export('prop_pc', 8000)

reset()
box('Tower', (.19,.42,.42), (0,0,.21), '37414B', .014)
box('Tower front', (.16,.013,.37), (0,-.218,.215), '2B3540', .006)
for j in range(5):
    box('Vent', (.10,.008,.009), (0,-.228,.07+j*.023), 'DDE3E8', .001)
cylinder('Power button', .012,.005,(.052,-.233,.343),'0D9488')
export('prop_cpu', 2000)

(output/'collection_v002.report.json').write_text(json.dumps(reports,indent=2)+'\n')
print('Collection exported:',len(reports),'assets')
