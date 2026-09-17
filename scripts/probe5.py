import bpy, sys
from mathutils import Vector

# probe 1: sinal de rotation_euler.x — para onde vai o "topo" (0,0,1)?
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1))
o = bpy.context.object
o.rotation_euler = (0.5, 0, 0)
bpy.context.view_layer.update()
top = o.matrix_world @ Vector((0, 0, 0.5))
print("PROBE_X_ROT top_y=%.3f (positivo = +Y atras; -Y = frente)" % top.y)

# probe 2: shade ops disponiveis
bpy.ops.object.shade_smooth()
print("PROBE_SHADE smooth_use_auto=%s" % getattr(o.data, "use_auto_smooth", "AUSENTO"))
try:
    bpy.ops.object.shade_auto_smooth()
    print("PROBE_SHADE_AUTO ok")
except Exception as e:
    print("PROBE_SHADE_AUTO falhou: %s" % str(e).split("\n")[0])

# probe 3: boolean modifier (para soquete ocular)
bpy.ops.mesh.primitive_cube_add(size=1, location=(2, 0, 0))
a = bpy.context.object
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.3, location=(2, 0, 0))
b = bpy.context.object
mod = a.modifiers.new("b", 'BOOLEAN')
mod.operation = 'DIFFERENCE'
mod.object = b
try:
    bpy.context.view_layer.objects.active = a
    bpy.ops.object.modifier_apply(modifier="b")
    print("PROBE_BOOL ok verts=%d" % len(a.data.vertices))
except Exception as e:
    print("PROBE_BOOL falhou: %s" % str(e).split("\n")[0])

# probe 4: material alpha no Principled v1/v2
m = bpy.data.materials.new("t")
m.use_nodes = True
bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
alpha_input = bsdf.inputs.get('Alpha')
print("PROBE_ALPHA alpha_input=%s" % (alpha_input is not None))
print("PROBE_DONE")
