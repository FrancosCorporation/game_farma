# Gera personagens do elenco (.glb) — FarmaCheck G2/G3
# Uso: blender -b --python gen_characters.py -- --out /home/servidor/Git/game_farma/public/models
# Hierarquia de partes (pelvis→torso→head/arms, pelvis→legs) animada por Actions
# nomeados EXATAMENTE conforme o poseMap do jogo: Idle, Pain, Weakness, Discomfort, Embarrassed.
# Personagem de frente para -Y (no glTF vira +Z → olha para a câmera do jogo).
import bpy, sys, math, struct, json
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 2:] if '--' in sys.argv else []
OUT = argv[argv.index('--out') + 1] if '--out' in argv else '/home/servidor/Git/game_farma/public/models'

def clean():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.actions):
        for b in list(coll):
            if b.users == 0:
                try:
                    coll.remove(b)
                except Exception:
                    pass

def C(h):
    return ((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255)

_MATS = {}
def mat(name, color, rough=0.6):
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
    return m

def cyl(name, r, h, x, y, z, m, sx=1.0, sy=1.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=16, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, 1.0)
    o.data.materials.append(m)
    return o

def sph(name, r, x, y, z, m, sx=1.0, sy=1.0, sz=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=16, ring_count=12, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, sz)
    o.data.materials.append(m)
    return o

def box(name, w, d, h, x, y, z, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    o.data.materials.append(m)
    return o

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj

def pivot_to(obj, pivot):
    off = obj.location - Vector(pivot)
    obj.data.transform(Matrix.Translation(off))
    obj.location = Vector(pivot)
    obj.scale = (1, 1, 1)

def parent(obj, parent_obj):
    obj.parent = parent_obj
    obj.matrix_parent_inverse = parent_obj.matrix_world.inverted()

ANIMATED = ('torso', 'head', 'armL', 'armR', 'legL', 'legR')

def build_character(cfg):
    clean()
    skin = mat('skin', C(cfg['skin']), 0.55)
    hair = mat('hair', C(cfg['hair']), 0.8)
    shirt = mat('shirt', C(cfg['shirt']), 0.65)
    pants = mat('pants', C(cfg['pants']), 0.7)
    shoe = mat('shoe', C(0x22262a), 0.45)
    female = cfg.get('f', False)
    ax = 0.225 if female else 0.245

    parts = {}
    # pelvis (raiz, estática) — pivô no chão
    p = [sph('p_hips', 0.16, 0, 0, 0.95, pants, sx=1.15 if female else 1.05, sy=0.85, sz=0.72)]
    pelvis = join(p, 'pelvis')
    pivot_to(pelvis, (0, 0, 0.0))
    parts['pelvis'] = pelvis

    # pernas — pivô no quadril
    for side, key in ((1, 'legL'), (-1, 'legR')):
        leg = [cyl(f'l_{key}', 0.075, 0.78, side * 0.105, 0, 0.47, pants),
               box(f'b_{key}', 0.11, 0.24, 0.07, side * 0.105, -0.06, 0.035, shoe)]
        obj = join(leg, key)
        pivot_to(obj, (side * 0.105, 0, 0.86))
        parts[key] = obj

    # torso — pivô no quadril (dobra para frente = X negativo)
    t = [cyl('t_chest', 0.175, 0.44, 0, 0, 1.17, shirt),
         sph('t_up', 0.175, 0, 0, 1.33, shirt, sy=0.85, sz=0.8)]
    if female:
        t.append(sph('t_chest2', 0.13, 0, -0.07, 1.28, shirt, sy=0.8, sz=0.7))
    torso = join(t, 'torso')
    pivot_to(torso, (0, 0, 0.95))
    parts['torso'] = torso

    # cabeça — pivô no pescoço
    h = [sph('h_skull', 0.145, 0, 0, 1.60, skin),
         sph('h_nose', 0.024, 0, -0.13, 1.585, skin),
         sph('h_jaw', 0.09, 0, -0.03, 1.52, skin, sz=0.7)]
    style = cfg.get('hair_style', 'long' if female else 'short')
    if style == 'long':
        h += [sph('h_cap', 0.155, 0, 0.015, 1.625, hair, sy=1.05, sz=0.8),
              box('h_back', 0.22, 0.07, 0.42, 0, 0.09, 1.40, hair)]
    elif style == 'bun':
        h += [sph('h_cap', 0.155, 0, 0.015, 1.625, hair, sy=1.05, sz=0.78),
              sph('h_bun', 0.065, 0, 0.05, 1.74, hair)]
    else:
        h.append(sph('h_cap', 0.152, 0, 0.015, 1.63, hair, sy=1.02, sz=0.72))
    head = join(h, 'head')
    pivot_to(head, (0, 0, 1.47))
    parts['head'] = head

    # braços — pivô no ombro (mesh pende para baixo; levantar à frente = X negativo)
    for side, key in ((1, 'armL'), (-1, 'armR')):
        a = [cyl(f'a_{key}', 0.055, 0.40, side * ax, 0, 1.18, shirt),
             cyl(f'f_{key}', 0.048, 0.18, side * ax, 0, 1.02, skin),
             sph(f'hand_{key}', 0.052, side * ax, 0, 0.95, skin)]
        obj = join(a, key)
        pivot_to(obj, (side * ax, 0, 1.38))
        parts[key] = obj

    parent(parts['torso'], parts['pelvis'])
    parent(parts['head'], parts['torso'])
    parent(parts['armL'], parts['torso'])
    parent(parts['armR'], parts['torso'])
    parent(parts['legL'], parts['pelvis'])
    parent(parts['legR'], parts['pelvis'])
    return parts

# ---------- Poses (loops; X negativo = dobrar para frente) ----------
def p_idle(t):
    w = math.sin(2 * math.pi * t)
    return {
        'torso': (0.025 + 0.015 * w, 0, 0),
        'head': (0.04 + 0.012 * w, 0.02 * math.sin(2 * math.pi * t + 1.3), 0),
        'armL': (0.06 + 0.02 * w, 0, 0.10),
        'armR': (0.06 + 0.02 * w, 0, -0.10),
        'legL': (0, 0, 0.012),
        'legR': (0, 0, -0.012),
    }

def p_pain(t):  # mao_no_peito: mão direita no peito + leve tremor
    trem = 0.035 * math.sin(4 * math.pi * t)
    return {
        'torso': (-0.06, 0, 0),
        'head': (-0.15, 0, 0),
        'armL': (0.10, 0, 0.12),
        'armR': (-1.55 + trem, 0, -0.55),
        'legL': (0, 0, 0.01),
        'legR': (0, 0, -0.01),
    }

def p_weakness(t):  # curvado: tronco dobrado, braços pendentes
    sway = 0.025 * math.sin(2 * math.pi * t)
    return {
        'torso': (-0.42 + sway, 0, 0),
        'head': (-0.28, 0, 0),
        'armL': (-0.15, 0, 0.08),
        'armR': (-0.15, 0, -0.08),
        'legL': (0, 0, 0.02),
        'legR': (0, 0, -0.02),
    }

def p_discomfort(t):  # cabeca_baixa: cabeça caída, ombros caídos
    return {
        'torso': (-0.10, 0, 0.02),
        'head': (-0.52 + 0.02 * math.sin(2 * math.pi * t), 0, 0.06),
        'armL': (0.05, 0, 0.04),
        'armR': (0.05, 0, -0.04),
        'legL': (0, 0, 0.008),
        'legR': (0, 0, -0.008),
    }

def p_embarrassed(t):  # mão no rosto/pescoço, cabeça baixa de lado
    return {
        'torso': (-0.05, 0, 0),
        'head': (-0.38, 0, 0.14),
        'armL': (0.08, 0, 0.14),
        'armR': (-2.35, 0, -0.45),
        'legL': (0, 0, 0.01),
        'legR': (0, 0, -0.01),
    }

ACTIONS = [('Idle', p_idle, 9, 96), ('Pain', p_pain, 7, 72), ('Weakness', p_weakness, 7, 72),
           ('Discomfort', p_discomfort, 7, 72), ('Embarrassed', p_embarrassed, 7, 72)]

def slot_for(act, obj):
    try:
        for s in act.slots:
            if getattr(s, 'target_id_type', '') == 'OBJECT':
                if getattr(s, 'name', '') == obj.name or getattr(s, 'name_display', '') == obj.name:
                    return s
        if hasattr(act.slots, 'new'):
            return act.slots.new(id_type='OBJECT', name=obj.name)
        return act.slots[0]
    except Exception:
        return None

def make_action(parts, name, pose_fn, n_keys, dur):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    frames = [1 + round(i * dur / (n_keys - 1)) for i in range(n_keys)]
    for pname in ANIMATED:
        obj = parts[pname]
        ad = obj.animation_data_create()
        ad.action = act
        try:
            ad.action_slot = None  # keyframe_insert auto-atribui o slot correto (Blender 4.4+)
        except Exception:
            pass
        for i, f in enumerate(frames):
            obj.rotation_euler = pose_fn(i / (n_keys - 1))[pname]
            obj.keyframe_insert('rotation_euler', frame=f)
        # stash em NLA (mantém a action viva no export; slot já auto-atribuído acima)
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 1, act)
        try:
            st.action_slot = ad.action_slot
        except Exception:
            pass
        ad.action = None


def glb_anim_names(path):
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'glTF':
        return []
    ln = struct.unpack('<I', data[12:16])[0]
    return [c.get('name', '') for c in json.loads(data[20:20 + ln]).get('animations', [])]

def export_character(parts, cfg):
    out = f"{OUT}/{cfg['id']}.glb"
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts.values():
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts['pelvis']
    # Blender 5.x: action ATIVA atribuída ao objeto é requisito para o exporter
    # incluir as actions (com fake user) como clips nomeados no GLB.
    for pname in ANIMATED:
        parts[pname].animation_data.action = bpy.data.actions['Idle']
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                              export_animation_mode='ACTIONS')
    with open(out, 'rb') as f:
        d = f.read()
    names = glb_anim_names(out)
    if all(a in names for a, _, _, _ in ACTIONS):
        print(f"OK {cfg['id']}.glb clips={names}")
    else:
        print(f"AVISO {cfg['id']}: clips={names}")

CHARACTERS = [
    dict(id='carla_dengue', f=True, skin=0xd9a066, hair=0x1a1a1a, hair_style='long', shirt=0x2ec4b6, pants=0x37414b),
    dict(id='roberto_dispepsia', skin=0xe8b48c, hair=0x2e2a25, hair_style='short', shirt=0xd7d3cb, pants=0x3d5a80),
    dict(id='catia_dermatite', f=True, skin=0xf1c9a5, hair=0x6b4a2f, hair_style='bun', shirt=0xf28f3b, pants=0x57534e),
    dict(id='nelson_infarto', skin=0xe8b48c, hair=0x9a9a9a, hair_style='short', shirt=0x8d99ae, pants=0x4b4e57),
    dict(id='marina_amoxicilina', f=True, skin=0xf1c9a5, hair=0x1f1a17, hair_style='long', shirt=0x74c69d, pants=0x37414b),
    dict(id='jose_gripe', skin=0xd9a066, hair=0x8a7f6d, hair_style='short', shirt=0xb08968, pants=0x4b4e57),
    dict(id='ana_coriza', f=True, skin=0xe8b48c, hair=0x4a3728, hair_style='long', shirt=0x9fd8ff, pants=0x57534e),
    dict(id='clara_cefaleia', f=True, skin=0xd9a066, hair=0x23140e, hair_style='long', shirt=0xe07a5f, pants=0x2f3e46),
    dict(id='paulo_dor_lombar', skin=0xb87a4b, hair=0x1f1a17, hair_style='short', shirt=0x6d9dc5, pants=0x37414b),
    dict(id='joao_queimacao', skin=0xf1c9a5, hair=0x3f3a34, hair_style='short', shirt=0xd7d3cb, pants=0x4b4e57),
    dict(id='helena_avc', f=True, skin=0xf1c9a5, hair=0xcfcfcf, hair_style='bun', shirt=0xcdb4db, pants=0x57534e),
    dict(id='dona_rosa_hipotensao', f=True, skin=0xe8b48c, hair=0xd8d3cb, hair_style='bun', shirt=0xffc8dd, pants=0x57534e),
    dict(id='carlos_asma', skin=0x8d5a3a, hair=0x14100c, hair_style='short', shirt=0x2ec4b6, pants=0x37414b),
    dict(id='bia_apendicite', f=True, skin=0xd9a066, hair=0x2e2a25, hair_style='long', shirt=0xffd166, pants=0x3d5a80),
    dict(id='paciente', skin=0xd9a066, hair=0x2e2a25, hair_style='short', shirt=0x8b8378, pants=0x37414b),
]

import os
ONLY=os.environ.get('ONLY')
if ONLY: CHARACTERS=[c for c in CHARACTERS if c['id']==ONLY]
for cfg in CHARACTERS:
    parts = build_character(cfg)
    for name, pose_fn, n_keys, dur in ACTIONS:
        make_action(parts, name, pose_fn, n_keys, dur)
    export_character(parts, cfg)
print('CHARACTERS OK →', OUT)


