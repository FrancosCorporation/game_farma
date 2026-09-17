# split_materials.py — divide o material único do Eric em materiais semânticos
# (skin, hair, shirt, pants, shoes, eyes) amostrando a textura no centróide UV
# de cada face + altura Y da face em bind pose. Não toca no rig.
# Uso: blender -b --python scripts/blender/split_materials.py -- \
#        --in  public/models/paciente_real.glb \
#        --tex /tmp/opencode/tex_0.jpg \
#        --out public/models/paciente_base.glb
import bpy, sys, json

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None):
    return argv[argv.index(k) + 1] if k in argv else d

SRC = arg('--in', 'public/models/paciente_real.glb')
TEX = arg('--tex', '/tmp/opencode/tex_0.jpg')
OUT = arg('--out', 'public/models/paciente_base.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

# pega o MAIOR mesh (o GLB tem um Icosphere lixo do Sketchfab) e remove os demais
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
meshes.sort(key=lambda o: -len(o.data.polygons))
mesh_obj = meshes[0]
for junk in meshes[1:]:
    bpy.data.objects.remove(junk, do_unlink=True)
me = mesh_obj.data
print('mesh escolhido:', mesh_obj.name, len(me.polygons), 'polys')
uv = me.uv_layers.active
# eixo "altura" LOCAL do mesh (z, cm neste asset — Z-up preservado no data)
zs = [v.co.z for v in me.vertices]
z0, z1 = min(zs), max(zs)
zsamp = (z1 - z0) or 1.0
print('Z local range:', round(z0, 2), '..', round(z1, 2))
def altura(p):
    # altura normalizada da face em "metros" (0 = sola, ~1.86 topo)
    return (p.center.z - z0) / zsamp * 1.86

img = bpy.data.images.load(TEX)
W, H = img.size
px = img.pixels[:]  # RGBA linear 0..1

def srgb(l):
    return 255.0 * (1.055 * (l ** (1 / 2.4)) - 0.055) if l > 0.0031308 else 255.0 * 12.92 * l

def sample(u, v):
    x = min(W - 1, max(0, int(u * W)))
    y = min(H - 1, max(0, int(v * H)))
    i = (y * W + x) * 4
    return (srgb(px[i]), srgb(px[i + 1]), srgb(px[i + 2]))

def classify(r, g, b, y):
    mx, mn = max(r, g, b), min(r, g, b)
    # muito escuro: cabelo / calça / tênis (decide por altura)
    if mx < 70:
        if y > 1.45: return 'hair'
        if y < 0.26: return 'shoes'
        return 'pants'
    # claro neutro: tecido branco (camisa) ou sola/meia
    if mn > 175 and (mx - mn) < 50:
        return 'shoes' if y < 0.22 else 'shirt'
    # tom quente avermelhado: pele (e globo ocular → skin mesmo)
    if r > g >= b and (r - b) > 15:
        return 'skin'
    # médios ambíguos → altura decide
    if y < 0.25: return 'shoes'
    if y < 1.05: return 'pants'
    if y > 1.48: return 'skin'
    return 'shirt'

counts = {}
per_poly = []
for p in me.polygons:
    us = [uv.data[l].uv for l in p.loop_indices]
    cu = sum(t.x for t in us) / len(us)
    cv = sum(t.y for t in us) / len(us)
    y = altura(p)
    r, g, b = sample(cu, cv)
    m = classify(r, g, b, y)
    per_poly.append(m)
    counts[m] = counts.get(m, 0) + 1

print('COUNTS', json.dumps(counts))

# cria materiais com MESMAS texturas do original (baseColor + normal)
src_mat = me.materials[0]
src_nodes = src_mat.node_tree
base_img = None
norm_img = None
for n in src_nodes.nodes:
    if n.type == 'TEX_IMAGE' and n.image:
        is_normal = 'normal' in (n.image.name or '').lower()
        # identifica pelo destino do link
        for link in src_nodes.links:
            if link.from_node == n:
                if link.to_node.type == 'NORMAL_MAP' or link.to_socket.name == 'Normal':
                    norm_img = n.image
                elif link.to_socket.name == 'Base Color':
                    base_img = n.image
if base_img is None and norm_img is None:
    # fallback: pela ordem das imagens
    imgs = [n.image for n in src_nodes.nodes if n.type == 'TEX_IMAGE' and n.image]
    base_img, norm_img = (imgs + [None, None])[:2]
print('base_img:', base_img and base_img.name, '| norm_img:', norm_img and norm_img.name)

def make_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.65
    if base_img:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = base_img
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if norm_img:
        t2 = nt.nodes.new('ShaderNodeTexImage')
        t2.image = norm_img
        t2.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t2.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m

idx = {}
for name in ['skin', 'hair', 'shirt', 'pants', 'shoes', 'eyes']:
    if name in counts:
        me.materials.append(make_mat(name))
        idx[name] = len(me.materials) - 1
for i, p in enumerate(me.polygons):
    p.material_index = idx[per_poly[i]]

print('slots:', [m.name for m in me.materials])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True)
print('EXPORT ->', OUT)
