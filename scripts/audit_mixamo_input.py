"""Read-only static mesh audit for Mixamo staging, run with Blender --python ... -- output.json inputs..."""
import bpy, bmesh, sys, json, math
from pathlib import Path

def geometry(bm):
    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    unseen=set(bm.verts); components=[]
    while unseen:
        seed=unseen.pop(); stack=[seed]; verts=[seed]; faces=set()
        while stack:
            v=stack.pop(); faces.update(v.link_faces)
            for e in v.link_edges:
                n=e.other_vert(v)
                if n in unseen: unseen.remove(n); stack.append(n); verts.append(n)
        components.append({'vertices':len(verts),'faces':len(faces),
          'min':[min(v.co[i] for v in verts) for i in range(3)],
          'max':[max(v.co[i] for v in verts) for i in range(3)]})
    components.sort(key=lambda c:c['vertices'],reverse=True)
    return {'vertices':len(bm.verts),'faces':len(bm.faces),'components':len(components),
      'topComponents':components[:10],
      'boundaryEdges':sum(e.is_boundary for e in bm.edges),
      'wireEdges':sum(e.is_wire for e in bm.edges),
      'overconnectedEdges':sum(len(e.link_faces)>2 for e in bm.edges),
      'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),
      'inconsistentWindingEdges':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
      'zeroAreaFaces':sum(f.calc_area()<=1e-16 for f in bm.faces),
      'nonFiniteVertices':sum(any(not math.isfinite(x) for x in v.co) for v in bm.verts)}

def audit(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext=path.suffix.lower()
    if ext=='.fbx': bpy.ops.import_scene.fbx(filepath=str(path),use_anim=False)
    elif ext in ('.glb','.gltf'): bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext=='.obj': bpy.ops.wm.obj_import(filepath=str(path))
    else: raise ValueError(f'Unsupported format: {ext}')
    objects=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':
            objects.append({'name':obj.name,'type':obj.type}); continue
        bm=bmesh.new();bm.from_mesh(obj.data); bmesh.ops.transform(bm,matrix=obj.matrix_world,verts=list(bm.verts))
        native=geometry(bm)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        welded=geometry(bm);bm.free()
        objects.append({'name':obj.name,'type':'MESH','location':list(obj.location),
         'rotation':list(obj.rotation_euler),'scale':list(obj.scale),'native':native,
         'virtualWeld1um':welded})
    return {'source':str(path),'objects':objects}

out,*inputs=sys.argv[sys.argv.index('--')+1:]
if not inputs: raise ValueError('Supply output.json and one or more inputs')
results=[audit(Path(p).resolve()) for p in inputs]
Path(out).write_text(json.dumps(results,indent=2))
for a in results:
    for o in a['objects']:
        if o['type']=='MESH': print(Path(a['source']).name,o['name'],json.dumps({k:v for k,v in o['virtualWeld1um'].items() if k!='topComponents'}))
