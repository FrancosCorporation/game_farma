#!/usr/bin/env python3
"""Read-only topology/geometry audit for imported humanoid GLB/FBX meshes.

Usage:
  blender -b --python scripts/audit_character_mesh.py -- candidate.glb
  blender -b --python scripts/audit_character_mesh.py -- candidate.fbx

This reports structural warning counts; it never repairs or exports the asset.
Open surfaces and disconnected components can be intentional, so interpret the
counts together with the neutral-pose render and the character's construction.
"""
import json
import hashlib
import math
import os
import struct
import sys

import bmesh
import bpy
from mathutils import kdtree, Vector


def audit_mesh(obj):
    mesh = obj.data
    position_hash = hashlib.sha256()
    for vertex in mesh.vertices:
        position_hash.update(struct.pack('<3f', *vertex.co))
    triangle_keys = sorted(
        tuple(sorted(polygon.vertices)) for polygon in mesh.polygons
        if len(polygon.vertices) == 3
    )
    topology_hash = hashlib.sha256()
    for triangle in triangle_keys:
        topology_hash.update(struct.pack('<3I', *triangle))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    world_points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    if world_points:
        minimum = [min(point[axis] for point in world_points) for axis in range(3)]
        maximum = [max(point[axis] for point in world_points) for axis in range(3)]
        diagonal = (Vector(maximum) - Vector(minimum)).length
    else:
        diagonal = 0.0
    area_epsilon = max(diagonal * diagonal * 1e-12, 1e-14)
    duplicate_epsilon = max(diagonal * 1e-7, 1e-8)

    face_keys = set()
    duplicate_faces = 0
    for polygon in mesh.polygons:
        key = tuple(sorted(polygon.vertices))
        if key in face_keys:
            duplicate_faces += 1
        else:
            face_keys.add(key)

    parent = list(range(len(mesh.vertices)))
    rank = [0] * len(parent)

    def find(vertex):
        while parent[vertex] != vertex:
            parent[vertex] = parent[parent[vertex]]
            vertex = parent[vertex]
        return vertex

    for edge in mesh.edges:
        left, right = edge.vertices
        root_left, root_right = find(left), find(right)
        if root_left == root_right:
            continue
        if rank[root_left] < rank[root_right]:
            root_left, root_right = root_right, root_left
        parent[root_right] = root_left
        if rank[root_left] == rank[root_right]:
            rank[root_left] += 1
    component_sizes = {}
    for vertex in range(len(parent)):
        root = find(vertex)
        component_sizes[root] = component_sizes.get(root, 0) + 1

    tree = kdtree.KDTree(len(world_points))
    for index, point in enumerate(world_points):
        tree.insert(point, index)
    tree.balance()
    coincident_pairs = 0
    for index, point in enumerate(world_points):
        coincident_pairs += sum(
            1 for _, other, _ in tree.find_range(point, duplicate_epsilon)
            if other > index
        )

    invalid_vertices = sum(
        1 for vertex in mesh.vertices
        if not all(math.isfinite(component) for component in vertex.co)
    )
    group_names = {group.index: group.name for group in obj.vertex_groups}
    group_bounds = {}
    for vertex, point in zip(mesh.vertices, world_points):
        for entry in vertex.groups:
            name = group_names.get(entry.group, '')
            if entry.weight < 0.1 or not any(token in name.lower() for token in ('foot', 'toe', 'leg')):
                continue
            stats = group_bounds.setdefault(name, {'count': 0, 'minWorld': [float('inf')] * 3,
                                                   'maxWorld': [float('-inf')] * 3})
            stats['count'] += 1
            for axis in range(3):
                stats['minWorld'][axis] = min(stats['minWorld'][axis], point[axis])
                stats['maxWorld'][axis] = max(stats['maxWorld'][axis], point[axis])
    result = {
        'mesh': obj.name,
        'positionSha256LocalFloat32': position_hash.hexdigest(),
        'triangleTopologySha256': topology_hash.hexdigest(),
        'parent': obj.parent.name if obj.parent else None,
        'worldLocation': [round(value, 6) for value in obj.matrix_world.translation],
        'worldScale': [round(value, 6) for value in obj.matrix_world.to_scale()],
        'worldBoundsMin': [round(value, 6) for value in minimum] if world_points else None,
        'worldBoundsMax': [round(value, 6) for value in maximum] if world_points else None,
        'vertexGroups': len(obj.vertex_groups),
        'lowerBodyWeightBoundsWeightAtLeast0_1': {
            name: {
                'count': stats['count'],
                'minWorld': [round(value, 6) for value in stats['minWorld']],
                'maxWorld': [round(value, 6) for value in stats['maxWorld']],
            }
            for name, stats in sorted(group_bounds.items())
        },
        'materials': [slot.material.name if slot.material else None for slot in obj.material_slots],
        'armatureModifiers': [
            modifier.object.name if modifier.type == 'ARMATURE' and modifier.object else None
            for modifier in obj.modifiers if modifier.type == 'ARMATURE'
        ],
        'hideRender': obj.hide_render,
        'hideViewport': obj.hide_viewport,
        'vertices': len(mesh.vertices),
        'edges': len(mesh.edges),
        'faces': len(mesh.polygons),
        'triangles': sum(1 for polygon in mesh.polygons if len(polygon.vertices) == 3),
        'degenerateFaces': sum(1 for polygon in mesh.polygons if polygon.area <= area_epsilon),
        'duplicateFaces': duplicate_faces,
        'nonFiniteVertices': invalid_vertices,
        'looseVertices': sum(1 for vertex in bm.verts if not vertex.link_edges),
        'boundaryEdges': sum(1 for edge in bm.edges if edge.is_boundary),
        'wireEdges': sum(1 for edge in bm.edges if edge.is_wire),
        'nonManifoldEdges': sum(1 for edge in bm.edges if not edge.is_manifold),
        'inconsistentWindingEdges': sum(
            1 for edge in bm.edges if edge.is_manifold and not edge.is_contiguous
        ),
        'coincidentVertexPairs': coincident_pairs,
        'componentCount': len(component_sizes),
        'largestComponents': sorted(component_sizes.values(), reverse=True)[:10],
        'boundsDiagonalWorld': round(diagonal, 6),
    }
    bm.free()
    return result


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) != 1:
    raise SystemExit('Passe um GLB depois de --.')
path = os.path.abspath(argv[0])
extension = os.path.splitext(path)[1].lower()
if not os.path.isfile(path) or extension not in ('.glb', '.fbx'):
    raise SystemExit(f'Arquivo ausente/inválido (esperado GLB ou FBX): {path}')

mesh_node_names = None
if extension == '.glb':
    with open(path, 'rb') as stream:
        glb = stream.read()
    if glb[:4] != b'glTF' or len(glb) < 20:
        raise SystemExit(f'Cabeçalho GLB inválido: {path}')
    json_length = struct.unpack_from('<I', glb, 12)[0]
    gltf = json.loads(glb[20:20 + json_length].decode('utf-8'))
    mesh_node_names = {
        node.get('name') for node in gltf.get('nodes', [])
        if node.get('name') and 'mesh' in node
    }

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path) if extension == '.glb' else bpy.ops.import_scene.fbx(filepath=path)
imported_meshes = [
    obj for obj in bpy.context.scene.objects
    if obj.type == 'MESH' and (mesh_node_names is None or obj.name in mesh_node_names)
]
meshes = [audit_mesh(obj) for obj in imported_meshes]
print(json.dumps({
    'file': path,
    'gltfMeshNodeNames': sorted(mesh_node_names) if mesh_node_names is not None else None,
    'meshes': meshes,
}, ensure_ascii=False, indent=2), flush=True)
