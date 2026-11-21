"""Convert own Mixamo FBX to GLB skin only. Blender --python ... -- source.fbx new.glb."""
import bpy, sys, json
from pathlib import Path
source, output = [Path(p).resolve() for p in sys.argv[sys.argv.index('--') + 1:]]
if output.exists() or source == output:
    raise RuntimeError('Choose a new output; preserve source/candidates')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source), use_anim=False)
arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if len(arms) != 1 or not meshes:
    raise RuntimeError('Expected own character meshes and exactly one armature')
for obj in meshes:
    if not any(m.type == 'ARMATURE' and m.object == arms[0] for m in obj.modifiers):
        raise RuntimeError('Mesh missing own armature modifier')
    if any(not any(g.weight > 0 for g in v.groups) for v in obj.data.vertices):
        raise RuntimeError('Unweighted vertices; candidate requires repair')
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True,
                          export_animations=False, export_skins=True, export_apply=False)
report = {'status': 'skin-only-not-motion-QA-approved', 'source': str(source),
          'output': str(output), 'bones': len(arms[0].data.bones),
          'meshes': len(meshes), 'faces': sum(len(o.data.polygons) for o in meshes)}
output.with_suffix('.skin-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
