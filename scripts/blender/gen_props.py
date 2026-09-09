# Gera props da farmácia (.glb) — FarmaCheck G4
# Uso: blender -b --python gen_props.py -- --out /home/servidor/Git/game_farma/public/models
# Coordenadas no padrão Blender (Z-up); o export glTF converte para Y-up (1u = 1m).
import bpy, sys, random
from mathutils import Matrix

argv = sys.argv[sys.argv.index('--') + 2:] if '--' in sys.argv else []
OUT = argv[argv.index('--out') + 1] if '--out' in argv else '/home/servidor/Git/game_farma/public/models'

def clean():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    # NÃO remover materiais aqui: o dict M é reutilizado entre os props
    for b in list(bpy.data.meshes):
        if b.users == 0:
            try:
                bpy.data.meshes.remove(b)
            except Exception:
                pass

def mat(name, color, rough=0.6, metal=0.0, emissive=None, e_str=0.0, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    nt = m.node_tree
    if nt is None:
        m.use_nodes = True
        nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if out is None:
            out = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    try:
        m.blend_method = 'BLEND' if alpha < 1.0 else 'OPAQUE'
    except Exception:
        pass
    if emissive:
        b.inputs['Emission Color'].default_value = (*emissive, 1.0)
        b.inputs['Emission Strength'].default_value = e_str
    return m

# Cores (hex 0xRRGGBB → r,g,b 0-1)
def C(h):
    return ((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255)

def box(name, w, d, h, cx, cy, cz, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    o.data.materials.append(m)
    return o

def cyl(name, r, h, cx, cy, cz, m, rx=0.0, ry=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=(cx, cy, cz), rotation=(rx, ry, 0))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)
    return o

def sph(name, r, cx, cy, cz, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=16, ring_count=12, location=(cx, cy, cz))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)
    return o

def export_prop(objs, filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/{filename}', export_format='GLB',
                              use_selection=True, export_apply=True)
    bpy.ops.object.delete()

M = {
    'frame':   mat('frame', C(0x5b6770), rough=0.5),
    'dark':    mat('dark', C(0x2f3e46), rough=0.5),
    'wood':    mat('wood', C(0x8a5a33), rough=0.35),
    'wooddk':  mat('wooddk', C(0x4a3524), rough=0.6),
    'tealGlow': mat('tealGlow', C(0x0d9488), emissive=C(0x0d9488), e_str=1.2),
    'teal':    mat('teal', C(0x0f766e), rough=0.4, metal=0.3),
    'glass':   mat('glass', C(0x9fc4d0), rough=0.08, alpha=0.22),
    'white':   mat('white', C(0xf8f9fa), rough=0.5),
    'screen':  mat('screen', C(0x0b1220), emissive=C(0x2dd4bf), e_str=0.9),
    'steel':   mat('steel', C(0x8d99ae), rough=0.3, metal=0.8),
    'cotton':  mat('cotton', C(0xffffff), rough=1.0),
    'vial':    mat('vial', C(0x9fd8ff), rough=0.3, alpha=0.85),
    'blue':    mat('blue', C(0x3d5a80), rough=0.45),
}
BOX_COLORS = [C(0xf8f9fa), C(0x2ec4b6), C(0xff9f1c), C(0xe07a5f), C(0xf4f1de), C(0x3d5a80), C(0x0d9488), C(0xf28f3b)]

# ---------- Balcão ----------
def balcao():
    o = [
        box('balcao_base', 4.6, 0.75, 1.0, 0, 0, 0.5, M['dark']),
        box('balcao_top', 4.8, 0.95, 0.06, 0, 0, 1.03, M['wood']),
        box('balcao_band', 4.6, 0.02, 0.1, 0, -0.385, 0.86, M['tealGlow']),
        box('balcao_kick', 4.5, 0.06, 0.08, 0, -0.36, 0.04, M['frame']),
    ]
    export_prop(o, 'prop_balcao.glb')

# ---------- Gôndola ----------
def gondola():
    rnd = random.Random(7)
    o = [
        box('g_side_l', 0.06, 0.5, 2.1, -1.2, 0, 1.05, M['frame']),
        box('g_side_r', 0.06, 0.5, 2.1, 1.2, 0, 1.05, M['frame']),
        box('g_header', 2.4, 0.07, 0.3, 0, 0, 2.25, M['tealGlow']),
        box('g_back', 2.34, 0.03, 2.05, 0, 0.22, 1.025, M['dark']),
    ]
    for i in range(4):
        y = 0.5 + i * 0.5
        o.append(box(f'g_shelf_{i}', 2.34, 0.5, 0.05, 0, 0, y, M['frame']))
        x = -1.05
        while x < 1.0:
            w = rnd.uniform(0.09, 0.16)
            h = rnd.uniform(0.11, 0.19)
            c = BOX_COLORS[rnd.randrange(len(BOX_COLORS))]
            o.append(box(f'g_box_{i}_{int(x*100)}', w, rnd.uniform(0.16, 0.22), h,
                         x + w / 2, rnd.uniform(-0.05, 0.05), y + 0.025 + h / 2,
                         mat(f'bx{c[0]:.2f}', c, rough=0.55)))
            x += w + rnd.uniform(0.02, 0.06)
    export_prop(o, 'prop_gondola.glb')

# ---------- Vitrine refrigerada ----------
def vitrine():
    o = [
        box('v_back', 1.2, 0.05, 2.0, 0, 0.225, 1.0, M['dark']),
        box('v_bottom', 1.2, 0.5, 0.06, 0, 0, 0.03, M['steel']),
        box('v_top', 1.2, 0.5, 0.08, 0, 0, 1.98, M['steel']),
        box('v_side_l', 0.05, 0.5, 1.9, -0.575, 0, 1.0, M['glass']),
        box('v_side_r', 0.05, 0.5, 1.9, 0.575, 0, 1.0, M['glass']),
        box('v_front', 1.16, 0.03, 1.86, 0, -0.23, 1.0, M['glass']),
        box('v_light', 1.0, 0.06, 0.02, 0, 0.1, 1.9, M['tealGlow']),
    ]
    for i, y in enumerate((0.55, 1.05, 1.55)):
        o.append(box(f'v_shelf_{i}', 1.08, 0.42, 0.025, 0, 0, y, M['glass']))
        for k in range(3):
            c = BOX_COLORS[(i * 3 + k) % len(BOX_COLORS)]
            o.append(cyl(f'v_prod_{i}_{k}', 0.045, 0.14, -0.35 + k * 0.35, 0.0, y + 0.095,
                         mat(f'vp{c[0]:.2f}', c, rough=0.4)))
    export_prop(o, 'prop_vitrine.glb')

# ---------- PC do bulário (de balcão: pivot na base, apoia no tampo) ----------
def pc():
    o = [
        cyl('pc_base', 0.11, 0.015, 0, 0, 0.008, M['dark']),
        cyl('pc_pole', 0.016, 0.09, 0, 0, 0.055, M['steel']),
        box('pc_monitor', 0.42, 0.05, 0.30, 0, 0, 0.235, M['dark']),
        box('pc_screen', 0.38, 0.012, 0.26, 0, -0.03, 0.235, M['screen']),
        box('pc_keyboard', 0.34, 0.13, 0.018, 0, 0.18, 0.009, M['frame']),
    ]
    export_prop(o, 'prop_pc.glb')


# ---------- Mesa TLAC ----------
def mesa():
    o = [box('m_top', 0.95, 0.7, 0.05, 0, 0, 0.875, M['wood'])]
    for lx in (-0.42, 0.42):
        for ly in (-0.28, 0.28):
            o.append(cyl(f'm_leg_{lx}_{ly}', 0.024, 0.88, lx, ly, 0.44, M['wooddk']))
    o += [
        box('m_bandeja', 0.52, 0.34, 0.035, 0, 0, 0.943, M['teal']),
        box('m_casete', 0.17, 0.09, 0.045, -0.08, 0.02, 0.985, M['white']),
        cyl('m_lancetador', 0.018, 0.09, 0.13, -0.06, 0.995, M['blue'], ry=0.35),
        sph('m_algodao', 0.035, 0.12, 0.1, 0.975, M['cotton']),
        cyl('m_frasco', 0.022, 0.08, -0.16, -0.1, 1.0, M['vial']),
    ]
    export_prop(o, 'prop_mesa.glb')

clean()
balcao()
clean()
gondola()
clean()
vitrine()
clean()
pc()
clean()
mesa()
print('PROPS OK →', OUT)

