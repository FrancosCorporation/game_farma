"""Polimento de personagem (sem regerar): kit de olhos (esfera+iris procedural+gloss)
+ suavização anti-banding (pele/roupa) com reforço nas mãos.
Uso: blender -b --python scripts/comfy/polish_char.py -- <src.glb> <out_plain.glb>
"""
import bpy, bmesh, math, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
IRIS_PNG = "/tmp/opencode/iris_ana.png"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
main = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
main.select_set(True)
bpy.context.view_layer.objects.active = main
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

verts = main.data.vertices
n = len(verts)
P = np.empty((n, 3), dtype=np.float64)
verts.foreach_get("co", P.ravel())
print(f"[polish] verts={n} tris={len(main.data.polygons)}")
print(f"[polish] bbox x[{P[:,0].min():.3f},{P[:,0].max():.3f}] y[{P[:,1].min():.3f},{P[:,1].max():.3f}] z[{P[:,2].min():.3f},{P[:,2].max():.3f}]")

# ---- detectar frente: no nariz (faixa z 1.50-1.63), vértice mais extremo em y ----
band = (P[:, 2] > 1.50) & (P[:, 2] < 1.63)
yb = P[band, 1]
front_sign = 1.0 if abs(yb.max()) >= abs(yb.min()) else -1.0
nose_front = yb.max() if front_sign > 0 else yb.min()
print(f"[polish] front_sign={front_sign:+.0f} y_nariz={nose_front:.3f}")

# ---- centros dos olhos: faixa dos olhos, |x|>2cm, y próximo da face frontal ----
eye_band = (P[:, 2] > 1.575) & (P[:, 2] < 1.628)
y_face = nose_front - 0.13 * front_sign  # plano frontal do rosto
if front_sign > 0:
    fmask = P[:, 1] > y_face
else:
    fmask = P[:, 1] < y_face
centers = {}
for s, nm in ((1, "L"), (-1, "R")):
    m = eye_band & fmask & (P[:, 0] * s > 0.015) & (np.abs(P[:, 0]) < 0.09)
    c = np.median(P[m], axis=0)
    # média dos 40% mais frontais ao redor da mediana (robusto contra cabelo)
    if front_sign > 0:
        fsel = m & (P[:, 1] > c[1] - 0.02)
    else:
        fsel = m & (P[:, 1] < c[1] + 0.02)
    c = P[fsel].mean(axis=0)
    centers[nm] = c
    print(f"[polish] olho {nm} ({m.sum()} verts) centro={np.round(c,4).tolist()}")

# ---- textura de íris procedural (pole no topo v=1) ----
N = 512
u = np.linspace(0, 2 * np.pi, N)[None, :].repeat(N, axis=0)     # azimute
theta = (np.linspace(1, 0, N)[:, None].repeat(N, axis=1)) * np.pi  # 0=pole
TH_IRIS, TH_PUP = 0.62, 0.21
img = np.ones((N, N, 4), dtype=np.float32)
img[..., :3] = (0.96, 0.945, 0.915)  # esclera quente
in_iris = theta < TH_IRIS
# striations radiais
spoke = 0.10 * np.sin(u * 84 + 2.5 * np.sin(theta * 36))
spoke += 0.06 * np.sin(u * 34 + 1.3)
olive = np.array([0.40, 0.44, 0.22])     # verde-avelã
gold = np.array([0.55, 0.42, 0.20])      # aro dourado interno
mix = np.clip(theta / TH_IRIS * 1.2, 0, 1)[..., None]
iris_col = gold * (1 - mix) + olive * mix
iris_col = np.clip(iris_col + spoke[..., None], 0, 1)
img[..., :3] = np.where(in_iris[..., None], iris_col, img[..., :3])
# anel límbico escuro
limbal = (theta > TH_IRIS - 0.06) & (theta < TH_IRIS)
img[..., :3] = np.where(limbal[..., None], np.array([0.16, 0.14, 0.10]), img[..., :3])
# pupila
img[..., :3] = np.where((theta < TH_PUP)[..., None], np.array([0.02, 0.02, 0.025]), img[..., :3])
# catchlights (pontos de luz)
for azc, thc, sz, brilho in ((0.85 * 2 * np.pi, 0.150, 0.045, 1.0), (0.35 * 2 * np.pi, 0.30, 0.022, 0.35)):
    d = np.sqrt(((u - azc + np.pi) % (2 * np.pi) - np.pi) ** 2 + ((theta - thc)) ** 2)
    cl = np.clip(1 - d / sz, 0, 1) ** 2 * brilho
    img[..., :3] = np.clip(img[..., :3] + cl[..., None], 0, 1)

bimg = bpy.data.images.new("iris_ana", width=N, height=N)
bimg.colorspace_settings.name = "sRGB"
bimg.pixels = img.ravel()
bimg.filepath_raw = IRIS_PNG
bimg.file_format = "PNG"
bimg.save()
print(f"[polish] iris salva em {IRIS_PNG}")

# ---- material do olho (gloss Pixar) ----
mat = bpy.data.materials.new("EyePixar")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
texn = mat.node_tree.nodes.new("ShaderNodeTexImage")
texn.image = bimg
mat.node_tree.links.new(texn.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.07
bsdf.inputs["Metallic"].default_value = 0.0
coat = bsdf.inputs.get("Coat Weight") or bsdf.inputs.get("Clearcoat")
if coat: coat.default_value = 1.0
cr = bsdf.inputs.get("Coat Roughness") or bsdf.inputs.get("Clearcoat Roughness")
if cr: cr.default_value = 0.03

# ---- esferas dos olhos (bmesh determinístico, vértices já em coords do mundo) ----
import bmesh as _bmesh

def make_eye_sphere(name, center, R, seg=48, ring=20):
    mesh = bpy.data.meshes.new(name)
    bm = _bmesh.new()
    uvl = bm.loops.layers.uv.new()
    rot_sign = 1.0 if front_sign < 0 else -1.0
    def pos(th, ph):
        # esfera no frame pré-rotação (polo +Z) depois rotacionada p/ frente
        r = R * math.sin(th)
        x, y, z = r * math.cos(ph), r * math.sin(ph), R * math.cos(th)
        if rot_sign > 0:
            return (x, -z, y)   # +90°X: +Z -> -Y
        return (x, z, -y)       # -90°X: +Z -> +Y
    def uv(th, ph):
        u = ((ph % (2 * math.pi)) / (2 * math.pi))
        v = 1.0 - th / math.pi
        return (u, v)
    rows = []
    for i in range(1, ring):
        th = i * math.pi / ring
        row = []
        for j in range(seg):
            ph = j * 2 * math.pi / seg
            p = bm.verts.new(Vector(center) + Vector(pos(th, ph)))
            row.append((p, uv(th, ph)))
        rows.append(row)
    top = bm.verts.new(Vector(center) + Vector(pos(0.0, 0.0)))
    bot = bm.verts.new(Vector(center) + Vector(pos(math.pi, 0.0)))
    def faces_from(quad):
        (a, a2, b2, b) = quad
        bm.faces.new((a, a2, b2, b))
    for j in range(seg):
        jn = (j + 1) % seg
        p1, uv1 = rows[0][j]; p2, uv2 = rows[0][jn]
        f = bm.faces.new((top, p1, p2))
        f.loops[1][uvl].uv = uv1; f.loops[2][uvl].uv = uv2
    for i in range(len(rows) - 1):
        for j in range(seg):
            jn = (j + 1) % seg
            a, uva = rows[i][j]; b, uvb = rows[i][jn]
            c, uvc = rows[i + 1][jn]; d, uvd = rows[i + 1][j]
            f = bm.faces.new((a, b, c, d))
            f.loops[0][uvl].uv = uva; f.loops[1][uvl].uv = uvb
            f.loops[2][uvl].uv = uvc; f.loops[3][uvl].uv = uvd
    for j in range(seg):
        jn = (j + 1) % seg
        p1, uv1 = rows[-1][j]; p2, uv2 = rows[-1][jn]
        f = bm.faces.new((p1, p2, bot))
        f.loops[0][uvl].uv = uv1; f.loops[1][uvl].uv = uv2
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

R = 0.021
bump = -0.0105
for nm, c in centers.items():
    loc = Vector((c[0], c[1] + bump * front_sign, c[2]))
    obj = make_eye_sphere(f"Eye_{nm}", loc, R)
    vs = np.empty((len(obj.data.vertices), 3))
    obj.data.vertices.foreach_get("co", vs.ravel())
    print(f"[polish] DEBUG Eye_{nm} n_verts={len(vs)} bbox_min={np.round(vs.min(axis=0),4).tolist()} bbox_max={np.round(vs.max(axis=0),4).tolist()}")
print("[polish] olhos criados (determinístico)")

# ---- suavização anti-banding (laplaciano nas posições) ----
m_edges = len(main.data.edges)
E = np.empty((m_edges, 2), dtype=np.int32)
main.data.edges.foreach_get("vertices", E.ravel())

def lap_smooth(P, mask, factor, iters):
    for _ in range(iters):
        S = np.zeros_like(P); C = np.zeros(len(P))
        np.add.at(S, E[:, 0], P[E[:, 1]]); np.add.at(C, E[:, 0], 1)
        np.add.at(S, E[:, 1], P[E[:, 0]]); np.add.at(C, E[:, 1], 1)
        avg = S / np.maximum(C, 1)[:, None]
        P = np.where(mask[:, None], P + (avg - P) * factor, P)
    return P

allmask = np.ones(n, dtype=bool)
P = lap_smooth(P, allmask, 0.22, 3)   # global leve (tira listras de voxel)
handmask = (np.abs(P[:, 0]) > 0.155) & (P[:, 2] > 0.78) & (P[:, 2] < 0.965)
print(f"[polish] mãos: {handmask.sum()} verts extra-smooth")
P = lap_smooth(P, handmask, 0.45, 3)  # reforço nas mãos
verts.foreach_set("co", P.ravel())
main.data.update()

# ---- export ----
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True,
                          export_apply=True, export_image_format="WEBP", export_image_quality=100)
print(f"[polish] exportado: {OUT}")
