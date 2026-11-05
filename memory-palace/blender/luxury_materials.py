"""Generate seamless, metre-scaled PBR finishes for the editable scene and GLB."""

import struct
import zlib
from pathlib import Path

import bpy
import numpy as np


UV_NAME = 'Palace Surface'
SIZE = 512
TAU = 2 * np.pi
COORDS = np.arange(SIZE, dtype=np.float32) / SIZE
U, V = np.meshgrid(COORDS, COORDS)


class Grain:
    """Deterministic periodic value noise, including anisotropic fields."""

    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)

    def noise(self, columns, rows=None):
        rows = rows or columns
        grid = self.rng.uniform(-1, 1, (rows, columns)).astype(np.float32)
        x = COORDS * columns
        y = COORDS * rows
        ix, iy = x.astype(int), y.astype(int)
        fx, fy = x - ix, y - iy
        fx = fx * fx * (3 - 2 * fx)
        fy = (fy * fy * (3 - 2 * fy))[:, None]
        left = grid[iy[:, None], ix]
        right = grid[iy[:, None], (ix + 1) % columns]
        next_left = grid[((iy + 1) % rows)[:, None], ix]
        next_right = grid[((iy + 1) % rows)[:, None], (ix + 1) % columns]
        top = left + (right - left) * fx
        bottom = next_left + (next_right - next_left) * fx
        return top + (bottom - top) * fy


def tint(rgb, amount, response=(1, .95, .88)):
    return np.asarray(rgb) + amount[:, :, None] * np.asarray(response)


def travertine(g):
    bedding = V + .017 * g.noise(4, 3) + .006 * g.noise(9, 7)
    bands = np.sin(TAU * (13 * bedding + .22 * g.noise(5, 9)))
    seams = np.sin(TAU * (27 * bedding + .35 * g.noise(5, 16)))
    pore_field = g.noise(69, 146) + .24 * g.noise(12, 29)
    pores = np.clip((pore_field - .49) * 2.45, 0, 1) ** 2
    cloud = g.noise(8, 11)
    fine = g.noise(193)
    lightness = 10 * bands + 4 * seams + 9 * cloud + 3 * fine - 26 * pores
    return (
        tint((231, 221, 201), lightness),
        .57 - .035 * bands + .12 * pores + .05 * fine,
        .08 * bands + .035 * seams + .035 * fine - .43 * pores,
    )


def limestone(g):
    cloud = .68 * g.noise(6) + .32 * g.noise(19)
    grit = g.noise(169)
    flecks = np.clip((g.noise(109, 134) - .63) * 2.75, 0, 1) ** 2
    return (
        tint((235, 226, 209), 11 * cloud + 4.5 * grit - 13 * flecks),
        .61 + .044 * grit + .066 * flecks,
        .063 * grit - .12 * flecks + .045 * cloud,
    )


def calacatta(g):
    warp = .116 * g.noise(3, 3) + .038 * g.noise(7, 6) + .011 * g.noise(18, 16)
    flow = V - U + warp + .055 * np.sin(TAU * (V + U))
    section = .6 + .5 * g.noise(9, 10)
    primary = np.abs(np.sin(np.pi * flow))
    branches = np.abs(np.sin(np.pi * (flow + .055 + .039 * g.noise(6, 7))))
    faint = np.abs(np.sin(np.pi * (V + 2 * U + .11 * g.noise(5, 5))))
    mineral = np.exp(-(primary / (.032 * section + .006)) ** 1.45)
    halo = np.exp(-(primary / (.18 * section + .038)) ** 1.65)
    secondary = np.exp(-(branches / .017) ** 1.35) * np.clip(g.noise(5, 6) + .55, 0, 1)
    wisps = np.exp(-(faint / .022) ** 1.5) * np.clip(g.noise(8, 5) + .16, 0, 1)
    bloom = 5 * g.noise(7) + 2.5 * g.noise(24) + 1.5 * g.noise(93)
    stone = tint((239, 232, 218), bloom - 14 * halo, (1, 1.05, 1.17))
    veins = np.asarray((49, 48, 43)) * (mineral + .52 * secondary + .2 * wisps)[:, :, None]
    return (
        stone - veins,
        .325 + .048 * halo + .045 * mineral + .016 * g.noise(35),
        -.034 * mineral - .022 * secondary + .018 * g.noise(89),
    )


def timber(g, rgb, roughness):
    bend = .054 * g.noise(3, 4) + .021 * np.sin(TAU * U) + .007 * g.noise(7, 13)
    rings = V + bend
    growth = np.sin(TAU * (21 * rings + .35 * g.noise(4, 9)))
    winter = np.clip((growth - .55) * 2.2, 0, 1) ** 2
    fibers = g.noise(5, 186)
    pores = np.clip((g.noise(55, 225) - .47) * 2.1, 0, 1) ** 2
    tone = g.noise(4, 14)
    return (
        tint(rgb, 16 * tone + 9 * growth - 16 * winter + 7 * fibers - 14 * pores, (1, .79, .58)),
        roughness + .045 * winter + .04 * fibers + .062 * pores,
        .045 * growth + .053 * fibers - .12 * pores,
    )


def walnut(g):
    return timber(g, (173, 139, 108), .43)


def oak(g):
    return timber(g, (211, 183, 146), .47)


def boucle(g):
    jitter = g.noise(129)
    yarn = np.cos(TAU * (64 * U + .22 * jitter + .32 * np.cos(TAU * 56 * V)))
    rows = np.sin(TAU * (56 * V + .15 * jitter + .16 * np.sin(TAU * 64 * U)))
    raised = np.clip(.48 * yarn + .51 * rows + .18 * jitter, -.7, .9)
    tufts = g.noise(211)
    return (
        tint((234, 223, 201), 17 * raised + 6 * tufts + 6 * g.noise(8)),
        .81 + .075 * raised + .032 * tufts,
        .23 * raised + .09 * tufts,
    )


def velvet(g):
    nap = g.noise(78, 169)
    fibers = g.noise(171, 219)
    marks = g.noise(7, 11)
    return (
        tint((151, 172, 141), 8 * nap + 3.5 * fibers + 8 * marks, (1, .8, .62)),
        .64 + .04 * nap + .045 * marks,
        .10 * nap + .037 * fibers,
    )


def bronze(g):
    brush = .7 * g.noise(4, 212) + .3 * g.noise(19, 243)
    drift = g.noise(7, 19)
    return (
        tint((199, 175, 137), 5 * drift + 4 * brush, (1, .77, .56)),
        .38 + .068 * brush + .028 * drift,
        .084 * brush,
    )


def _png(path, values):
    """Write exact sRGB color bytes or untransformed linear data bytes."""
    pixels = np.rint(np.clip(values, 0, 255)).astype(np.uint8)
    color_type = 2 if pixels.ndim == 3 else 0

    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload))

    header = struct.pack('>IIBBBBB', SIZE, SIZE, 8, color_type, 0, 0, 0)
    rows = b''.join(b'\x00' + row.tobytes() for row in pixels)
    path.write_bytes(
        b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(rows, 7)) + chunk(b'IEND', b'')
    )


def _normal_map(height):
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * .5
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * .5
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    return 127.5 * (normal / np.linalg.norm(normal, axis=2, keepdims=True) + 1)


def _attach_maps(material, folder, slug, sample, seed, *, metal=0, coat=0, sheen=0, anisotropy=0):
    color, roughness, height = sample(Grain(seed))
    graph = material.node_tree
    bsdf = graph.nodes.get('Principled BSDF')
    srgb = np.clip(color.mean(axis=(0, 1)) / 255, 0, 1)
    linear = ((srgb + .055) / 1.055) ** 2.4
    material.diffuse_color = (*linear, 1)
    bsdf.inputs['Base Color'].default_value = material.diffuse_color
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = float(roughness.mean())
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = .24
    if sheen:
        bsdf.inputs['Sheen Weight'].default_value = 1
        bsdf.inputs['Sheen Tint'].default_value = (sheen, sheen * .82, sheen * .68, 1)
        bsdf.inputs['Sheen Roughness'].default_value = .48
    if anisotropy:
        socket = bsdf.inputs.get('Anisotropic') or bsdf.inputs.get('Anisotropic IOR Level')
        if socket is not None:
            socket.default_value = anisotropy
    for suffix, label, values, color_space, y in (
        ('color', 'Base Color', color, 'sRGB', 280),
        ('roughness', 'Roughness', 255 * roughness, 'Non-Color', -15),
        ('normal', 'Surface relief', _normal_map(height), 'Non-Color', -310),
    ):
        path = folder / f'{slug}-{suffix}.png'
        _png(path, values)
        image = bpy.data.images.load(str(path), check_existing=True)
        image.colorspace_settings.name = color_space
        image.pack()
        image.filepath = f'//textures/{path.name}'
        texture = graph.nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.label = label
        texture.location = (-660, y)
        if suffix == 'normal':
            normal = graph.nodes.new('ShaderNodeNormalMap')
            normal.location = (-330, y)
            graph.links.new(texture.outputs['Color'], normal.inputs['Color'])
            graph.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
        else:
            graph.links.new(texture.outputs['Color'], bsdf.inputs[label])
    material['palace_textured'] = True
    material['map_source'] = 'Procedural, generated for Memory Palace'


def _unwrap(obj, tile, directional):
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    mesh = obj.data
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name=UV_NAME)
    layer.active_render = True
    world = obj.matrix_world
    if directional:
        scale = world.to_scale()
        coords = [tuple(v.co[axis] * scale[axis] for axis in range(3)) for v in mesh.vertices]
        dimensions = obj.dimensions
        translation = world.to_quaternion().inverted() @ world.translation
        coords = [tuple(value + translation[axis] for axis, value in enumerate(co)) for co in coords]
    else:
        coords = [world @ v.co for v in mesh.vertices]
        normal_matrix = world.to_3x3().inverted_safe().transposed()
    uv = np.empty((len(mesh.loops), 2), dtype=np.float32)
    for face in mesh.polygons:
        normal = face.normal if directional else normal_matrix @ face.normal
        axis = max(range(3), key=lambda index: abs(normal[index]))
        u, v = ((1, 2), (0, 2), (0, 1))[axis]
        orientation = -1 if axis == 1 else 1
        if directional and dimensions[v] > dimensions[u]:
            u, v = v, u
            orientation *= -1
        if normal[axis] < 0:
            orientation *= -1
        for loop_index, vert_index in zip(face.loop_indices, face.vertices):
            point = coords[vert_index]
            uv[loop_index] = point[u] / tile[0], orientation * point[v] / tile[1]
    layer.data.foreach_set('uv', uv.ravel())


def enhance_materials(ns):
    """Apply finish maps before saving the editable file or batching web meshes."""
    mats = ns['M']
    out = Path(ns['OUT']) / 'textures'
    out.mkdir(parents=True, exist_ok=True)
    sand = mats['floor'].copy()
    sand.name = 'Raked garden sand'
    velvet_material = mats['rug'].copy()
    velvet_material.name = 'Sage velvet'
    mats['trim'].name = '02 · Honed ivory limestone'
    mats['gold'].name = '05 · Satin champagne bronze'
    mats['floor'].name = '09 · Calacatta ivory marble'
    mats['flower'].name = '18 · Ivory bouclé'
    finishes = (
        (mats['stone'], 'travertine', travertine, (3.20, 1.64), False, {}),
        (mats['trim'], 'limestone', limestone, (1.65, 1.65), False, {}),
        (mats['floor'], 'calacatta', calacatta, (5.35, 4.30), False, {'coat': .15}),
        (mats['wood'], 'walnut', walnut, (2.65, .68), True, {'coat': .13}),
        (mats['woodlight'], 'oak', oak, (2.65, .75), True, {'coat': .10}),
        (mats['flower'], 'boucle', boucle, (.28, .28), False, {'sheen': .22}),
        (velvet_material, 'velvet', velvet, (.24, .24), True, {'sheen': .38}),
        (mats['gold'], 'bronze', bronze, (.84, .22), True, {'metal': .88, 'anisotropy': .33}),
    )
    projections = {}
    for seed, (material, slug, sample, tile, directional, parameters) in enumerate(finishes, 173):
        _attach_maps(material, out, slug, sample, seed, **parameters)
        projections[material] = tile, directional
    bpy.context.view_layer.update()
    count = 0
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or not obj.data.materials:
            continue
        material = obj.data.materials[0]
        if material == mats['floor'] and 'Raked sand' in obj.name:
            obj.data.materials[0] = sand
            continue
        if material == mats['rug'] and obj.name.startswith(('Velvet armchair cushion', 'Armchair high back')):
            obj.data.materials[0] = material = velvet_material
        if material in projections:
            _unwrap(obj, *projections[material])
            count += 1
    print(f'PALACE_MATERIALS {len(finishes)} PBR finishes, {count} UV-mapped meshes')
