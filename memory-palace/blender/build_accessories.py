"""Build the four Memory Palace ornaments, editable studio scene, and glTF assets."""
import math
import os
from pathlib import Path
import random

import bpy
from mathutils import Euler, Vector


OUTPUT = Path(__file__).resolve().parents[1] / 'assets' / 'accessories'
OUTPUT.mkdir(parents=True, exist_ok=True)
TAU = math.tau
random.seed(47)


def material(name, color, roughness, metal=0, *, coat=0, sheen=0, emission=0, transmission=0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Coat Weight'].default_value = coat
    shader.inputs['Transmission Weight'].default_value = transmission
    shader.inputs['Sheen Weight'].default_value = sheen
    shader.inputs['Sheen Roughness'].default_value = .68
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return result


def grain(surface, scale, strength, depth):
    nodes = surface.node_tree.nodes
    links = surface.node_tree.links
    texture = nodes.new('ShaderNodeTexNoise')
    texture.inputs['Scale'].default_value = scale
    texture.inputs['Detail'].default_value = 2
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = depth
    links.new(texture.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])


def mesh(name, verts, faces, surface, *, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(surface)
    for polygon in data.polygons:
        polygon.use_smooth = smooth
    return obj


def ellipsoid(name, center, axes, surface, rotation=None, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=center,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = axes
    if rotation:
        obj.rotation_euler = rotation
    obj.data.materials.append(surface)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def lathe(name, profile, surface, segments=80, fluting=0, *, annulus=False):
    """Profile follows the surface from bottom center to top center or inner wall."""
    verts = []
    faces = []
    for radius, height in profile:
        for index in range(segments):
            theta = TAU * index / segments
            rim = radius + fluting * math.cos(theta * 32)
            verts.append((rim * math.cos(theta), rim * math.sin(theta), height))
    if not annulus:
        faces.append(tuple(reversed(range(segments))))
    for row in range(len(profile) if annulus else len(profile) - 1):
        for index in range(segments):
            here = row * segments + index
            nxt = row * segments + (index + 1) % segments
            next_row = ((row + 1) % len(profile)) * segments
            faces.append((here, nxt, next_row + (index + 1) % segments, next_row + index))
    if not annulus:
        faces.append(tuple(range(len(verts) - segments, len(verts))))
    obj = mesh(name, verts, faces, surface, smooth=True)
    if not annulus:
        obj.data.polygons[0].use_smooth = False
        obj.data.polygons[-1].use_smooth = False
    return obj


def pipe(name, points, radius, surface, *, closed=False, sides=7):
    """Sweep a compact circular section along a gently curved 3D path."""
    points = [Vector(point) for point in points]
    verts = []
    faces = []
    for index, point in enumerate(points):
        prev = points[index - 1] if index or closed else point
        nxt = points[(index + 1) % len(points)] if closed or index + 1 < len(points) else point
        axis = (nxt - prev).normalized()
        reference = Vector((0, 0, 1)) if abs(axis.z) < .9 else Vector((0, 1, 0))
        normal = axis.cross(reference).normalized()
        binormal = axis.cross(normal)
        for side in range(sides):
            theta = TAU * side / sides
            verts.append(point + radius * (math.cos(theta) * normal + math.sin(theta) * binormal))
    for index in range(len(points) if closed else len(points) - 1):
        a = index * sides
        b = ((index + 1) % len(points)) * sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((a + side, a + nxt, b + nxt, b + side))
    if not closed:
        faces.extend((tuple(reversed(range(sides))), tuple(range(len(verts) - sides, len(verts)))))
    return mesh(name, verts, faces, surface, smooth=True)


def round_wire(name, center, radii, radius, surface, rotation=(0, 0, 0), segments=72):
    matrix = Euler(rotation).to_matrix()
    center = Vector(center)
    points = []
    for index in range(segments):
        theta = TAU * index / segments
        points.append(center + matrix @ Vector((radii[0] * math.cos(theta), radii[1] * math.sin(theta), 0)))
    return pipe(name, points, radius, surface, closed=True, sides=8)


def profile(name, z1, z2, r1, r2, edge, surface):
    """A beveled circular hardware fitting or slab."""
    return lathe(name, [
        (r1 - edge, z1), (r1 - edge * .32, z1 + edge * .23),
        (r1, z1 + edge * .8), (r2, z2 - edge * .8),
        (r2 - edge * .32, z2 - edge * .23), (r2 - edge, z2),
    ], surface, 64)


def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    return result


def plinth(surface, brass, *, radius=.365, height=.09):
    profile('Recessed pedestal foot', 0, .017, radius * .86, radius * .89, .005, surface)
    profile('Brushed brass reveal', .016, .028, radius * .94, radius * .94, .004, brass)
    profile('Honed pedestal', .027, height, radius, radius * .983, .013, surface)


def teddy():
    brass = material('Bear · brushed heirloom brass', (.63, .36, .155), .27, .79)
    wood = material('Bear · dark smoked walnut', (.07, .027, .012), .39, coat=.17)
    grain(wood, 65, .20, .009)
    plinth(wood, brass)
    pedestal = set(bpy.context.scene.objects)
    fleece = material('Custom accent · teddy fleece', (.32, .148, .076), .88, sheen=.52)
    velvet = material('Bear · biscuit velvet pads', (.62, .382, .214), .9, sheen=.31)
    muzzle = material('Bear · oatmeal muzzle', (.77, .595, .395), .92, sheen=.3)
    thread = material('Bear · tawny thread', (.14, .051, .021), .94)
    eyes = material('Bear · polished brown glass', (.013, .007, .005), .13, coat=.55)
    highlight = material('Bear · catchlights', (.92, .77, .56), .25)
    ribbon = material('Bear · blackened silk collar', (.051, .018, .014), .55, sheen=.46)
    for surface in (fleece, velvet, muzzle):
        grain(surface, 155, .34, .009)

    ellipsoid('Seated plush haunches', (0, .039, .241), (.192, .153, .096), fleece)
    ellipsoid('Pear-shaped seated torso', (0, .016, .493), (.239, .189, .306), fleece)
    ellipsoid('Rounded plush head', (0, -.012, .907), (.224, .198, .211), fleece)
    ellipsoid('Muzzle inset', (0, -.171, .853), (.116, .083, .077), muzzle)
    for sign, label in ((-1, 'Left'), (1, 'Right')):
        ellipsoid(label + ' rolled ear', (sign * .176, .004, 1.069), (.088, .057, .097), fleece,
                  (0, sign * .26, 0))
        ellipsoid(label + ' ear lining', (sign * .183, -.044, 1.076), (.055, .019, .062), velvet,
                  (.1, sign * .26, 0))
        ellipsoid(label + ' shoulder and arm', (sign * .219, -.012, .544), (.106, .119, .188), fleece,
                  (-.43, -sign * .32, -sign * .1))
        ellipsoid(label + ' paw inner pad', (sign * .266, -.116, .461), (.064, .034, .067), velvet,
                  (-.37, sign * .04, 0))
        ellipsoid(label + ' foot', (sign * .132, -.094, .276), (.124, .179, .131), fleece,
                  (.26, 0, sign * .14))
        pad_center = (sign * .154, -.242, .275)
        ellipsoid(label + ' foot sole', pad_center, (.087, .038, .090), velvet,
                  (-.18, 0, sign * .14))
        foot_rotation = Euler((math.pi / 2 - .18, 0, sign * .14)).to_matrix()
        for index in range(3):
            toe = Vector(pad_center) + foot_rotation @ Vector(((index - 1) * .033, .044, .033))
            ellipsoid(label + ' embroidered toe', toe, (.011, .004, .014), thread, segments=12, rings=8)
        eye_center = (sign * .085, -.184, .944)
        ellipsoid(label + ' inset velvet around eye', (sign * .086, -.174, .944),
                  (.034, .021, .032), velvet, segments=24, rings=16)
        ellipsoid(label + ' glass eye', eye_center, (.024, .020, .024), eyes, segments=24, rings=16)
        ellipsoid(label + ' eye catchlight', (eye_center[0] - .006, -.202, .952),
                  (.0065, .002, .006), highlight, segments=12, rings=8)
    ellipsoid('Embroidered nose', (0, -.248, .887), (.036, .016, .022), eyes, segments=24, rings=16)
    pipe('Central muzzle stitch', [(0, -.262, .88), (0, -.256, .86), (0, -.254, .838)], .0034, thread)
    for sign in (-1, 1):
        pipe('Curved muzzle stitch', [(0, -.254, .838), (sign * .018, -.249, .826),
             (sign * .037, -.245, .826), (sign * .052, -.242, .832)], .0033, thread)

    darts = []
    for index in range(11):
        z = .397 + .023 * index
        y = .016 - .19 * math.sqrt(1 - ((z - .493) / .306) ** 2)
        darts.append(pipe('Short locking stitch',
            [(-.007, y - .001, z - .006), (0, y - .004, z), (.007, y - .001, z + .006)],
            .0018, thread, sides=5))
    join(darts, 'Eleven visible stitches on belly seam')
    round_wire('Silk neck cord', (0, .008, .725), (.161, .143), .010, ribbon, rotation=(.14, 0, 0))
    round_wire('Tiny brass collar loop', (0, -.143, .702), (.015, .018), .003, brass,
               rotation=(math.pi / 2, 0, 0), segments=28)
    ellipsoid('Heirloom medallion', (0, -.151, .673), (.034, .009, .032), brass)
    round_wire('Engraved medallion border', (0, -.160, .673), (.025, .023), .0018, wood,
               rotation=(math.pi / 2, 0, 0), segments=36)
    for x, z in ((-.008, .675), (.008, .675), (0, .685), (0, .660)):
        ellipsoid('Medallion paw engraving', (x, -.160, z), (.004, .001, .004), wood,
                  segments=10, rings=6)
    for obj in bpy.context.scene.objects:
        if obj not in pedestal:
            obj.location.z -= .055


def lunar_texture():
    """Pack a seamless albedo made from layered lunar maria, impact bowls and ejecta."""
    import numpy as np

    width, height = 512, 256
    u, v = np.meshgrid(np.arange(width) / width, np.arange(height) / height)
    theta, phi = u * TAU, (v - .5) * math.pi
    x = np.cos(theta) * np.cos(phi)
    y = np.sin(theta) * np.cos(phi)
    z = np.sin(phi)
    values = .81 + .052 * np.sin(x * 14 + z * 13) * np.cos(y * 18 - z * 15)
    for scale, amplitude in ((24, .026), (45, .025), (87, .025), (135, .018)):
        values += amplitude * np.sin(x * scale * .8 + y * scale) * np.cos(y * scale * .62 + z * scale)
    rng = random.Random(52)
    for index in range(130):
        longitude = rng.uniform(0, TAU)
        altitude = rng.uniform(-1, 1)
        waist = math.sqrt(1 - altitude ** 2)
        distance = np.sqrt(
            (x - waist * math.cos(longitude)) ** 2 + (y - waist * math.sin(longitude)) ** 2 +
            (z - altitude) ** 2
        )
        radius = rng.uniform(.105, .25) if index < 10 else rng.uniform(.013, .09)
        values -= (.205 if index < 10 else .093) * np.exp(-((distance / radius) ** 4))
        values += (.049 if index < 10 else .064) * np.exp(-((distance - radius) / (radius * .16)) ** 2)
    pixels = np.ones((height, width, 4), dtype=np.float32)
    for channel, warmth in enumerate((1, .993, .975)):
        pixels[:, :, channel] = np.clip(values * warmth, .22, 1)
    result = bpy.data.images.new('Lunar maria and impact relief', width=width, height=height)
    result.pixels.foreach_set(pixels.ravel())
    result.update()
    result.pack()
    return result


def lamp():
    black = material('Lamp · honed Portoro black marble', (.021, .017, .014), .26, coat=.32)
    brass = material('Lamp · brushed champagne bronze', (.54, .317, .122), .29, .84)
    steel = material('Lamp · darkened gimbal bronze', (.17, .084, .033), .28, .74)
    lamp_glass = material('Custom accent · lunar porcelain', (.95, .83, .61), .46, emission=.55)
    grain(black, 43, .13, .013)
    plinth(black, brass, radius=.33, height=.09)
    profile('Lamp lower stem shoe', .09, .125, .108, .080, .009, brass)
    profile('Lamp flared lower collet', .125, .194, .074, .029, .008, steel)
    profile('Lamp tapered bronze stem', .189, .536, .021, .016, .004, brass)
    profile('Lamp upper stem shoe', .498, .55, .028, .065, .007, brass)
    profile('Globe mounting socket', .532, .591, .070, .076, .009, steel)
    for level, radius in ((.117, .08), (.156, .057), (.182, .035), (.53, .049), (.57, .073)):
        round_wire('Fine lathe line on hardware', (0, 0, level), (radius, radius), .0025, brass)
    orb = ellipsoid('Lunar globe', (0, 0, .849), (.258, .258, .258), lamp_glass,
                    (.13, -.21, .65), segments=64, rings=40)
    nodes = lamp_glass.node_tree.nodes
    links = lamp_glass.node_tree.links
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = lunar_texture()
    shader = nodes.get('Principled BSDF')
    links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .29
    bump.inputs['Distance'].default_value = .016
    links.new(texture.outputs['Color'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    orb.name = 'Frosted porcelain globe with lunar relief'

    for name, radius, wire, angles, surface in (
        ('Main orbit · polished brass', .340, .009, (1.16, .28, .08), brass),
        ('Main orbit · shadow trim', .356, .0035, (1.16, .28, .08), steel),
        ('Inclined orbit · fine bronze', .300, .0055, (.37, -.55, .37), brass),
    ):
        round_wire(name, (0, 0, .844), (radius, radius), wire, surface, angles, 96)
    rotation = Euler((1.16, .28, .08)).to_matrix()
    for theta in (0, math.pi):
        pivot = Vector((0, 0, .844)) + rotation @ Vector((.344 * math.cos(theta), .344 * math.sin(theta), 0))
        ellipsoid('Hand-turned gimbal pivot', pivot, (.024, .017, .017), brass, segments=24, rings=12)
        ellipsoid('Blackened gimbal screw', pivot + Vector((0, -.016, 0)),
                  (.009, .004, .009), steel, segments=16, rings=10)


def leaf_blade(name, start, middle, tip, width, surface, vein, angle):
    start, middle, tip = map(Vector, (start, middle, tip))
    across = Vector((-math.sin(angle), math.cos(angle), 0))
    verts = []
    faces = []
    length_segments = 16
    cross_segments = 8

    def point(t, side):
        center = (1 - t) ** 2 * start + 2 * (1 - t) * t * middle + t ** 2 * tip
        span = width * max(.013, math.sin(math.pi * t) ** .92) * (1.2 - .4 * t)
        lift = -.024 * side ** 2 * math.sin(math.pi * t) + .012 * side * math.sin(TAU * t)
        return center + across * (side * span) + Vector((0, 0, lift))

    for index in range(length_segments + 1):
        for side in range(cross_segments + 1):
            verts.append(point(index / length_segments, 2 * side / cross_segments - 1))
    stride = cross_segments + 1
    for row in range(length_segments):
        for column in range(cross_segments):
            index = row * stride + column
            faces.append((index, index + stride, index + stride + 1, index + 1))
    obj = mesh(name, verts, faces, surface, smooth=True)
    solid = obj.modifiers.new('Leaf thickness and soft edge', 'SOLIDIFY')
    solid.thickness = .0018
    solid.offset = -1
    spine = [point(index / 12, 0) + Vector((0, 0, .0014)) for index in range(12)]
    pipe(name + ' · midrib', spine, .0022, vein, sides=5)
    side_veins = []
    for side in (-1, 1):
        for index in range(1, 5):
            start_t = .105 + index * .125
            points = [
                point(start_t + p * .128, p * .87 * side) + Vector((0, 0, .0014))
                for p in (0, .25, .5, .75, 1)
            ]
            side_veins.append(pipe('Secondary leaf vein', points, .0008, vein, sides=4))
    join(side_veins, name + ' · secondary veins')


def planter():
    pottery = material('Custom accent · fluted ceramic glaze', (.232, .335, .283), .36, coat=.34)
    inside = material('Planter · charcoal interior glaze', (.076, .095, .081), .62)
    brass = material('Planter · antique brass ferrule', (.45, .248, .094), .33, .76)
    soil = material('Planter · coconut coir', (.035, .019, .011), .95)
    bark = material('Planter · bark chips', (.095, .050, .026), .94)
    stems = material('Planter · mature green stem', (.12, .195, .047), .64)
    veins = material('Planter · subtle olive veins', (.116, .248, .073), .57)
    leaves = [
        material('Planter · waxy leaf forest', (.031, .13, .048), .46, coat=.14),
        material('Planter · waxy leaf green', (.040, .181, .069), .42, coat=.15),
        material('Planter · pale new growth', (.105, .229, .053), .44, coat=.13),
    ]
    grain(soil, 68, .51, .017)
    profile('Recessed ceramic foot', 0, .037, .183, .193, .008, inside)
    profile('Brass ferrule around planter foot', .035, .073, .200, .218, .007, brass)
    lathe('Thirty-two sculpted ceramic flutes', [
        (.205, .07), (.220, .081), (.235, .116), (.254, .178), (.261, .23),
        (.265, .31), (.269, .365), (.265, .423), (.262, .458),
        (.255, .470), (.238, .468), (.232, .450), (.226, .40),
    ], pottery, 256, fluting=.008)
    lathe('Rolled ceramic lip', [
        (.261, .43), (.273, .439), (.278, .457), (.276, .471),
        (.265, .482), (.249, .481), (.239, .474), (.235, .459), (.236, .441), (.242, .428),
    ], pottery, 96, annulus=True)
    lathe('Thin brass reveal below planter rim', [
        (.263, .424), (.273, .424), (.275, .427), (.273, .430), (.264, .430),
    ], brass, 96, annulus=True)
    profile('Inset soil surface', .400, .440, .226, .235, .006, soil)
    chips = []
    for index in range(37):
        angle = random.random() * TAU
        radius = .214 * math.sqrt(random.random())
        size = random.uniform(.008, .019)
        chips.append(ellipsoid('Bark chip', (radius * math.cos(angle), radius * math.sin(angle), .441),
            (size, size * .46, .004), bark, (0, .2, angle + index), segments=9, rings=6))
    join(chips, 'Scattered bark on inset soil')

    for n, (angle, reach, height, curve, width) in enumerate((
        (-2.30, .36, .695, .14, .078), (-.56, .393, .752, .175, .081),
        (2.73, .33, .769, .17, .073), (1.02, .35, .833, .145, .063),
        (-1.61, .303, .877, .12, .061), (.04, .359, .935, .153, .072),
        (-2.98, .358, .978, .15, .075), (2.11, .271, 1.041, .135, .060),
        (-.59, .220, 1.127, .103, .053), (-2.29, .159, 1.176, .075, .045),
    )):
        dx, dy = math.cos(angle), math.sin(angle)
        base = Vector((dx * .034, dy * .034, .424))
        stem_tip = Vector((dx * reach * .43, dy * reach * .43, height - .073))
        control = Vector((dx * reach * .16, dy * reach * .16, height - .105))
        stem = [(1 - t / 8) ** 2 * base + 2 * (1 - t / 8) * (t / 8) * control +
                (t / 8) ** 2 * stem_tip for t in range(9)]
        pipe('Arched leaf stem %02d' % (n + 1), stem, .0061, stems)
        leaf_blade('Sculpted leaf %02d' % (n + 1), stem_tip,
                   (dx * reach * .70, dy * reach * .70, height + curve),
                   (dx * reach, dy * reach, height), width, leaves[min(n // 4, 2)], veins, angle)


def shard(name, base, radius, height, tilt, rotation, surfaces):
    sides = 6
    verts = []
    for row, (width, depth) in enumerate(((.82, 0), (1, .21), (.95, .73), (.57, .90))):
        for index in range(sides):
            angle = rotation + TAU * index / sides
            deviation = .84 + .16 * math.sin(index * 2.51 + rotation)
            verts.append((radius * width * deviation * math.cos(angle),
                          radius * width * deviation * math.sin(angle),
                          height * (depth + (.027 * math.sin(index * 3.12 + row) if row else 0))))
    verts.append((radius * .12, -radius * .15, height))
    matrix = Euler(tilt).to_matrix()
    verts = [Vector(base) + matrix @ Vector(vert) for vert in verts]
    faces = [tuple(reversed(range(sides)))]
    for row in range(3):
        for index in range(sides):
            a = row * sides + index
            b = row * sides + (index + 1) % sides
            if row == 2:
                faces.extend(((a, b, b + sides), (a, b + sides, a + sides)))
            else:
                faces.append((a, b, b + sides, a + sides))
    for index in range(sides):
        faces.append((18 + index, 18 + (index + 1) % sides, 24))
    obj = mesh(name, verts, faces, surfaces[0])
    for surface in surfaces[1:]:
        obj.data.materials.append(surface)
    for polygon in obj.data.polygons:
        index = polygon.index
        if index in {3, 8, 13, 16, 20, 24, 25, 28}:
            polygon.material_index = 1
        elif index in {6, 12, 15, 18, 22, 26, 29}:
            polygon.material_index = 2
    bevel = obj.modifiers.new('Narrow polished edges between facets', 'BEVEL')
    bevel.width = .002
    bevel.segments = 1


def crystal():
    brass = material('Crystal · brushed bronze setting', (.64, .371, .146), .27, .81)
    stone = material('Crystal · polished black stone', (.023, .029, .027), .27, coat=.31)
    matrix = material('Crystal · host basalt', (.055, .062, .059), .68)
    grain(matrix, 46, .34, .013)
    facets = [
        material('Custom accent · quartz body', (.085, .247, .318), .19, .22, coat=.55, emission=.045, transmission=.24),
        material('Custom accent · quartz polished facet', (.180, .404, .471), .15, .17, coat=.64, emission=.06, transmission=.19),
        material('Custom accent · quartz smoky facet', (.056, .153, .194), .23, .26, coat=.45, emission=.029, transmission=.17),
    ]
    plinth(stone, brass, radius=.373, height=.103)
    profile('Bronze bezel around host matrix', .098, .141, .321, .307, .007, brass)
    profile('Inset host basalt disc', .128, .164, .300, .298, .011, matrix)
    for index, (x, y, r, h, tilt_x, tilt_y) in enumerate((
        (.012, .054, .140, 1.000, .04, -.11),
        (-.115, -.023, .095, .764, -.07, -.28),
        (.119, -.043, .107, .677, .10, .27),
        (.168, .095, .074, .518, -.24, .31),
        (-.171, .110, .068, .486, -.23, -.23),
        (.008, -.142, .064, .542, .37, .10),
        (-.147, -.143, .065, .340, .37, -.29),
        (.117, -.169, .061, .306, .40, .24),
        (.023, .171, .051, .365, -.40, -.03),
        (-.222, .007, .052, .274, -.06, -.46),
        (.236, .021, .042, .235, -.18, .43),
    )):
        shard('Individual cut crystal %02d' % (index + 1), (x, y, .148), r, h,
              (tilt_x, tilt_y, .04 * index), index * .37, facets)
    inclusions = []
    for index in range(25):
        angle = random.random() * TAU
        radius = random.uniform(.202, .279)
        size = random.uniform(.012, .031)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size,
            location=(radius * math.cos(angle), radius * math.sin(angle), .162))
        obj = bpy.context.object
        obj.scale.z = .52
        obj.data.materials.append(matrix if index % 4 else brass)
        inclusions.append(obj)
    join(inclusions, 'Small mineral inclusions around the cluster')


def build_item(slug, builder):
    existing = set(bpy.context.scene.objects)
    builder()
    objects = [obj for obj in bpy.context.scene.objects if obj not in existing]
    collection = bpy.data.collections.new(slug)
    bpy.context.scene.collection.children.link(collection)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        for parent in list(obj.users_collection):
            parent.objects.unlink(obj)
        collection.objects.link(obj)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (slug + '.glb')),
        export_format='GLB', use_selection=True, export_apply=True,
        export_cameras=False, export_lights=False)
    return objects


def area_light(name, position, target, energy, size, color, width=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = 'RECTANGLE' if width else 'DISK'
    data.size = size
    if width:
        data.size_y = width
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def setup_studio(groups):
    for index, objects in enumerate(groups):
        for obj in objects:
            obj.location.x += (index - 1.5) * 1.10

    scene = bpy.context.scene
    world = bpy.data.worlds.new('Cool studio ambient')
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs[0].default_value = (.24, .31, .40, 1)
    world.node_tree.nodes.get('Background').inputs[1].default_value = .23
    scene.world = world
    backdrop = material('Studio · warm alabaster', (.351, .298, .229), .67)
    grain(backdrop, 39, .13, .007)
    mesh('Alabaster studio floor', [(-200, -200, -.001), (200, -200, -.001),
        (200, 200, -.001), (-200, 200, -.001)], [(0, 1, 2, 3)], backdrop)
    area_light('Warm silk softbox', (-2.9, -3.0, 4.4), (0, 0, .5), 395, 3.7, (1, .81, .66), 2.7)
    area_light('Tall cool fill', (3.7, -2.5, 2.8), (0, 0, .6), 240, 2.7, (.74, .85, 1), 1.3)
    area_light('Warm edge light', (.4, 2.7, 3.5), (0, 0, .6), 550, 3.2, (1, .88, .69), 1.5)
    area_light('Overhead reflection strip', (-.7, -.2, 4.5), (0, 0, .6), 75, 4.1, (1, .94, .85), .58)
    data = bpy.data.cameras.new('Accessory collection camera')
    camera = bpy.data.objects.new('Accessory collection camera', data)
    scene.collection.objects.link(camera)
    camera.location = (.07, -7.9, 2.75)
    camera.rotation_euler = (Vector((0, 0, .55)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    data.type = 'ORTHO'
    data.ortho_scale = 4.63
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 72
    scene.cycles.use_denoising = True
    if os.getenv('PALACE_METAL') == '1':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        try:
            prefs.compute_device_type = 'METAL'
            prefs.refresh_devices()
        except (RuntimeError, TypeError) as exc:
            print(f'Metal unavailable, rendering on the CPU ({exc})')
        else:
            for device in prefs.devices:
                device.use = device.type == 'METAL'
            if any(device.use for device in prefs.devices):
                scene.cycles.device = 'GPU'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = '//accessory-preview.png'
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = None
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / 'accessories.blend'), compress=True)
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    groups = [
        build_item('plush-bear', teddy),
        build_item('moon-lamp', lamp),
        build_item('plant', planter),
        build_item('crystal', crystal),
    ]
    setup_studio(groups)


if __name__ == '__main__':
    main()
