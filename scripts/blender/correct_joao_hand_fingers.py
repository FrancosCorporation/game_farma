"""Create isolated fifth-digit corrective candidates from a Mixamo 57-joint rig.

The Hunyuan source and its 30k LOD each have three long fingers plus a thumb.
This operation duplicates the existing ring-finger surface, shortens it, and
places it on the outer edge of each hand. The added digits follow the hand bone
because Mixamo's 57-joint profile has no pinky bones. Inputs are never changed.

Run with Blender:
  blender --background --factory-startup --python scripts/blender/correct_joao_hand_fingers.py -- \
    <walkidle-v002.glb> <walkidle-v003.glb> <source-500k.glb> <source-candidate.glb> \
  <lod-30k.glb> <lod-candidate.glb> [legacy_z_band|all_ring_faces] [rootShiftMm=4] [tipShiftMm=28]
"""

import bpy
import json
import os
import struct
import sys
from collections import defaultdict
from mathutils import Vector


def log(*items):
    print('[hand-digit]', *items, flush=True)


def parse_glb(path):
    with open(path, 'rb') as stream:
        blob = stream.read()
    if blob[:4] != b'glTF':
        raise RuntimeError(f'not a GLB: {path}')
    total = struct.unpack_from('<I', blob, 8)[0]
    offset = 12
    chunks = []
    gltf = None
    while offset < total:
        size, kind = struct.unpack_from('<II', blob, offset)
        start = offset + 8
        data = blob[start:start + size]
        if kind == 0x4E4F534A:
            gltf = json.loads(data.decode('utf-8').strip())
        chunks.append((kind, data))
        offset = start + size
    if gltf is None:
        raise RuntimeError(f'GLB JSON chunk missing: {path}')
    return gltf, chunks


def copy_asset_extras(source, target):
    source_json, _ = parse_glb(source)
    target_json, chunks = parse_glb(target)
    extras = source_json.get('asset', {}).get('extras')
    if not isinstance(extras, dict):
        raise RuntimeError('source animation metadata is missing')
    target_json.setdefault('asset', {})['extras'] = extras
    json_data = json.dumps(target_json, separators=(',', ':')).encode('utf-8')
    json_data += b' ' * ((4 - len(json_data) % 4) % 4)
    chunks[0] = (0x4E4F534A, json_data)
    total = 12 + sum(8 + len(data) for _, data in chunks)
    output = bytearray(total)
    output[:4] = b'glTF'
    struct.pack_into('<II', output, 4, 2, total)
    offset = 12
    for kind, data in chunks:
        struct.pack_into('<II', output, offset, len(data), kind)
        output[offset + 8:offset + 8 + len(data)] = data
        offset += 8 + len(data)
    temp = target + '.metadata.tmp'
    with open(temp, 'wb') as stream:
        stream.write(output)
    os.replace(temp, target)


def sanitize_degenerate_triangles(path):
    """Drop near-zero triangles introduced when the skinned patch is serialized."""
    gltf, chunks = parse_glb(path)
    binary_index = next((index for index, (kind, _) in enumerate(chunks)
                         if kind == 0x004E4942), None)
    if binary_index is None:
        raise RuntimeError('GLB BIN chunk missing')
    binary = bytearray(chunks[binary_index][1])
    primitive = gltf['meshes'][0]['primitives'][0]
    if primitive.get('mode', 4) != 4 or 'indices' not in primitive:
        raise RuntimeError('expected indexed triangle-list mesh')

    component_formats = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
    type_counts = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def accessor_payload(accessor):
        view = gltf['bufferViews'][accessor['bufferView']]
        _, width = component_formats[accessor['componentType']]
        count = type_counts[accessor['type']]
        item_size = width * count
        stride = view.get('byteStride', item_size)
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        return offset, stride, item_size, width, count

    position_accessor = gltf['accessors'][primitive['attributes']['POSITION']]
    original_vertex_count = position_accessor['count']
    position_offset, position_stride, _, _, _ = accessor_payload(position_accessor)
    position_format = component_formats[position_accessor['componentType']][0]
    if position_accessor['type'] != 'VEC3' or position_format != 'f':
        raise RuntimeError('expected float VEC3 positions')

    index_accessor = gltf['accessors'][primitive['indices']]
    index_format, _ = component_formats[index_accessor['componentType']]
    index_view = gltf['bufferViews'][index_accessor['bufferView']]
    index_offset = index_view.get('byteOffset', 0) + index_accessor.get('byteOffset', 0)
    indices = struct.unpack_from('<' + index_format * index_accessor['count'], binary, index_offset)
    if len(indices) % 3:
        raise RuntimeError('triangle index count is not divisible by three')

    kept_indices = []
    removed_triangles = 0
    for cursor in range(0, len(indices), 3):
        triangle = indices[cursor:cursor + 3]
        points = [struct.unpack_from('<3f', binary, position_offset + vertex * position_stride)
                  for vertex in triangle]
        ab = [points[1][axis] - points[0][axis] for axis in range(3)]
        ac = [points[2][axis] - points[0][axis] for axis in range(3)]
        cross = (ab[1] * ac[2] - ab[2] * ac[1],
                 ab[2] * ac[0] - ab[0] * ac[2],
                 ab[0] * ac[1] - ab[1] * ac[0])
        if sum(value * value for value in cross) <= 1e-20:
            removed_triangles += 1
        else:
            kept_indices.extend(triangle)
    if not removed_triangles:
        log('degenerate triangle cleanup', 'none found')
        return

    source_vertices = sorted(set(kept_indices))
    remap = {source: target for target, source in enumerate(source_vertices)}
    compacted_indices = [remap[index] for index in kept_indices]

    accessor_view_counts = defaultdict(int)
    for accessor in gltf['accessors']:
        if 'bufferView' in accessor:
            accessor_view_counts[accessor['bufferView']] += 1
    image_views = {image['bufferView'] for image in gltf.get('images', [])
                   if 'bufferView' in image}

    def append_view(data, target):
        padding = (-len(binary)) % 4
        if padding:
            binary.extend(b'\0' * padding)
        offset = len(binary)
        binary.extend(data)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target is not None:
            view['target'] = target
        gltf['bufferViews'].append(view)
        return len(gltf['bufferViews']) - 1

    def store_accessor(accessor, data, target):
        view_index = accessor.get('bufferView')
        if (view_index is not None
                and accessor_view_counts[view_index] == 1
                and view_index not in image_views
                and accessor.get('byteOffset', 0) == 0
                and 'byteStride' not in gltf['bufferViews'][view_index]
                and len(data) <= gltf['bufferViews'][view_index]['byteLength']):
            view = gltf['bufferViews'][view_index]
            start = view.get('byteOffset', 0)
            binary[start:start + len(data)] = data
            view['byteLength'] = len(data)
            view['target'] = target
            accessor['byteOffset'] = 0
            return view_index
        accessor['byteOffset'] = 0
        return append_view(data, target)

    for name, accessor_index in primitive['attributes'].items():
        accessor = gltf['accessors'][accessor_index]
        if accessor['count'] != original_vertex_count:
            raise RuntimeError(f'{name} vertex count differs from POSITION')
        source_offset, source_stride, item_size, _, component_count = accessor_payload(accessor)
        payload = b''.join(bytes(binary[source_offset + vertex * source_stride:
                                         source_offset + vertex * source_stride + item_size])
                           for vertex in source_vertices)
        accessor['bufferView'] = store_accessor(accessor, payload, 34962)
        accessor['count'] = len(source_vertices)
        accessor.pop('sparse', None)
        if name == 'POSITION':
            values = [struct.unpack_from('<3f', payload, index * item_size)
                      for index in range(len(source_vertices))]
            accessor['min'] = [min(value[axis] for value in values) for axis in range(3)]
            accessor['max'] = [max(value[axis] for value in values) for axis in range(3)]

    index_data = struct.pack('<' + index_format * len(compacted_indices), *compacted_indices)
    index_accessor['bufferView'] = store_accessor(index_accessor, index_data, 34963)
    index_accessor['count'] = len(compacted_indices)
    index_accessor['min'] = [min(compacted_indices)]
    index_accessor['max'] = [max(compacted_indices)]
    gltf['buffers'][0]['byteLength'] = len(binary)
    chunks[binary_index] = (0x004E4942, bytes(binary) + b'\0' * ((4 - len(binary) % 4) % 4))

    json_data = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    json_data += b' ' * ((4 - len(json_data) % 4) % 4)
    chunks[0] = (0x4E4F534A, json_data)
    total = 12 + sum(8 + len(data) for _, data in chunks)
    output = bytearray(total)
    output[:4] = b'glTF'
    struct.pack_into('<II', output, 4, 2, total)
    cursor = 12
    for kind, data in chunks:
        struct.pack_into('<II', output, cursor, len(data), kind)
        output[cursor + 8:cursor + 8 + len(data)] = data
        cursor += 8 + len(data)
    temp = path + '.sanitize.tmp'
    with open(temp, 'wb') as stream:
        stream.write(output)
    os.replace(temp, path)
    log('removed near-zero triangles', removed_triangles, 'remaining', len(compacted_indices) // 3,
        'vertices', len(source_vertices))


def import_mesh(path, require_armature=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    mesh = next((obj for obj in bpy.context.scene.objects
                 if obj.type == 'MESH' and obj.name == 'node_0'), None)
    if mesh is None:
        raise RuntimeError(f'node_0 mesh missing in {path}')
    armature = next((obj for obj in bpy.context.scene.objects
                     if obj.type == 'ARMATURE'), None)
    if require_armature and armature is None:
        raise RuntimeError(f'armature missing in {path}')
    return mesh, armature


def world_bounds(mesh):
    points = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return minimum, maximum


def make_patch_from_ring(mesh, selection_mode='legacy_z_band', root_shift_mm=4.0, tip_shift_mm=28.0):
    if selection_mode not in {'legacy_z_band', 'all_ring_faces'}:
        raise RuntimeError(f'unsupported ring selection mode: {selection_mode}')
    if not (0 < root_shift_mm < tip_shift_mm <= 60):
        raise RuntimeError('finger lateral shifts must satisfy 0 < root < tip <= 60 mm')
    if not mesh.data.uv_layers.active:
        raise RuntimeError('animated source GLB has no active UV map')
    mesh.data.calc_loop_triangles()
    triangles_by_polygon = defaultdict(list)
    for triangle in mesh.data.loop_triangles:
        triangles_by_polygon[triangle.polygon_index].append(triangle)
    uv_source = mesh.data.uv_layers.active.data
    world_from_local = mesh.matrix_world.copy()
    local_from_world = world_from_local.inverted()
    vertices, faces, loops_uv, face_side = [], [], [], []
    face_count = defaultdict(int)
    for side, outward in [('Left', -1.0), ('Right', 1.0)]:
        names = [f'mixamorig:{side}HandRing{i}' for i in range(1, 4)]
        groups = [mesh.vertex_groups.get(name) for name in names]
        if any(group is None for group in groups):
            raise RuntimeError(f'ring finger groups missing on {side}')
        group_ids = {group.index for group in groups}
        selected, source_vertices = [], set()
        for polygon in mesh.data.polygons:
            ids = list(polygon.vertices)
            weights = [sum(item.weight for item in mesh.data.vertices[index].groups
                            if item.group in group_ids) for index in ids]
            center = world_from_local @ polygon.center
            weighted_ring_face = sum(weights) / len(weights) >= 0.45
            in_legacy_z_band = 0.755 < center.z < 0.845
            if weighted_ring_face and (selection_mode == 'all_ring_faces' or in_legacy_z_band):
                selected.append(polygon)
                source_vertices.update(ids)
        if len(selected) < 100:
            raise RuntimeError(f'only {len(selected)} ring faces selected on {side}')
        face_start = len(faces)
        source_points = [world_from_local @ mesh.data.vertices[index].co
                         for index in source_vertices]
        root_z = max(point.z for point in source_points)
        tip_z = min(point.z for point in source_points)
        root_points = [point for point in source_points if point.z > root_z - 0.012]
        root_x = sum(point.x for point in root_points) / len(root_points)
        root_y = sum(point.y for point in root_points) / len(root_points)
        length = max(0.001, root_z - tip_z)
        vertex_map = {}
        for index in sorted(source_vertices):
            original = world_from_local @ mesh.data.vertices[index].co
            progress = max(0.0, min(1.0, (root_z - original.z) / length))
            shifted = Vector((
                root_x + (original.x - root_x) * 0.78
                + outward * ((root_shift_mm + (tip_shift_mm - root_shift_mm) * progress) / 1000.0),
                root_y + (original.y - root_y) * 0.88,
                root_z + (original.z - root_z) * 0.82,
            ))
            vertex_map[index] = len(vertices)
            # Keep patch vertices in world coordinates. create_patch_object
            # converts them into its reference matrix exactly once.
            vertices.append(shifted)
        for polygon in selected:
            # Store Blender's exact loop-triangle tessellation so the glTF
            # exporter cannot choose a different diagonal that creates a
            # near-zero sliver in the duplicated corrective.
            for triangle in triangles_by_polygon[polygon.index]:
                source_indices = list(triangle.vertices)
                face = [vertex_map[index] for index in source_indices]
                # Blender exports node scale separately. Reject source slivers
                # below audit_gltf_topology's 1e-20 area-squared floor after
                # the character node's 0.01 scale is applied.
                local_points = [local_from_world @ vertices[index] for index in face]
                doubled_area_squared = (
                    (local_points[1] - local_points[0])
                    .cross(local_points[2] - local_points[0]).length_squared
                )
                if doubled_area_squared <= 1e-12:
                    continue
                faces.append(face)
                face_side.append(side)
                for loop_index in triangle.loops:
                    loops_uv.append(tuple(uv_source[loop_index].uv))
        face_count[side] = len(faces) - face_start
    return {
        'vertices': vertices,
        'faces': faces,
        'uv': loops_uv,
        'face_side': face_side,
        'face_count': dict(face_count),
        'world_matrix': world_from_local,
        'height': world_bounds(mesh)[1][2] - world_bounds(mesh)[0][2],
        'uv_name': mesh.data.uv_layers.active.name,
    }


def create_patch_object(mesh, armature, patch_data, scale=1.0, weighted=False):
    patch_mesh = bpy.data.meshes.new('HandPinkyCorrectiveMesh')
    patch_mesh.from_pydata(
        [patch_data['world_matrix'].inverted() @ (vertex * scale)
         for vertex in patch_data['vertices']],
        [], patch_data['faces'])
    patch_mesh.update()
    patch_mesh.materials.append(mesh.data.materials[0])
    uv_layer = patch_mesh.uv_layers.new(name=patch_data['uv_name'])
    cursor = 0
    for polygon in patch_mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            uv_layer.data[loop_index].uv = patch_data['uv'][cursor]
            cursor += 1
    patch = bpy.data.objects.new('HandPinkyCorrective', patch_mesh)
    bpy.context.collection.objects.link(patch)
    patch.matrix_world = patch_data['world_matrix']
    if weighted:
        if armature is None:
            raise RuntimeError('animated pinky requires the source armature')
        patch.parent = armature
        modifier = patch.modifiers.new('Armature', 'ARMATURE')
        modifier.object = armature
        for side in ['Left', 'Right']:
            group = patch.vertex_groups.new(name=f'mixamorig:{side}Hand')
            ids = []
            for index, owner in enumerate(patch_data['face_side']):
                if owner == side:
                    ids.extend(patch_mesh.polygons[index].vertices)
            group.add(sorted(set(ids)), 1.0, 'REPLACE')
    return patch


def export_scene(mesh, armature, output):
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    if armature:
        armature.select_set(True)
        bpy.context.view_layer.objects.active = armature
    else:
        bpy.context.view_layer.objects.active = mesh
    bpy.ops.export_scene.gltf(
        filepath=output, export_format='GLB', use_selection=True,
        export_animations=bool(armature), export_skins=bool(armature),
        export_yup=True)


def candidate_output(source, output, patch_data):
    mesh, armature = import_mesh(source, require_armature=True)
    patch = create_patch_object(mesh, armature, patch_data, weighted=True)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    patch.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    mesh.name = 'node_0'
    for obj in list(bpy.context.scene.objects):
        if obj.type in {'CAMERA', 'LIGHT'} or (obj.type == 'MESH' and obj != mesh):
            bpy.data.objects.remove(obj, do_unlink=True)
    export_scene(mesh, armature, output)
    copy_asset_extras(source, output)


def static_output(source, output, patch_data, ratio):
    mesh, _ = import_mesh(source)
    patch = create_patch_object(mesh, None, patch_data, scale=ratio)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    patch.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    mesh.name = 'node_0'
    for obj in list(bpy.context.scene.objects):
        if obj.type in {'CAMERA', 'LIGHT'} or (obj.type == 'MESH' and obj != mesh):
            bpy.data.objects.remove(obj, do_unlink=True)
    export_scene(mesh, None, output)


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    if len(args) < 6 or len(args) > 9:
        raise SystemExit('expected animated input/output, raw source input/output, LOD input/output, optional selection mode and lateral shifts')
    anim_source, anim_output, raw_source, raw_output, lod_source, lod_output = args[:6]
    selection_mode = args[6] if len(args) == 7 else 'legacy_z_band'
    if len(args) >= 7:
        selection_mode = args[6]
    root_shift_mm = float(args[7]) if len(args) >= 8 else 4.0
    tip_shift_mm = float(args[8]) if len(args) >= 9 else 28.0
    for path in [anim_source, raw_source, lod_source]:
        if not os.path.isfile(path):
            raise RuntimeError(f'input missing: {path}')
    for path in [anim_output, raw_output, lod_output]:
        if os.path.exists(path):
            raise RuntimeError(f'refusing to overwrite: {path}')
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    mesh, armature = import_mesh(anim_source, require_armature=True)
    patch = make_patch_from_ring(mesh, selection_mode, root_shift_mm, tip_shift_mm)
    log('source ring faces', patch['face_count'], 'total', len(patch['faces']))
    candidate_height = patch['height']
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    patch_obj = create_patch_object(mesh, armature, patch, weighted=True)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    patch_obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.join()
    mesh.name = 'node_0'
    for obj in list(bpy.context.scene.objects):
        if obj.type in {'CAMERA', 'LIGHT'} or (obj.type == 'MESH' and obj != mesh):
            bpy.data.objects.remove(obj, do_unlink=True)
    export_scene(mesh, armature, anim_output)
    sanitize_degenerate_triangles(anim_output)
    copy_asset_extras(anim_source, anim_output)

    for source, output in [(raw_source, raw_output), (lod_source, lod_output)]:
        static_mesh, _ = import_mesh(source)
        minimum, maximum = world_bounds(static_mesh)
        static_height = maximum[2] - minimum[2]
        ratio = static_height / candidate_height
        log('static scale', source, 'height', round(static_height, 6), 'ratio', round(ratio, 6))
        patch_obj = create_patch_object(static_mesh, None, patch, scale=ratio)
        bpy.ops.object.select_all(action='DESELECT')
        static_mesh.select_set(True)
        patch_obj.select_set(True)
        bpy.context.view_layer.objects.active = static_mesh
        bpy.ops.object.join()
        static_mesh.name = 'node_0'
        for obj in list(bpy.context.scene.objects):
            if obj.type in {'CAMERA', 'LIGHT'} or (obj.type == 'MESH' and obj != static_mesh):
                bpy.data.objects.remove(obj, do_unlink=True)
        export_scene(static_mesh, None, output)
    log('created outputs', anim_output, raw_output, lod_output)


main()
