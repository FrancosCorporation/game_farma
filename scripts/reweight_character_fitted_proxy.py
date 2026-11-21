#!/usr/bin/env python3
"""Solve weights on a fitted same-character voxel proxy; interpolate its surface.
Usage: blender -b --python scripts/reweight_character_fitted_proxy.py -- input.glb output.weights [voxel=.008] [max_distance=.06]
"""
import bpy, sys, os, re, math, json, struct, hashlib, bmesh
from mathutils.bvhtree import BVHTree
from mathutils import kdtree

MAGIC = b'FARMAW1\0'
RECORD = struct.Struct('<4H4f')

def bake(obj, matrix):
    obj.parent = None
    obj.matrix_world = matrix.copy()
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

def top4(values):
    items = sorted(((name, weight) for name, weight in values.items() if weight > 1e-8), key=lambda x: (-x[1], x[0]))[:4]
    total = sum(w for _, w in items)
    if not math.isfinite(total) or total <= 0: raise ValueError('No finite normalized influences')
    return [(name, w/total) for name, w in items]

def deform_ancestor(rig, name):
    bone=rig.data.bones.get(name)
    while bone and not bone.use_deform: bone=bone.parent
    return bone.name if bone else None

def main():
    args = sys.argv[sys.argv.index('--')+1:]
    if len(args) not in (2,3,4): raise SystemExit(__doc__)
    source, output = map(os.path.abspath,args[:2])
    voxel = float(args[2]) if len(args)>2 else .008
    maximum = float(args[3]) if len(args)>3 else .06
    if os.path.exists(output): raise SystemExit('Output exists')
    if not .006 <= voxel <= .04 or not .01 <= maximum <= .12: raise SystemExit('Invalid dimensions')
    digest = hashlib.sha256(open(source,'rb').read()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    rigs = [o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    meshes = [o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
    if len(rigs)!=1 or len(meshes)!=1: raise SystemExit('Expected exactly one rig and mesh')
    arm, mesh = rigs[0], meshes[0]
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    if len(arm.data.bones)!=65: raise SystemExit('Expected 65 bones')
    old_names = {g.index:g.name for g in mesh.vertex_groups}
    old = [{old_names[e.group]:e.weight for e in v.groups if e.weight>1e-8} for v in mesh.data.vertices]
    rig = arm.copy(); rig.data=arm.data.copy(); bpy.context.collection.objects.link(rig)
    rig.animation_data_clear(); rig.data.pose_position='REST'; bake(rig,arm.matrix_world)
    skipped = []
    for bone in rig.data.bones:
        if bone.name.endswith('_End') or re.search(r'(Left|Right)Hand(Pinky|Ring|Middle|Index|Thumb)[1-4]$',bone.name):
            bone.use_deform=False; skipped.append(bone.name)
    target = mesh.copy(); target.data=mesh.data.copy(); bpy.context.collection.objects.link(target)
    bake(target,mesh.matrix_world)
    for m in list(target.modifiers): target.modifiers.remove(m)
    proxy = target.copy(); proxy.data=target.data.copy(); bpy.context.collection.objects.link(proxy)
    proxy.name='FittedWeightProxy'; proxy.vertex_groups.clear()
    proxy.data.remesh_voxel_size=voxel; proxy.data.remesh_voxel_adaptivity=0
    bpy.ops.object.select_all(action='DESELECT'); proxy.select_set(True); bpy.context.view_layer.objects.active=proxy
    bpy.ops.object.voxel_remesh()
    bm=bmesh.new(); bm.from_mesh(proxy.data); bmesh.ops.triangulate(bm,faces=list(bm.faces)); bm.to_mesh(proxy.data); bm.free()
    if not 500<=len(proxy.data.vertices)<=150000: raise SystemExit('Proxy density out of bounds: '+str(len(proxy.data.vertices)))
    print('[proxy]',len(proxy.data.vertices),'vertices; disabled',len(skipped),'endpoint/finger bones',flush=True)
    bpy.ops.object.select_all(action='DESELECT'); proxy.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active=rig
    result=bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    if 'FINISHED' not in result: raise SystemExit('Bone heat failed: '+str(result))
    bpy.context.view_layer.objects.active=proxy
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
    names={g.index:g.name for g in proxy.vertex_groups}
    source_tree=kdtree.KDTree(len(target.data.vertices))
    for source_vertex in target.data.vertices:
        source_tree.insert(target.matrix_world@source_vertex.co,source_vertex.index)
    source_tree.balance()
    header_fallback_count=0; header_fallback_max=0.0; header_fallback_remaps={}
    weights=[]
    for v in proxy.data.vertices:
        row={names[e.group]:e.weight for e in v.groups if e.weight>1e-8}
        total=sum(row.values())
        if not math.isfinite(total): raise SystemExit('Non-finite proxy weights at vertex '+str(v.index))
        if total<=1e-8:
            # Blender heat weighting may skip a tiny disconnected island. Use
            # the nearest already weighted source vertex only for this local
            # zero-weight case, and only within two voxel widths; never fill a
            # broad or distant hole silently.
            point=proxy.matrix_world@v.co
            _,source_index,distance=source_tree.find(point)
            if distance>voxel*2: raise SystemExit('Zero-weight proxy island is too far from source surface at '+str(v.index)+': '+str(distance))
            fallback={}
            for source_name,source_weight in old[source_index].items():
                name=source_name
                if proxy.vertex_groups.get(name) is None:
                    name=deform_ancestor(rig,name)
                    if not name: raise SystemExit('Fallback source bone has no deform ancestor: '+source_name)
                    header_fallback_remaps[source_name]=header_fallback_remaps.get(source_name,0)+1
                fallback[name]=fallback.get(name,0)+source_weight
            if not fallback: raise SystemExit('Nearest source vertex has no weights at proxy '+str(v.index))
            for name,weight in top4(fallback):
                if proxy.vertex_groups.get(name) is None: raise SystemExit('Fallback source bone is absent from proxy rig: '+name)
                proxy.vertex_groups[name].add([v.index],weight,'REPLACE')
            row={names[e.group]:e.weight for e in proxy.data.vertices[v.index].groups if e.weight>1e-8}
            total=sum(row.values())
            header_fallback_count+=1
            header_fallback_max=max(header_fallback_max,distance)
        if abs(total-1)>1e-3: raise SystemExit('Unweighted proxy vertex '+str(v.index)+': '+str(total))
        weights.append(row)
    coords=[proxy.matrix_world@v.co for v in proxy.data.vertices]
    proxy.data.calc_loop_triangles()
    triangles=[tuple(t.vertices) for t in proxy.data.loop_triangles]
    bvh=BVHTree.FromPolygons(coords,triangles,all_triangles=True)
    joint_names=[b.name for b in rig.data.bones]; joint_index={name:i for i,name in enumerate(joint_names)}
    records=bytearray(); distances=[]; cache={}; preserved=0; duplicate_count=0
    preserve=re.compile(r'(Left|Right)(Leg|Foot|ToeBase|Toe_End|Hand.*)$')
    for v in target.data.vertices:
        point=target.matrix_world@v.co
        key=tuple(round(x,7) for x in point)
        if key in cache:
            influences,distance=cache[key]; duplicate_count+=1
        else:
            nearest,_,face,distance=bvh.find_nearest(point)
            if nearest is None or not math.isfinite(distance) or distance>maximum: raise SystemExit('Surface transfer distance exceeded at '+str(v.index)+': '+str(distance))
            tri=triangles[face]; a,b,c=(coords[i] for i in tri)
            e0,e1,p=b-a,c-a,nearest-a
            d00,d01,d11=e0.dot(e0),e0.dot(e1),e1.dot(e1)
            den=d00*d11-d01*d01
            if abs(den)<1e-18:
                closest=min(tri,key=lambda i:(coords[i]-nearest).length_squared)
                combined=weights[closest].copy()
            else:
                vb=(d11*p.dot(e0)-d01*p.dot(e1))/den
                wc=(d00*p.dot(e1)-d01*p.dot(e0))/den
                bary=[max(0,min(1,x)) for x in (1-vb-wc,vb,wc)]; total=sum(bary); bary=[x/total for x in bary]
                combined={}
                for i,factor in zip(tri,bary):
                    for name,w in weights[i].items(): combined[name]=combined.get(name,0)+factor*w
            dominant=max(old[v.index].items(),key=lambda x:x[1],default=('',0))
            if dominant[1]>=.35 and preserve.search(dominant[0]): combined=old[v.index].copy(); preserved+=1
            influences=top4(combined); cache[key]=(influences,distance)
        ids=[joint_index[n] for n,w in influences]; values=[w for n,w in influences]
        if any(not math.isfinite(w) or w<0 for w in values): raise SystemExit('Invalid weight')
        ids += [0]*(4-len(ids)); values += [0.]*(4-len(values))
        records.extend(RECORD.pack(*ids,*values)); distances.append(distance)
    distances.sort(); q=lambda p:distances[int((len(distances)-1)*p)]
    header={'format':'farmacheck-weight-sidecar-v1','sourceSha256':digest,'vertexCount':len(target.data.vertices),'jointNames':joint_names,'recordBytes':24,
            'voxelSizeMeters':voxel,'transferDistanceMeters':{'p50':q(.5),'p95':q(.95),'max':distances[-1]},'preservedLowerLegHandVertices':preserved,
            'coincidentCopies':duplicate_count,'maxCoincidentWeightDifference':0,'disabledHeatBones':skipped,
            'zeroWeightIslandFallbackVertices':header_fallback_count,'zeroWeightIslandFallbackMaxDistanceMeters':header_fallback_max,
            'zeroWeightIslandFallbackBoneRemaps':header_fallback_remaps}
    data=json.dumps(header,separators=(',',':')).encode()
    os.makedirs(os.path.dirname(output),exist_ok=True)
    with open(output,'xb') as f: f.write(MAGIC); f.write(struct.pack('<I',len(data))); f.write(data); f.write(records)
    print('[sidecar]',json.dumps(header),flush=True)

if __name__=='__main__': main()
