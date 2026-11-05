"""Rebuild the editable reception hall, web overlay, and Cycles portrait.

Run with Blender --background --python-exit-code 1 --python blender/build_hall_quality.py.
Pass -- --draft for a fast framing preview, or -- --render to render the saved source.
Set PALACE_METAL=1 to use a supported Mac GPU.
"""

import argparse
from collections import defaultdict
from math import cos, pi, radians, sin, tau
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
OUTPUT = ASSETS / 'quality'
SOURCE = OUTPUT / 'hall-quality.blend'
GLB = OUTPUT / 'hall-quality.glb'
RENDER = ASSETS / 'renders' / 'quality-hall.png'
SUFFIX = ' · Hall quality'
SURFACE_UV = 'Palace Surface'
AO_UV = 'Hall occlusion'

sys.path.insert(0, str(Path(__file__).resolve().parent))
from luxury_materials import (  # noqa: E402
    _attach_maps, _unwrap, bronze, calacatta, limestone, timber, tint, travertine,
)


def group(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def link(obj, collection, part='finish'):
    collection.objects.link(obj)
    obj['room_id'] = 'hall'
    obj['floor'] = 0
    obj['part'] = part
    return obj


def linear(byte):
    value = byte / 255
    return value / 12.92 if value < .04045 else ((value + .055) / 1.055) ** 2.4


def finish(name, color, roughness, metal=0, emission=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    material.diffuse_color = (*map(linear, color), 1)
    shader.inputs['Base Color'].default_value = material.diffuse_color
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    if emission:
        shader.inputs['Emission Color'].default_value = material.diffuse_color
        shader.inputs['Emission Strength'].default_value = emission
    return material


def wool(g):
    from luxury_materials import U, V

    jitter = g.noise(112)
    weave = (.55 * np.sin(tau * (62 * U + .15 * jitter))
             * np.cos(tau * (62 * V + .12 * jitter)) + .32 * jitter)
    clouds = g.noise(14, 17)
    return tint((77, 101, 98), 10 * weave + 7 * clouds), .85 + .06 * weave, .40 * weave


def basalt(g):
    grain = .68 * g.noise(175) + .32 * g.noise(75, 112)
    mottle = .63 * g.noise(5) + .37 * g.noise(25)
    pores = np.clip((g.noise(110, 133) - .57) * 2, 0, 1) ** 2
    return (tint((69, 72, 67), 9 * grain + 9 * mottle - 17 * pores),
            .43 + .08 * grain + .11 * pores, .10 * grain - .45 * pores)


def shift(sampler, offset, chroma=1):
    def recolor(g):
        color, roughness, height = sampler(g)
        mean = color.mean(axis=(0, 1))
        return mean + np.asarray(offset) + chroma * (color - mean), roughness, height
    return recolor


class Joinery:
    def __init__(self, collection):
        self.collection = collection
        self.projections = {}

    def mesh(self, name, vertices, faces, material, part='finish'):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        data.materials.append(material)
        return link(bpy.data.objects.new(name, data), self.collection, part)

    def box(self, name, position, dimensions, material, edge=0, part='finish'):
        x, y, z = (dimension / 2 for dimension in dimensions)
        obj = self.mesh(name, [
            (-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z),
            (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z),
        ], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
            (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], material, part)
        obj.location = position
        if edge:
            bevel = obj.modifiers.new('Eased machined edge', 'BEVEL')
            bevel.width = edge
            bevel.segments = 3
            obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        return obj

    def ring(self, name, center, radius, width, depth, material, *,
             start=0, span=tau, vertical=False, segments=80):
        closed = abs(span - tau) < 1e-6
        count = segments if closed else segments + 1
        vertices = []
        for r, h in [(radius, -depth/2), (radius, depth/2),
                     (radius-width, depth/2), (radius-width, -depth/2)]:
            for index in range(count):
                angle = start + span * index / segments
                u, v = r * cos(angle), r * sin(angle)
                local = (u, -h, v) if vertical else (u, v, h)
                vertices.append(tuple(a + b for a, b in zip(center, local)))
        faces = []
        for row in range(4):
            other = (row + 1) % 4
            for index in range(segments):
                nxt = (index + 1) % count
                faces.append((row*count+index, row*count+nxt,
                              other*count+nxt, other*count+index))
        if not closed:
            faces.extend((tuple(row * count for row in range(4)),
                          tuple(row * count + segments for row in reversed(range(4)))))
        return self.mesh(name, vertices, faces, material)

    def cylinder(self, name, position, radius, height, material, sides=48, radius_top=None):
        radius_top = radius if radius_top is None else radius_top
        vertices = [(r*cos(i*tau/sides), r*sin(i*tau/sides), z)
                    for r, z in [(radius, -height/2), (radius_top, height/2)]
                    for i in range(sides)]
        faces = [(i, (i+1) % sides, (i+1) % sides + sides, i+sides) for i in range(sides)]
        faces.extend((tuple(reversed(range(sides))), tuple(range(sides, sides*2))))
        obj = self.mesh(name, vertices, faces, material)
        obj.location = position
        for polygon in list(obj.data.polygons)[:sides]:
            polygon.use_smooth = True
        return obj

    def lettering(self, name, body, position, size, material, vertical=True, spacing=1.1):
        data = bpy.data.curves.new(name, 'FONT')
        data.body = body
        data.align_x = 'CENTER'
        data.align_y = 'CENTER'
        data.size = size
        data.extrude = .0007
        data.space_character = spacing
        data.resolution_u = 5
        data.materials.append(material)
        obj = link(bpy.data.objects.new(name, data), self.collection)
        obj.location = position
        if vertical:
            obj.rotation_euler.x = pi/2
        return obj


def change_materials(originals, joinery):
    original = {m.name: m for obj in originals for m in obj.data.materials if m}
    substitutions = {}
    with TemporaryDirectory(prefix='palace-hall-textures-') as directory:
        directory = Path(directory)
        recipes = [
            ('01 · Vein-cut ivory travertine', 'hall-vein-cut', shift(travertine, (-24, -24, -24), 1.15),
             (2.42, 1.38), False, {}),
            ('02 · Honed ivory limestone', 'hall-limestone', shift(limestone, (-14, -15, -18)),
             (1.30, 1.30), False, {}),
            ('03 · Dove-gray basalt', 'hall-basalt', basalt, (.73, .73), False, {'coat': .13}),
            ('05 · Satin champagne bronze', 'hall-bronze', shift(bronze, (-11, -17, -19), 1.4),
             (.74, .24), True, {'metal': .75, 'anisotropy': .33}),
            ('07 · Natural walnut', 'hall-walnut', lambda g: timber(g, (120, 83, 58), .39),
             (2.15, .57), True, {'coat': .21}),
            ('08 · Pale European oak', 'hall-oak', lambda g: timber(g, (164, 125, 88), .47),
             (2.15, .56), True, {'coat': .11}),
            ('09 · Calacatta ivory marble', 'hall-marble', shift(calacatta, (-31, -32, -35), 1.25),
             (2.8, 2.33), False, {'coat': .10}),
            ('20 · Mist-blue wool', 'hall-wool', wool, (.38, .38), False, {'sheen': .29}),
        ]
        for seed, (name, slug, sampler, tile, directional, options) in enumerate(recipes, 340):
            base = bpy.data.materials[name]
            material = finish(name + SUFFIX, (160, 143, 122), .53)
            _attach_maps(material, directory, slug, sampler, seed, **options)
            substitutions[base] = material
            joinery.projections[material] = tile, directional

    for obj in originals:
        material = obj.data.materials[0]
        replacement = substitutions.get(material)
        if replacement:
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            obj.data.materials[0] = replacement
    for name, intensity in [('23 · Warm concealed light', .52),
                            ('Light · Warm opal glass and cast crystal', .52)]:
        base = original[name]
        material = base.copy()
        material.name = name + SUFFIX
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Emission Strength'].default_value *= intensity
        substitutions[base] = material
        for obj in originals:
            if obj.data.materials[0] == base:
                if obj.data.users > 1:
                    obj.data = obj.data.copy()
                obj.data.materials[0] = material
    return {name: substitutions.get(material, material) for name, material in original.items()} | {
        '09 · Calacatta ivory marble': substitutions[bpy.data.materials['09 · Calacatta ivory marble']],
    }


def detail_hall(j, m):
    walnut = m['07 · Natural walnut']
    oak = m['08 · Pale European oak']
    bronze_material = m['05 · Satin champagne bronze']
    basalt_material = m['03 · Dove-gray basalt']
    travertine_material = m['01 · Vein-cut ivory travertine']
    marble = m['09 · Calacatta ivory marble']
    line = finish('Honed bronze inlay', (173, 137, 90), .36, .55)
    grout = finish('Pencil-gray stone joints', (118, 105, 92), .79)
    brass_letters = finish('Raised champagne lettering', (214, 178, 117), .41, .44)
    enamel = finish('Kiln-fired sage emblem', (104, 132, 118), .66)
    yarn = finish('Lichen wool embroidery', (133, 154, 133), .88)
    edge_yarn = finish('Bronze wool embroidery', (164, 139, 98), .84)
    paper = finish('26 · Uncoated paper' + SUFFIX, (227, 208, 169), .86)
    ink = finish('Warm ink on paper', (77, 66, 52), .81)
    opal = finish('Entrance lantern · Warm amber opal', (241, 181, 105), .48, emission=.36)

    # This 6 mm finish sits on the existing walk plane and leaves the estate slab intact.
    left, right, front, rear = -3.19, 9.53, -3.14, 6.38
    j.box('Hall floor · Warm shadow grout bed', ((left+right)/2, (front+rear)/2, .7435),
          (right-left, rear-front, .0025), grout, part='architecture')
    columns, rows = 10, 7
    dx, dy = (right-left)/columns, (rear-front)/rows
    for col in range(columns):
        for row in range(rows):
            x, y = left+dx*(col+.5), front+dy*(row+.5)
            j.box('Hall floor · Rectified honed Calacatta', (x, y, .746),
                  (dx-.009, dy-.009, .0038), marble, .0008, 'architecture')
    for x in (-3.06, 3.23, 9.40):
        j.box('Hall floor · Longitudinal bronze spline', (x, (front+rear)/2, .7485),
              (.011, rear-front-.26, .0009), line)
    for y in (front+.13, rear-.13):
        j.box('Hall floor · Transverse bronze spline', ((left+right)/2, y, .7485),
              (right-left-.25, .011, .0009), line)
    for x in (-3.03, 3.26):
        j.box('Hall floor · Basalt ribbon inside spline', (x, (front+rear)/2, .7484),
              (.028, rear-front-.28, .0009), basalt_material)

    # The round rug becomes a woven compass rose with its center held at the memory address.
    for radius, width, material in [(1.370, .034, edge_yarn), (1.317, .012, yarn),
                                     (1.217, .015, edge_yarn), (.550, .012, yarn)]:
        j.ring('Compass rug · Woven concentric track', (0, .62, .776), radius, width, .002, material)
    for index in range(48):
        angle = index * tau / 48
        length = .142 if index % 12 == 0 else (.072 if index % 4 == 0 else .032)
        radius = 1.193 - length/2
        tick = j.box('Compass rug · Woven radial stitch',
                     (radius*cos(angle), .62+radius*sin(angle), .776),
                     (length, .013 if index % 4 == 0 else .008, .002), edge_yarn)
        tick.rotation_euler.z = angle
    for index in range(8):
        angle = index * tau / 8
        length = .487 if index % 2 == 0 else .311
        local = [(length, 0), (.063, .052), (-.026, 0), (.063, -.052)]
        points = [(x*cos(angle)-y*sin(angle), .62+x*sin(angle)+y*cos(angle), .777)
                  for x, y in local]
        j.mesh('Compass rug · Woven compass point', points, [(0, 3, 2, 1)],
               edge_yarn if index % 2 == 0 else yarn)
    j.cylinder('Compass rug · Kiln-fired center', (0, .62, .777), .044, .007, enamel)

    # Desk toe kick and hardware are recessed inside the established joinery envelope.
    j.box('Reception · Recessed shadow plinth', (.12, 3.73, .788),
          (2.91, .75, .076), basalt_material, .016, 'furniture')
    for x in (-1.25, 1.49):
        j.box('Reception · Smoked walnut edge stile', (x, 3.278, 1.357),
              (.051, .056, 1.085), walnut, .01, 'furniture')
    for x in (-1.26, 1.50):
        for z in (.909, 1.822):
            pin = j.cylinder('Reception · Recessed escutcheon', (x, 3.241, z),
                             .014, .008, line, 16)
            pin.rotation_euler.x = pi/2

    # Ledger is centered at the original hall-ledger marker and sits on the counter.
    x, y, z = .14, 3.64, 2.056
    j.box('Ledger · Burnished sage cover', (x, y, z+.012), (.49, .366, .022), enamel, .013, 'furniture')
    j.box('Ledger · Paper block', (x+.016, y-.001, z+.034), (.452, .329, .029), paper, .008, 'furniture')
    j.box('Ledger · Top leather cover', (x, y, z+.056), (.49, .366, .015), enamel, .008, 'furniture')
    j.box('Ledger · Rounded leather spine', (x-.23, y, z+.034), (.043, .371, .062), walnut, .017, 'furniture')
    for sy in (-1, 1):
        j.box('Ledger · Hot stamped border', (x+.033, y+sy*.131, z+.0645),
              (.324, .0034, .0009), brass_letters)
        for i in range(3):
            j.box('Ledger · Page edge ruling', (x+.017, y+sy*.166, z+.023+i*.009),
                  (.421, .0013, .0012), ink)
    for sx in (-1, 1):
        j.box('Ledger · Hot stamped border', (x+.033+sx*.162, y, z+.0645),
              (.0034, .263, .0009), brass_letters)
    j.lettering('Ledger · Gilt cover title', 'GUEST LEDGER', (x+.033, y, z+.0645),
                .029, brass_letters, vertical=False)

    # Layered travertine, slotted acoustic panels and a dark enamel house plaque.
    j.box('Reception wall · Shadow gap below slabs', (.12, 6.222, 1.004),
          (3.16, .037, .027), grout, .005)
    for x in (-1.68, 1.92):
        j.box('Reception wall · Recessed acoustic panel', (x, 6.192, 2.495),
              (.326, .085, 2.844), walnut, .017)
        for i in range(6):
            j.box('Reception wall · Quarter-sawn acoustic reed', (x+(i-2.5)*.045, 6.136, 2.495),
                  (.024, .038, 2.764), oak, .008)
    j.box('Reception wall · Floating backplate', (.12, 6.201, 2.932),
          (1.71, .064, .606), basalt_material, .027)
    j.box('Reception wall · Brushed champagne reveal', (.12, 6.160, 2.932),
          (1.666, .035, .561), bronze_material, .025)
    j.box('Reception wall · Deep sage enamel panel', (.12, 6.137, 2.932),
          (1.612, .023, .513), finish('Satin enamel plaque', (58, 80, 75), .43), .020)
    j.ring('Reception wall · House emblem outer ring', (.12, 6.121, 3.073),
           .075, .004, .004, brass_letters, vertical=True, segments=40)
    for dx in (-.026, 0, .026):
        j.box('Reception wall · House emblem blade', (.12+dx, 6.118, 3.068),
              (.007, .005, .068 - abs(dx)), brass_letters, .001)
    j.lettering('Reception wall · Raised house name', 'MEMORY PALACE', (.12, 6.121, 2.940),
                .093, brass_letters, spacing=1.23)
    j.lettering('Reception wall · Reception number', 'RECEPTION    /    01', (.12, 6.121, 2.817),
                .045, brass_letters, spacing=1.24)
    for x in (-.624, .864):
        for z in (2.735, 3.129):
            pin = j.cylinder('Reception wall · Champagne mounting pin', (x, 6.119, z), .013, .008, line, 18)
            pin.rotation_euler.x = pi/2

    # Lantern occupies the existing marker and has a pedestal down to the exterior step.
    x, y = -2.38, -3.82
    j.box('Entrance lantern · Honed basalt pedestal', (x, y, .781),
          (.275, .275, .440), basalt_material, .026, 'architecture')
    j.cylinder('Entrance lantern · Bronze pedestal collar', (x, y, 1.007), .159, .050, bronze_material)
    j.cylinder('Entrance lantern · Cast amber opal sleeve', (x, y, 1.209), .111, .325, opal, 32)
    for z in (1.052, 1.355):
        j.cylinder('Entrance lantern · Machined bronze end plate', (x, y, z), .142, .038, bronze_material, 32)
        j.ring('Entrance lantern · Fine machined reveal', (x, y, z+.023), .132, .008, .009, line, segments=40)
    for i in range(8):
        angle = i*tau/8 + tau/16
        j.cylinder('Entrance lantern · Bronze cage rod', (x+.124*cos(angle), y+.124*sin(angle), 1.206),
                   .011, .29, bronze_material, 12)
    j.ring('Entrance lantern · Forged semicircular carrying handle', (x, y, 1.373),
           .085, .014, .014, bronze_material, start=0, span=pi, vertical=True, segments=28)

    for x in (4.28, 8.36):
        for z in (1.04, 3.71):
            j.box('Lounge wall · Fine bronze end cap', (x, 6.103, z), (.081, .032, .055), line, .006)
    j.box('Lounge wall · Basalt heel rail', (6.31, 6.159, .837),
          (4.36, .047, .093), basalt_material, .012)
    j.box('Lounge wall · Pencil bronze cap', (6.31, 6.126, .887),
          (4.36, .025, .019), line, .004)

    # Sculpted ribs add small grazing highlights to the pendant crystal.
    for index in range(19):
        x = (index-9)*.102
        j.ring('Pendant · Lower crystal capture bezel', (x, 1.06, 3.295 if index % 2 else 3.283),
               .045, .005, .011, bronze_material, segments=24)
    j.box('Reception wall · Bronze shelf edge under grazer', (.12, 6.178, 3.849),
          (3.026, .077, .029), bronze_material, .006)


def prepare_uv(objects, projections):
    bpy.context.view_layer.update()
    for obj in objects:
        if obj.type != 'MESH' or obj.data.materials[0] not in projections:
            continue
        _unwrap(obj, *projections[obj.data.materials[0]])


def build_batches(objects, collection):
    """Keep editable components separate and combine only glTF export copies."""
    buckets = defaultdict(list)
    for obj in objects:
        buckets[(obj['part'], obj.data.materials[0])].append(obj)

    depsgraph = bpy.context.evaluated_depsgraph_get()
    batches = []
    for (part, material), sources in buckets.items():
        vertices, faces, normals, smooth, uv = [], [], [], [], []
        for source in sources:
            evaluated = source.evaluated_get(depsgraph)
            data = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
            world = evaluated.matrix_world
            normal_matrix = world.to_3x3().inverted_safe().transposed()
            vertex_offset = len(vertices)
            vertices.extend(world @ vert.co for vert in data.vertices)
            faces.extend(tuple(vertex_offset + i for i in poly.vertices) for poly in data.polygons)
            normals.extend((normal_matrix @ corner.vector).normalized() for corner in data.corner_normals)
            smooth.extend(poly.use_smooth for poly in data.polygons)
            surface_uv = data.uv_layers.active
            if surface_uv:
                uv.extend(tuple(loop.uv) for loop in surface_uv.data)
            else:
                uv.extend([(0.0, 0.0)] * len(data.loops))
            evaluated.to_mesh_clear()
        name = 'Hall quality · ' + part + ' · ' + material.name.removesuffix(SUFFIX)
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        data.materials.append(material)
        for polygon, value in zip(data.polygons, smooth):
            polygon.use_smooth = value
        data.normals_split_custom_set(normals)
        surface = data.uv_layers.new(name=SURFACE_UV)
        surface.data.foreach_set('uv', [value for pair in uv for value in pair])
        surface.active_render = True
        batches.append(link(bpy.data.objects.new(name, data), collection, part))
    return batches


def use_metal(scene):
    scene.cycles.device = 'CPU'
    if os.environ.get('PALACE_METAL') == '1':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for device in prefs.devices:
            device.use = device.type == 'METAL'
        if not any(device.use for device in prefs.devices):
            raise RuntimeError('PALACE_METAL=1 requires a usable Metal device')
        scene.cycles.device = 'GPU'
        scene.cycles.denoising_use_gpu = True
    print('CYCLES_DEVICE', scene.cycles.device, flush=True)


def bake_occlusion(scene, batches):
    """Ray trace local AO to a unique second UV set, then wire glTF occlusion."""
    targets = []
    for obj in batches:
        material = obj.data.materials[0]
        shader = material.node_tree.nodes.get('Principled BSDF')
        emission = max(shader.inputs['Emission Color'].default_value[:3]) * shader.inputs['Emission Strength'].default_value
        if emission > .1 or any(
            word in material.name.lower() for word in ('foliage', 'grasses', 'lettering', 'ink')
        ):
            continue
        mesh = obj.data
        ao = mesh.uv_layers.new(name=AO_UV, do_init=False)
        mesh.uv_layers.active = ao
        targets.append(obj)

    print('HALL_AO_UNWRAP', len(targets), sum(len(o.data.polygons) for o in targets), flush=True)
    select(targets)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=radians(62), island_margin=.0029,
                             margin_method='FRACTION', correct_aspect=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    image = bpy.data.images.new('Hall · baked occlusion 2048', width=2048, height=2048, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (1, 1, 1, 1)
    image.use_fake_user = True
    material = bpy.data.materials.new('Temporary Cycles AO shader')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value = .44
    ao.samples = 8
    bias = nodes.new('ShaderNodeMath')
    bias.operation = 'MULTIPLY_ADD'
    bias.inputs[1].default_value = .78
    bias.inputs[2].default_value = .22
    emission = nodes.new('ShaderNodeEmission')
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    nodes.active = texture
    links.new(ao.outputs['AO'], bias.inputs[0])
    links.new(bias.outputs[0], emission.inputs[0])
    links.new(emission.outputs[0], nodes.get('Material Output').inputs['Surface'])

    materials = {obj: obj.data.materials[0] for obj in targets}
    for obj in targets:
        obj.data.materials[0] = material
        obj.data.uv_layers[AO_UV].active_render = True

    # Keep near shared architecture as occluders. The sample copies supply all its furniture.
    hidden = {}
    for obj in scene.objects:
        if obj in batches:
            continue
        keep = (obj.type == 'MESH' and obj.get('floor') in (0, 1)
                and not obj.get('room_id') and obj.get('part') in ('architecture', 'circulation')
                and abs(obj.location.x) < 13 and abs(obj.location.y) < 8)
        if keep and obj.active_material and 'glazing' not in obj.active_material.name.lower():
            continue
        hidden[obj] = obj.hide_render
        obj.hide_render = True
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    print('HALL_AO_BAKE_START', flush=True)
    bpy.ops.object.bake(type='EMIT', margin=5, margin_type='EXTEND', use_clear=True, uv_layer=AO_UV)
    image.pack()
    pixels = np.empty(2048*2048*4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    print('HALL_AO_BAKE_RANGE', float(pixels[::4].min()),
          float(pixels[::4].mean()), float(pixels[::4].max()), flush=True)
    for obj, was_hidden in hidden.items():
        obj.hide_render = was_hidden
    for obj, original in materials.items():
        obj.data.materials[0] = original
        obj.data.uv_layers.active = obj.data.uv_layers[SURFACE_UV]
        obj.data.uv_layers[SURFACE_UV].active_render = True
    bpy.data.materials.remove(material)

    group_name = 'glTF Material Output'
    settings = bpy.data.node_groups.get(group_name)
    if settings is None:
        settings = bpy.data.node_groups.new(group_name, 'ShaderNodeTree')
        settings.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    # Original estate objects keep their own materials and one UV set.
    for original in set(materials.values()):
        material = original.copy()
        material.name = original.name
        nodes, links = material.node_tree.nodes, material.node_tree.links
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = AO_UV
        uv.location = (-950, -575)
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.label = 'Cycles AO · 0.44 m contact radius'
        tex.location = (-720, -575)
        output = nodes.new('ShaderNodeGroup')
        output.node_tree = settings
        output.location = (-350, -575)
        links.new(uv.outputs['UV'], tex.inputs['Vector'])
        links.new(tex.outputs['Color'], output.inputs['Occlusion'])
        # Rename around export so glTF contains the style-compatible canonical name.
        material['hall_export_name'] = original.name
        for obj in targets:
            if materials[obj] == original:
                obj.data.materials[0] = material


def frame_portrait(camera):
    camera.location = (1.92, -2.34, 2.348)
    target = Vector((.06, 3.55, 2.09))
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.lens = 23
    camera.data.clip_start = .04


def configure_portrait(scene):
    camera = bpy.data.objects.new('Hall quality · Reception portrait', bpy.data.cameras.new('Reception portrait'))
    scene.collection.objects.link(camera)
    frame_portrait(camera)
    scene.camera = camera
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -.58
    for obj in scene.objects:
        if obj.type != 'LIGHT':
            continue
        if obj.name.startswith('Interior · warm indirect fill') and obj.location.z < 4.6:
            obj.data.energy *= .48
        if obj.name.startswith('Daylight · Lateral fill'):
            obj.data.energy *= .73
        if obj.name.startswith('Luminaire · Travertine wall grazer · hall'):
            obj.data.energy *= .68


def render(scene, draft=False):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20 if draft else 64
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = .023 if draft else .017
    scene.cycles.transparent_max_bounces = 12
    scene.cycles.max_bounces = 9
    scene.render.resolution_x = 880 if draft else 1680
    scene.render.resolution_y = 550 if draft else 1050
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.filepath = str(RENDER if not draft else Path('/tmp/palace-hall-draft.png'))
    print('HALL_CYCLES_START', scene.render.filepath, flush=True)
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--draft', action='store_true')
    parser.add_argument('--build-only', action='store_true', help='Bake and export without rendering')
    parser.add_argument('--render', action='store_true', help='Render from the saved editable sample')
    options = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if options.render:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
        scene = bpy.context.scene
        previous = scene.camera.matrix_world.copy()
        frame_portrait(scene.camera)
        bpy.context.view_layer.update()
        if not options.draft and scene.camera.matrix_world != previous:
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
        use_metal(scene)
        render(scene, options.draft)
        return

    bpy.ops.wm.open_mainfile(filepath=str(ASSETS / 'memory-palace.blend'))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    use_metal(scene)
    original = [obj for obj in scene.objects if obj.type == 'MESH' and obj.get('room_id') == 'hall']
    edit = group('05 · Entrance Hall | editable joinery')
    joinery = Joinery(edit)
    for obj in original:
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        edit.objects.link(obj)
    m = change_materials(original, joinery)
    for obj in original:
        if obj.name.startswith(('Arrival · Bronze entrance lantern', 'Arrival · Entrance lantern glass',
                                'Arrival · Inlaid bronze circle')):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.name.startswith('Arrival · Circular woven rug'):
            obj.location.z -= .031
        elif obj.name.startswith('Reception · Floating walnut desk'):
            obj.scale.z *= .951
            obj.location.z += .029

    detail_hall(joinery, m)
    objects = list(edit.objects)
    prepare_uv(objects, joinery.projections)
    configure_portrait(scene)
    if options.draft:
        render(scene, draft=True)
        return

    OUTPUT.mkdir(parents=True, exist_ok=True)
    web = group('06 · Entrance Hall | baked web meshes')
    batches = build_batches(objects, web)
    bake_occlusion(scene, batches)
    material_names = {}
    for obj in batches:
        material = obj.data.materials[0]
        if (export_name := material.get('hall_export_name')) and material not in material_names:
            original = bpy.data.materials[export_name]
            original.name += ' · Editable'
            material_names[material] = original, export_name
            material.name = export_name
    select(batches)
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True,
                              export_extras=True, export_yup=True)
    for material, (original, export_name) in material_names.items():
        material.name = export_name + ' · Baked web'
        original.name = export_name
    select([scene.camera])
    web.hide_render = web.hide_viewport = True
    scene['hall_quality'] = 'Editable joinery, ray-traced glTF AO, and Cycles reception portrait.'
    scene.render.filepath = '//../renders/quality-hall.png'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1680, 1050
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if not options.build_only:
        render(scene)


if __name__ == '__main__':
    main()
