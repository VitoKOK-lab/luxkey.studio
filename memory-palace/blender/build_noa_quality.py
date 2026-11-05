"""Build NOA's editable prototype, web rig and Cycles portrait.

Run Blender in background with --python blender/build_noa_quality.py.
Pass -- --no-render to skip the portrait or -- --draft for a quick studio check.
Set NOA_METAL=1 to use Cycles Metal. The rig uses meters and Blender -Y forward.
"""
import argparse
from collections import defaultdict
from math import cos, pi, sin
import os
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_robot_animals import Workshop, coord, material


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'quality'
PORTRAIT = ROOT / 'assets' / 'renders' / 'quality-noa.png'


def tile_image(name, channels):
    size = channels.shape[0]
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = channels
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(rgba.ravel())
    image.update()
    image.pack()
    return image


def finish_maps(mat, roughness, *, seed, brushed=False):
    """Bake periodic microtexture into two small packed, web-compatible maps."""
    size = 256
    rng = np.random.default_rng(seed)
    frequencies = np.fft.fftfreq(size)
    x, y = np.meshgrid(frequencies, frequencies)
    power = (x / (.055 if brushed else .25)) ** 2 + (y / .22) ** 2
    height = np.fft.ifft2(np.fft.fft2(rng.normal(size=(size, size))) * np.exp(-power)).real
    height /= height.std()
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * .07
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * .07
    normals = np.stack((-dx, -dy, np.ones_like(height)), axis=2)
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    normal_image = tile_image(f'{mat.name} · tangent normal', normals * .5 + .5)
    rough = np.clip(roughness + height * (.032 if brushed else .022), .18, .72)
    rough_image = tile_image(f'{mat.name} · roughness', np.repeat(rough[:, :, None], 3, axis=2))
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    normal_texture = nodes.new('ShaderNodeTexImage')
    normal_texture.image = normal_image
    normal_texture.location = (-560, 0)
    normal = nodes.new('ShaderNodeNormalMap')
    normal.location = (-280, 0)
    normal.inputs['Strength'].default_value = .40
    links.new(normal_texture.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    rough_texture = nodes.new('ShaderNodeTexImage')
    rough_texture.image = rough_image
    rough_texture.location = (-560, 270)
    links.new(rough_texture.outputs['Color'], shader.inputs['Roughness'])


def profile_value(sections, y):
    """Interpolate the width, center and height through sculpted cross sections."""
    segment = next((i for i in range(len(sections)-1) if y <= sections[i+1][0]), len(sections)-2)
    a, b = sections[segment:segment+2]
    previous = sections[max(0, segment-1)]
    following = sections[min(len(sections)-1, segment+2)]
    span = b[0] - a[0]
    t = (y-a[0]) / span
    result = []
    for column in range(1, 4):
        start, end = a[column], b[column]
        start_slope = (end-previous[column]) / (b[0]-previous[0])
        end_slope = (following[column]-start) / (following[0]-a[0])
        result.append(
            (2*t**3 - 3*t**2 + 1)*start + (-2*t**3 + 3*t**2)*end
            + (t**3 - 2*t**2 + t)*span*start_slope + (t**3 - t**2)*span*end_slope
        )
    return result


def interpolate(a, b, t):
    return a + (b-a)*t


class NOA(Workshop):
    def __init__(self):
        self.scene = bpy.context.scene
        self.scene.name = 'NOA · industrial design prototype'
        self.pivots, self.parts = {}, {}
        self.white = material('NOA warm sintered ceramic', 'CAC0AE', .39, coat=.08)
        self.ivory = material('NOA pearl-grey ceramic', 'B8B3A6', .44, coat=.06)
        self.dark = material('NOA anodized graphite', '525650', .46, metal=.43)
        self.rubber = material('NOA graphite silicone', '272D2B', .65)
        self.gold = material('NOA brushed champagne titanium', 'C2A781', .40, metal=.60)
        self.lens = material('NOA smoked jade optical glass', '224640', .27, metal=.12, coat=.21)
        self.eye = material('Steward Glow · mint optical core', '91DDCD', .34, emission=.36)
        self.legend = material('NOA mineral enamel markings', '302F29', .65)
        for seed, (surface, roughness) in enumerate(((self.white, .39), (self.ivory, .44), (self.gold, .40)), 15):
            finish_maps(surface, roughness, seed=seed, brushed=surface == self.gold)

    def mesh(self, name, points, faces, mat, parent, *, uvs=None, smooth=False):
        data = bpy.data.meshes.new(name)
        data.from_pydata([coord(point) for point in points], [], faces)
        data.update()
        uv_layer = data.uv_layers.new()
        for poly in data.polygons:
            poly.use_smooth = smooth
            axis = max(range(3), key=lambda i: abs(poly.normal[i]))
            projection = tuple(i for i in range(3) if i != axis)
            for loop_index in poly.loop_indices:
                index = data.loops[loop_index].vertex_index
                uv_layer.data[loop_index].uv = (
                    uvs[index] if uvs is not None
                    else tuple(data.vertices[index].co[i] / .20 for i in projection)
                )
        return self.place(bpy.data.objects.new(name, data), name, (0, 0, 0), parent, mat)

    def shroud(self, name, sections, limits, angles, mat, parent, *, offset=0, steps=(16, 24)):
        """Make an individually removable, hollow panel with a physical rolled edge."""
        n, m = steps
        points, uvs = [], []
        for i in range(n+1):
            for j in range(m+1):
                angle = interpolate(*angles, j/m)
                lo, hi = limits(angle)
                y = interpolate(lo, hi, i/n)
                width, center, height = profile_value(sections, y)
                points.append(((width+offset)*sin(angle), y, center+(height+offset)*cos(angle)))
                uvs.append((angle*.19/.24, y/.24))
        faces = [(i*(m+1)+j, (i+1)*(m+1)+j, (i+1)*(m+1)+j+1, i*(m+1)+j+1)
                 for i in range(n) for j in range(m)]
        obj = self.mesh(name, points, faces, mat, parent, uvs=uvs, smooth=True)
        solidify = obj.modifiers.new('Molded panel thickness', 'SOLIDIFY')
        solidify.thickness = .006
        edge = obj.modifiers.new('Ceramic edge radius', 'BEVEL')
        edge.width, edge.segments = .003, 3
        return obj

    def plate_in_plane(self, name, center, profile, depth, bevel, mat, parent, *, normal=(0, 1, 0), angle=0):
        n = Vector(normal).normalized()
        u = n.cross(Vector((0, 0, 1)))
        if u.length < .01:
            u = Vector((1, 0, 0))
        u.normalize()
        v = u.cross(n).normalized()
        u, v = u*cos(angle) + v*sin(angle), v*cos(angle) - u*sin(angle)
        center = Vector(center)
        points = [center + u*x + v*z + n*d for d in (-depth, 0) for x, z in profile]
        count = len(profile)
        faces = [tuple(range(count)), tuple(reversed(range(count, count*2)))]
        faces.extend((i, i+count, (i+1)%count+count, (i+1)%count) for i in range(count))
        obj = self.mesh(name, points, faces, mat, parent)
        # Profiles can be mirrored. In each case keep the normals outward.
        import bmesh
        edit = bmesh.new()
        edit.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(edit, faces=edit.faces)
        edit.to_mesh(obj.data)
        edit.free()
        edge = obj.modifiers.new('Machined edge radius', 'BEVEL')
        edge.width, edge.segments = bevel, 3
        obj.modifiers.new('Weighted plate normals', 'WEIGHTED_NORMAL')
        return obj

    def panel(self, name, center, width, height, depth, bevel, mat, parent, *, normal=(0, 1, 0), angle=0):
        a, b = width/2, height/2
        corner = min(a, b)*.48
        profile = [(-a+corner, -b), (a-corner, -b), (a, -b+corner), (a, b-corner),
                   (a-corner, b), (-a+corner, b), (-a, b-corner), (-a, -b+corner)]
        return self.plate_in_plane(name, center, profile, depth, bevel, mat, parent,
                                   normal=normal, angle=angle)

    def fastener(self, name, p, r, parent, *, normal=(0, 1, 0)):
        """A flush, bevelled fastener with a recessed six-flat drive socket."""
        n = Vector(normal).normalized()
        u = n.cross(Vector((0, 0, 1)))
        if u.length < .01:
            u = Vector((1, 0, 0))
        u.normalize()
        v = n.cross(u)
        p = Vector(p)
        count = 18
        points = []
        for radius, depth, socket in ((r*.91, -.003, False), (r, -.001, False),
                                      (r*.85, .001, False), (r*.43, .001, True),
                                      (r*.43, -.003, True)):
            for i in range(count):
                a = i*2*pi/count
                distance = radius
                if socket:
                    distance *= cos(pi/6) / cos((a + pi/6) % (pi/3) - pi/6)
                points.append(p + (u*cos(a) + v*sin(a))*distance + n*depth)
        faces = [(layer*count+i, (layer+1)*count+i, (layer+1)*count+(i+1)%count, layer*count+(i+1)%count)
                 for layer in range(4) for i in range(count)]
        faces.append(tuple(reversed(range(4*count, 5*count))))
        obj = self.mesh(name, points, faces, self.gold, parent)
        obj.data.materials.append(self.rubber)
        obj.data.polygons[-1].material_index = 1

    def text(self, name, message, p, size, parent, *, side=0, mat=None):
        glyphs = bpy.data.curves.new(name, 'FONT')
        glyphs.body = message
        glyphs.size, glyphs.space_character = size, 1.13
        glyphs.align_x = 'CENTER'
        glyphs.align_y = 'CENTER'
        glyphs.resolution_u = 3
        obj = self.place(bpy.data.objects.new(name, glyphs), name, p, parent, mat or self.legend)
        axes = ((0, side, 0), (0, 0, 1), (side, 0, 0)) if side else ((1, 0, 0), (0, 0, 1), (0, -1, 0))
        obj.rotation_euler = Matrix(axes).transposed().to_euler()

    def sleeve(self, name, a, b, radius, mat, parent, *, capped=False):
        axis = (b-a).normalized()
        u = axis.cross(Vector((1, 0, 0))).normalized()
        v = axis.cross(u)
        count = 20
        rings = ((0, .70), (.085, .91), (.21, 1.0), (.77, .84),
                 (.94, .58 if capped else .73), (1.0, .16 if capped else .65))
        points = [a.lerp(b, t) + radius*r*(u*cos(i*2*pi/count)+v*sin(i*2*pi/count))
                  for t, r in rings for i in range(count)]
        faces = [(j*count+i, (j+1)*count+i, (j+1)*count+(i+1)%count, j*count+(i+1)%count)
                 for j in range(len(rings)-1) for i in range(count)]
        faces.extend((tuple(range(count)), tuple(reversed(range(len(points)-count, len(points))))))
        self.mesh(name, points, faces, mat, parent, smooth=True)

    def chassis(self, body):
        sections = (
            (-.447, .022, .544, .026), (-.431, .102, .546, .069),
            (-.384, .185, .549, .118), (-.286, .222, .552, .157),
            (-.124, .218, .550, .158), (.057, .225, .556, .161),
            (.219, .243, .567, .178), (.311, .214, .582, .175),
            (.370, .166, .588, .145), (.414, .108, .598, .104),
            (.442, .029, .606, .047),
        )

        def aft(angle):
            return -.251 + .029*cos(angle)

        def fore(angle):
            return .220 - .046*cos(angle)

        self.shroud('Recessed graphite monocoque', sections, lambda angle: (-.447, .442),
                    (-pi, pi), self.rubber, body, offset=-.011, steps=(30, 32))
        self.shroud('Aft ceramic cowl', sections, lambda a: (-.446, aft(a)-.0035),
                    (-pi+.014, pi-.014), self.white, body, steps=(10, 32))
        self.shroud('Front ceramic shoulder yoke', sections, lambda a: (fore(a)+.0035, .435),
                    (-pi+.014, pi-.014), self.white, body, steps=(12, 32))
        self.shroud('Upper ceramic service panel', sections, lambda a: (aft(a)+.0035, fore(a)-.0035),
                    (-1.095, 1.095), self.white, body, steps=(16, 22))
        self.shroud('Lower dust guard', sections, lambda a: (aft(a)+.0035, fore(a)-.0035),
                    (1.132, 2*pi-1.132), self.ivory, body, offset=-.003, steps=(16, 26))
        self.ell('Aft socket dust cap', (0,-.429,.545), (.070,.020,.060), self.rubber, body)
        self.ell('Chest transponder socket', (0,.425,.599), (.077,.031,.075), self.rubber, body, fine=True)

        self.pin('Recessed collar base', (0, .303, .732), .123, .085, self.dark, body, normal=(0, .23, 1))
        self.pin('Neck preload ring', (0, .307, .766), .126, .022, self.gold, body, normal=(0, .23, 1), vertices=28)
        self.pin('Neck isolation mount', (0, .319, .783), .103, .038, self.rubber, body, normal=(0, .23, 1))
        self.panel('Chest transponder seat', (0, .452, .590), .129, .093, .022, .010, self.rubber, body)
        self.panel('Titanium chest badge', (0, .464, .591), .102, .067, .018, .008, self.gold, body)
        self.text('Chest identifier', 'NOA', (0, .465, .601), .026, body)
        self.panel('Breathing status indicator', (0, .466, .578), .035, .006, .004, .002, self.eye, body)
        for side in (-1, 1):
            normal = (side, 0, 0)
            self.panel('Side radiator well', (side*.222, -.121, .551), .133, .063, .020, .009,
                       self.rubber, body, normal=normal, angle=.10*side)
            for i in range(4):
                self.panel('Recessed heatsink vane', (side*.224, -.162 + i*.025, .552), .011, .039,
                           .009, .003, self.dark, body, normal=normal, angle=.28*side)
            self.panel('Identification plate gasket', (side*.228, .055, .557), .131, .070, .019,
                       .009, self.rubber, body, normal=normal)
            self.panel('Inset chassis identity plate', (side*.233, .055, .557), .119, .060, .010,
                       .007, self.gold, body, normal=normal)
            self.text('Chassis ID NOA', 'N O A', (side*.234, .055, .568), .025, body, side=side)
            self.text('Chassis serial 01', 'STEWARD  /  01', (side*.234, .055, .545),
                      .011, body, side=side)
            self.fastener('Cowl captive screw', (side*.189, .235, .668), .009, body,
                          normal=(side, .10, .42))
            self.fastener('Aft cowl captive screw', (side*.189, -.318, .623), .009, body,
                          normal=(side, -.25, .33))

    def tail_assembly(self, body):
        tail = self.joint('Tail', (0, -.383, .586), body)
        points = tuple(map(Vector, ((0,-.366,.565),(0,-.498,.636),(.023,-.602,.735),
                                    (.046,-.665,.842),(.062,-.674,.915))))
        for index, (a, b, radius) in enumerate(zip(points, points[1:], (.054, .048, .039, .028))):
            axis = (b-a).normalized()
            self.ell('Tail flexible coupling', a, (radius*.81,)*3, self.rubber, tail)
            self.pin('Tail collar ring', a.lerp(b, .17), radius*.93, .013, self.gold, tail,
                     normal=axis, vertices=20, bevel=.002)
            self.sleeve('Tail ceramic sleeve', a.lerp(b, .17), a.lerp(b, 1.04), radius,
                        self.white if index < 3 else self.ivory, tail, capped=index == 3)
        self.panel('Tail tip activity indicator', (.062, -.680, .902), .020, .010, .006,
                   .003, self.eye, tail, normal=(0, -1, .4))

    def quadruped(self, body):
        for side, letter in ((-1, 'L'), (1, 'R')):
            normal = (side, 0, 0)
            for row, f in (('F', 1), ('B', -1)):
                y = f*.298
                hip = (side*.227, y, .50)
                knee = (side*.245, y+.028*f, .268)
                foot = (side*.253, y+.052, .061)
                leg = self.joint(f'Leg_{row}{letter}', hip, body)
                shin = self.joint(f'Shin_{row}{letter}', knee, leg)
                self.pin('Hip main graphite hub', hip, .094, .121, self.rubber, leg, normal=normal, vertices=24)
                self.pin('Outer hip bearing seat', (side*.283, y, .50), .089, .022, self.dark, leg,
                         normal=normal, vertices=28)
                self.pin('Machined hip bearing race', (side*.299, y, .50), .079, .018, self.gold, leg,
                         normal=normal, vertices=32, bevel=.003)
                self.pin('Hip ceramic service disk', (side*.311, y, .50), .063, .020, self.white, leg,
                         normal=normal, vertices=32, bevel=.006)
                for angle in (-pi/2, pi/6, pi*5/6):
                    self.fastener('Hip disk captive screw', (side*.321, y+.044*cos(angle), .50+.044*sin(angle)),
                                  .007, leg, normal=normal)
                self.ell('Hip witness mark', (side*.322, y, .502), (.0014, .014, .0035), self.dark, leg)
                self.link('Structural upper link', (hip[0], y, .503), (knee[0], knee[1], .232),
                          (.038, .043), self.dark, leg)
                thigh = [(-.059,.447), (-.051,.479), (.047,.479), (.061,.437),
                         (.049,.365), (.021,.299), (-.027,.310), (-.049,.353)]
                self.plate_in_plane('Ceramic upper link cover', (side*.305, y+.011*f, 0), thigh, .108, .014,
                                    self.ivory, leg, normal=normal)
                self.pin('Knee polyurethane damper', knee, .058, .104, self.rubber, shin,
                         normal=normal, vertices=24)
                self.pin('Knee bearing race', (side*.296, knee[1], knee[2]), .047, .016, self.gold, shin,
                         normal=normal, vertices=24, bevel=.003)
                self.pin('Knee center spindle', (side*.307, knee[1], knee[2]), .033, .016, self.dark, shin,
                         normal=normal, vertices=20, bevel=.003)
                self.fastener('Knee spindle captive screw', (side*.315, knee[1], knee[2]), .011, shin, normal=normal)
                self.link('Graphite shin strut', (knee[0], knee[1], .279), foot, (.033, .036), self.dark, shin)
                link = [(-.049,.231), (.043,.224), (.040,.158), (.037,.103),
                        (.014,.083), (-.029,.093), (-.043,.136)]
                self.plate_in_plane('Shin ceramic skid guard', (side*.302, knee[1]+.011, 0), link,
                                    .092, .012, self.white, shin, normal=normal, angle=.015*side)
                x, toe_y, _ = foot
                foot_profile = [(-.077,-.044), (-.055,-.080), (.055,-.080), (.077,-.044),
                                (.078,.057), (.053,.089), (-.053,.089), (-.078,.057)]
                self.plate_in_plane('Molded silicone paw base', (x, toe_y+.012, .044), foot_profile,
                                    .044, .011, self.rubber, shin, normal=(0, 0, 1))
                shell_profile = [(px*.94, py*.94) for px, py in foot_profile]
                self.plate_in_plane('Ceramic toe bumper', (x, toe_y+.012, .088), shell_profile,
                                    .052, .018, self.white, shin, normal=(0, 0, 1))
                for toe in (-1, 0, 1):
                    self.panel('Separate grippy toe pad', (x+toe*.040, toe_y+.101-abs(toe)*.009, .032),
                               .033, .033, .025, .006, self.rubber, shin)
                self.panel('Toe flex isolation seam', (x, toe_y+.061, .090), .110, .006, .009,
                           .002, self.dark, shin, normal=(0, 0, 1))

    def head_assembly(self, body):
        head = self.joint('Head', (0, .331, .776), body)
        self.joint('EyeCamera', (0, .735, .895), head)
        self.ell('Graphite helmet chassis', (0,.373,.865), (.200,.169,.145), self.dark, head, fine=True)
        helmet = (
            (.185,.039,.861,.038), (.208,.128,.866,.088), (.265,.183,.870,.126),
            (.351,.215,.871,.160), (.416,.212,.873,.151), (.476,.190,.870,.130),
            (.522,.160,.868,.102), (.550,.125,.870,.067), (.563,.060,.875,.030),
        )
        self.shroud('Ceramic helmet crown', helmet, lambda a: (.191, .551-.021*abs(sin(a))),
                    (-1.70, 1.70), self.white, head, steps=(21, 30))
        self.shroud('Separate ceramic helmet lower cheek', helmet, lambda a: (.196, .530),
                    (1.75, 2*pi-1.75), self.ivory, head, offset=-.003, steps=(18, 20))

        visor_shape = [(-.175,.915), (-.142,.956), (-.086,.964), (0,.951), (.086,.964),
                       (.142,.956), (.175,.915), (.156,.850), (.104,.831), (0,.834),
                       (-.104,.831), (-.156,.850)]
        self.plate_in_plane('Graphite optical module seal', (0,.555,0), visor_shape,
                            .092,.023,self.rubber,head)
        shield = [(x*.94, (z-.895)*.87+.895) for x,z in visor_shape]
        self.plate_in_plane('Smoked jade instrument visor', (0,.566,0), shield,
                            .052,.017,self.lens,head)
        for side in (-1, 1):
            x = side*.079
            self.ell('Frosted graphite lens seat', (x,.563,.895), (.059,.014,.042), self.dark, head, fine=True)
            self.ell('Layered dark optical bezel', (x,.573,.895), (.052,.013,.036), self.rubber, head, fine=True)
            self.ell('Smoked jade focusing lens', (x,.582,.895), (.047,.013,.030), self.lens, head, fine=True)
            eye = self.joint('Eye_L' if side < 0 else 'Eye_R', (x,.598,.895), head)
            self.ell('Gentle turquoise optical aperture', (x,.595,.895), (.034,.006,.021), self.eye, eye, fine=True)
            self.ell('Inner jade pupil', (x,.599,.895), (.017,.004,.013), self.lens, eye)
            self.ell('Small optical highlight', (x-.011,.601,.904), (.005,.0014,.0035), self.eye, eye)
            self.fastener('Optical module service screw', (side*.159,.562,.903), .008, head)
            self.fastener('Helmet rear service screw', (side*.180,.299,.880), .010, head, normal=(side,-.18,0))
        self.panel('Bridge stereo depth port', (0,.568,.902), .026,.017,.006,.004,self.dark,head)
        self.pin('Bridge depth lens', (0,.571,.902), .005,.008,self.lens,head,vertices=16,bevel=.001)
        muzzle = ((.494,.075,.786,.052), (.523,.108,.779,.063), (.578,.116,.770,.064),
                  (.629,.111,.768,.058), (.678,.096,.774,.046), (.704,.071,.784,.033),
                  (.722,.040,.794,.023))
        self.shroud('Muzzle graphite isolation gasket', muzzle, lambda a: (.495,.722),
                    (-pi, pi), self.rubber, head, offset=-.007, steps=(16, 22))
        self.shroud('Sculpted ceramic upper snout', muzzle, lambda a: (.495,.719),
                    (-1.51, 1.51), self.white, head, steps=(16, 18))
        self.shroud('Separate ceramic jaw plate', muzzle, lambda a: (.495,.715),
                    (1.65, 2*pi-1.65), self.ivory, head, steps=(16, 18))
        nose = [(-.054,.827), (-.034,.841), (.034,.841), (.054,.827), (.039,.796), (0,.787), (-.039,.796)]
        self.plate_in_plane('Graphite nose sensor cover', (0,.743,0), nose,.062,.013,self.dark,head)
        self.panel('Nose sensor lens', (0,.747,.815), .058,.023,.011,.006,self.lens,head)
        for side in (-1, 1):
            self.pin('Nose microphone port', (side*.037,.744,.818), .005,.004,self.rubber,head,vertices=14,bevel=.001)
        for side, letter in ((-1,'L'), (1,'R')):
            self.ear(head, side, letter)

    def ear(self, head, side, letter):
        ear = self.joint(f'Ear_{letter}', (side*.176,.343,.927), head)
        self.pin('Graphite swivelling ear hinge', (side*.200,.345,.929), .056,.067,self.dark,ear,
                 normal=(side,0,0), vertices=24)
        self.pin('Titanium ear bearing trim', (side*.230,.345,.929), .047,.013,self.gold,ear,
                 normal=(side,0,0),vertices=24,bevel=.003)
        outline = ((.174,.970),(.208,1.013),(.252,1.012),(.287,.978),(.315,.900),
                   (.309,.833),(.280,.794),(.245,.808),(.221,.859),(.207,.918))
        points = [(side*x,z) for x,z in outline]
        self.plate_in_plane('Soft ear cowl edge seal', (0,.394,0), points,.075,.023,self.rubber,ear)
        inlay = [(side*(x*.94+.016), (z-.89)*.91+.895) for x,z in outline]
        self.plate_in_plane('Ceramic ear outer cowl', (0,.409,0), inlay,.071,.021,self.white,ear)
        inset = ((.220,.973),(.245,.986),(.267,.964),(.290,.899),(.286,.850),(.271,.831),(.254,.842),(.242,.881))
        self.plate_in_plane('Recessed ear acoustic panel', (0,.415,0), [(side*x,z) for x,z in inset],
                            .027,.010,self.dark,ear)
        for i in range(4):
            self.panel('Ear microphone slot', (side*(.252+i*.005),.416,.941-i*.021),
                       .021,.005,.003,.0017,self.rubber,ear,angle=side*.2)
        self.fastener('Ear hinge captive screw', (side*.236,.416,.962), .008, ear)

    def build(self):
        body = self.start('dog', .895, .735)
        self.collection.name = 'NOA · articulated steward'
        self.root['identity'] = 'NOA'
        self.chassis(body)
        self.tail_assembly(body)
        self.quadruped(body)
        self.head_assembly(body)

    def export_web(self):
        """Join evaluated meshes under each animated pivot, preserving the editable originals."""
        groups = defaultdict(list)
        for obj in self.objects:
            if obj.type in {'MESH', 'FONT'}:
                groups[obj.parent].append(obj)
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        web_meshes = []
        for parent, parts in groups.items():
            name = f'NOA · {parent.name} surfaces'
            combined = bpy.data.objects.new(name, bpy.data.meshes.new(name))
            self.collection.objects.link(combined)
            combined.parent = parent
            duplicates = []
            for source in parts:
                evaluated = source.evaluated_get(graph)
                data = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=graph)
                duplicate = bpy.data.objects.new(source.name + ' · export', data)
                self.collection.objects.link(duplicate)
                duplicate.parent = parent
                duplicate.matrix_local = source.matrix_local
                duplicates.append(duplicate)
            bpy.ops.object.select_all(action='DESELECT')
            for obj in duplicates:
                obj.select_set(True)
            combined.select_set(True)
            bpy.context.view_layer.objects.active = combined
            bpy.ops.object.join()
            budget = combined.modifiers.new('Web mesh reduction', 'DECIMATE')
            budget.ratio = .54
            bpy.ops.object.modifier_apply(modifier=budget.name)
            web_meshes.append(combined)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.objects:
            if obj.type == 'EMPTY':
                obj.select_set(True)
        for obj in web_meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = self.root
        bpy.ops.export_scene.gltf(filepath=str(OUT / 'robot-noa.glb'), use_selection=True,
                                  export_extras=True, export_cameras=False,
                                  export_lights=False, export_animations=False)
        for obj in web_meshes:
            bpy.data.objects.remove(obj, do_unlink=True)

    def studio(self, draft):
        self.use('Portrait · Cycles lighting')
        floor = material('Studio warm mushroom mineral plaster', '8B8175', .78)
        bpy.ops.mesh.primitive_plane_add(size=200)
        self.place(bpy.context.object, 'Seamless studio floor', (0,0,-.0015), mat=floor)
        world = bpy.data.worlds.new('Quiet neutral studio bounce')
        world.use_nodes = True
        world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.74,.80,.79,1)
        world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .24
        self.scene.world = world

        def area(name, location, target, power, size, color):
            data = bpy.data.lights.new(name, 'AREA')
            data.energy, data.size, data.color = power, size, color
            obj = bpy.data.objects.new(name, data)
            self.collection.objects.link(obj)
            obj.location = location
            obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

        area('Large warm window', (-2.4,-3.0,4.2), (0,0,.55), 410, 3.1, (1,.93,.85))
        area('Directional torso bounce', (2.3,-1.15,2.1), (0,0,.46), 105, 2.0, (.85,.94,1))
        area('Rear contour softbox', (.55,2.25,2.7), (0,0,.54), 265, 1.9, (1,.89,.73))
        data = bpy.data.cameras.new('NOA three-quarter portrait')
        camera = bpy.data.objects.new(data.name, data)
        self.collection.objects.link(camera)
        camera.location = (2.60,-3.08,1.58)
        camera.rotation_euler = (Vector((0,-.015,.477))-camera.location).to_track_quat('-Z','Y').to_euler()
        data.lens = 69
        self.scene.camera = camera
        self.scene.render.engine = 'CYCLES'
        self.scene.cycles.use_denoising = True
        self.scene.cycles.samples = 22 if draft else 64
        self.scene.cycles.adaptive_threshold = .018
        self.scene.cycles.max_bounces = 7
        if os.environ.get('NOA_METAL') == '1':
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'METAL'
            prefs.get_devices()
            for device in prefs.devices:
                device.use = device.type == 'METAL'
            if any(device.use for device in prefs.devices):
                self.scene.cycles.device = 'GPU'
        self.scene.view_settings.view_transform = 'AgX'
        self.scene.view_settings.look = 'AgX - Medium High Contrast'
        self.scene.render.resolution_x = 900 if draft else 1600
        self.scene.render.resolution_y = 563 if draft else 1000
        self.scene.render.resolution_percentage = 100
        self.scene.render.image_settings.file_format = 'PNG'
        self.scene.render.image_settings.color_mode = 'RGB'
        self.scene.render.filepath = str(Path('/tmp/noa-quality-draft.png') if draft else PORTRAIT)
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == 'VIEW_3D':
                    area.spaces.active.region_3d.view_perspective = 'CAMERA'
                    area.spaces.active.shading.color_type = 'MATERIAL'
                    area.spaces.active.overlay.show_overlays = False
        bpy.ops.object.select_all(action='DESELECT')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--draft', action='store_true')
    parser.add_argument('--no-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    PORTRAIT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    noa = NOA()
    noa.build()
    if not args.draft:
        noa.export_web()
    noa.studio(args.draft)
    if not args.draft:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'robot-noa.blend'), compress=True)
    if not args.no_render:
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
