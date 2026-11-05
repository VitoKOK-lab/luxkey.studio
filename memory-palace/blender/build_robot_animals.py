"""Build the three steward models, web GLBs, and a Cycles studio portrait.

Run with Blender --background --python blender/build_robot_animals.py.
Use -- --no-render to regenerate only the editable source and GLBs, or
-- --draft for a fast portrait. STEWARD_METAL=1 enables Cycles Metal.
In this source +F (forward) is Blender -Y and glTF +Z. Dimensions are meters.
"""
import argparse
from math import radians
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parents[1] / 'assets' / 'stewards'
SPECIES = ('dog', 'cat', 'owl')
AXIS_Z = Vector((0, 0, 1))


def coord(p):
    return Vector((p[0], -p[1], p[2]))


def linear(s):
    return s / 12.92 if s < .04045 else ((s + .055) / 1.055) ** 2.4


def material(name, hex_color, roughness, metal=0, coat=0, emission=0):
    rgb = tuple(linear(int(hex_color[i:i+2], 16) / 255) for i in (0, 2, 4))
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb, 1)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


class Workshop:
    def __init__(self):
        self.scene = bpy.context.scene
        self.scene.name = 'Steward workshop'
        self.pivots = {}
        self.parts = {}
        self.white = material('Oyster porcelain', 'EEE7D9', .33, coat=.23)
        self.ivory = material('Satin alabaster', 'FCF7EA', .38, coat=.13)
        self.dark = material('Sage graphite polymer', '404D46', .46)
        self.rubber = material('Quiet moss elastomer', '57675B', .63)
        self.gold = material('Brushed champagne', 'C7A878', .34, .68)
        self.highlight = material('Soft champagne bevel', 'E4C9A0', .32, .56)
        self.accent = material('Steward accent · eucalyptus ceramic', '9EB4A3', .39, coat=.17)
        self.lens = material('Deep jade optical glass', '21473E', .22, .19, .32)
        self.iris = material('Eucalyptus optical ring', '8BD1AF', .28, .10, .44, .55)
        self.eye = material('Steward Glow · mint optical core', 'B8F6D1', .25, coat=.26, emission=.52)
        self.glint = material('Ivory optical reflection', 'E4FFEE', .22, emission=.48)

    def use(self, name):
        self.collection = bpy.data.collections.new(name)
        self.scene.collection.children.link(self.collection)
        self.objects = []

    def place(self, obj, name, p, parent=None, mat=None):
        obj.name = name
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        self.collection.objects.link(obj)
        self.objects.append(obj)
        obj.parent = parent
        obj.location = coord(p) - self.pivots.get(parent, Vector((0, 0, 0)))
        if mat:
            obj.data.materials.append(mat)
        return obj

    def joint(self, name, p, parent=None):
        obj = bpy.data.objects.new(name, None)
        obj.empty_display_type = 'PLAIN_AXES'
        obj.empty_display_size = .075
        self.place(obj, name, p, parent)
        self.pivots[obj] = coord(p)
        return obj

    def ell(self, name, p, r, mat, parent=None, *, tilt=0, roll=0, twist=0, fine=False):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28 if fine else 20, ring_count=16 if fine else 10)
        obj = bpy.context.object
        obj.scale = r
        obj.rotation_euler = tuple(radians(i) for i in (tilt, roll, twist))
        self.place(obj, name, p, parent, mat)
        for poly in obj.data.polygons:
            poly.use_smooth = True
        return obj

    def link(self, name, a, b, r, mat, parent=None, *, fine=False):
        mid = tuple((x+y)/2 for x, y in zip(a, b))
        axis = coord(b) - coord(a)
        obj = self.ell(name, mid, (*r, axis.length/2), mat, parent, fine=fine)
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = AXIS_Z.rotation_difference(axis.normalized())
        return obj

    def pin(self, name, p, radius, depth, mat, parent=None, *, normal=(0, 1, 0), vertices=20, bevel=.005):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
        obj = self.place(bpy.context.object, name, p, parent, mat)
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = AXIS_Z.rotation_difference(coord(normal).normalized())
        if bevel:
            modifier = obj.modifiers.new('Machined lip', 'BEVEL')
            modifier.width = bevel
            modifier.segments = 2
            obj.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
        return obj

    def ring(self, name, p, major, minor, mat, parent=None, *, normal=(0, 1, 0), x=1, z=1):
        bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=8, major_radius=major, minor_radius=minor)
        obj = self.place(bpy.context.object, name, p, parent, mat)
        obj.scale = (x, z, 1)
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = AXIS_Z.rotation_difference(coord(normal).normalized())
        for poly in obj.data.polygons:
            poly.use_smooth = True
        return obj

    def plate(self, name, profile, front, depth, bevel, mat, parent):
        # A softly bevelled prism for ceramic pieces with distinctive silhouettes.
        n = len(profile)
        verts = [coord((x, y, z)) for y in (front - depth, front) for x, z in profile]
        faces = [tuple(range(n)), tuple(reversed(range(n, n*2)))]
        faces += [(i, i+n, (i+1)%n+n, (i+1)%n) for i in range(n)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.validate()
        # Ensure the profile may be specified in either winding without inverted normals.
        import bmesh
        edit = bmesh.new()
        edit.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(edit, faces=edit.faces)
        edit.to_mesh(mesh)
        edit.free()
        obj = self.place(bpy.data.objects.new(name, mesh), name, (0, 0, 0), parent, mat)
        mod = obj.modifiers.new('Soft ceramic edges', 'BEVEL')
        mod.width, mod.segments = bevel, 4
        obj.modifiers.new('Ceramic face normals', 'WEIGHTED_NORMAL')
        return obj

    def stroke(self, name, points, radius, mat, parent):
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        curve.resolution_u = 10
        curve.bevel_depth = radius
        curve.bevel_resolution = 2
        curve.use_fill_caps = True
        line = curve.splines.new('BEZIER')
        line.bezier_points.add(len(points) - 1)
        for ctrl, point in zip(line.bezier_points, points):
            ctrl.co = coord(point)
            ctrl.handle_left_type = ctrl.handle_right_type = 'AUTO'
        return self.place(bpy.data.objects.new(name, curve), name, (0, 0, 0), parent, mat)

    def screw(self, name, p, r, parent, normal=(0, 1, 0)):
        self.pin(name, p, r, .009, self.highlight, parent, normal=normal, vertices=12, bevel=.002)
        x, y, z = p
        n = Vector(normal)
        q = Vector((0, 0, 1)) if abs(n.z) < .8 else Vector((0, 1, 0))
        line = n.cross(q).normalized()
        p = Vector(p) + n*.005
        self.link('Screw slot', p-line*r*.66, p+line*r*.66, (.0025, .0025), self.rubber, parent)

    def sensor(self, x, y, z, width, height, head):
        self.ell('Champagne eye surround', (x, y-.006, z), (width*1.14, .022, height*1.13), self.highlight, head)
        self.ell('Jade lens', (x, y+.008, z), (width, .020, height), self.lens, head, fine=True)
        eye = self.joint('Eye_L' if x < 0 else 'Eye_R', (x, y+.034, z), head)
        self.ell('Eucalyptus iris', (x, y+.026, z), (width*.54, .010, height*.71), self.iris, eye)
        self.ell('Mint iris center', (x, y+.034, z), (width*.30, .006, height*.50), self.eye, eye)
        self.ell('Lens highlight', (x-width*.25, y+.036, z+height*.37), (.009, .004, .008), self.glint, eye)

    def quadruped_legs(self, body, kind):
        dog = kind == 'dog'
        x = .227 if dog else .155
        for lateral, letter in ((-1, 'L'), (1, 'R')):
            for front, f in (('F', 1), ('B', -1)):
                z = .50 if dog else .438
                py = f*(.298 if dog else .272)
                hip = (lateral*x, py, z)
                knee = (lateral*(x+.018), py+.028*f, .268 if dog else .225)
                foot = (lateral*(x+.026), py+.052, .061 if dog else .056)
                leg = self.joint(f'Leg_{front}{letter}', hip, body)
                shin = self.joint(f'Shin_{front}{letter}', knee, leg)
                hip_r = .094 if dog else .073
                # Nested visible rotary bearings around a soft polymer core.
                self.pin('Hip bearing', hip, hip_r, .125 if dog else .093, self.rubber, leg, normal=(1, 0, 0))
                hx = lateral*(x+(.066 if dog else .048))
                self.pin('Champagne hip ring', (hx, py, z), hip_r*.88, .017, self.gold, leg, normal=(lateral, 0, 0))
                self.pin('Porcelain hip cap', (hx+lateral*.013, py, z), hip_r*.68, .017, self.ivory, leg, normal=(lateral, 0, 0))
                self.screw('Hip service screw', (hx+lateral*.023, py, z), .014 if dog else .012, leg, normal=(lateral, 0, 0))
                self.link('Porcelain thigh', (hip[0], py, z+.022), (knee[0], knee[1], knee[2]-.030), (.069 if dog else .053, .077 if dog else .054), self.white, leg)
                self.ell('Flexible knee', knee, (.061 if dog else .048, .061 if dog else .048, .061 if dog else .048), self.rubber, shin)
                self.pin('Knee plate', (knee[0]+lateral*(.059 if dog else .045), knee[1], knee[2]), .043 if dog else .034, .016, self.highlight, shin, normal=(lateral, 0, 0))
                self.link('Tapered shin', (knee[0], knee[1], knee[2]+.018), foot, (.055 if dog else .042, .063 if dog else .050), self.ivory, shin)
                self.ell('Rubber sole', (foot[0], foot[1]+.017, .033), (.083 if dog else .067, .107 if dog else .079, .033), self.rubber, shin)
                self.ell('Ceramic paw', (foot[0], foot[1]+.021, .070 if dog else .066), (.085 if dog else .068, .101 if dog else .081, .053 if dog else .046), self.white, shin, fine=True)
                for toe in (-1, 0, 1):
                    self.ell('Quiet toe pad', (foot[0]+toe*(.042 if dog else .033), foot[1]+(.088 if dog else .074)-abs(toe)*.009, .059), (.023 if dog else .017, .032 if dog else .026, .021), self.accent, shin)

    def start(self, kind, eye_height, eye_forward):
        self.use(f'{kind.title()} · articulated steward')
        self.root = self.joint('Robot_' + kind.title(), (0, 0, 0))
        self.root['species'] = kind
        self.root['eye_height'] = eye_height
        self.root['eye_forward'] = eye_forward
        self.parts[kind] = (self.collection, self.root, self.objects)
        return self.joint('Body', (0, 0, 0), self.root)

    def dog(self):
        body = self.start('dog', .895, .735)
        self.ell('Porcelain chassis', (0, -.008, .547), (.241, .430, .185), self.white, body, fine=True)
        self.ell('Champagne belly gasket', (0, .016, .483), (.216, .363, .126), self.gold, body, fine=True)
        self.ell('Sculpted belly shell', (0, .020, .462), (.212, .354, .115), self.ivory, body, fine=True)
        self.ell('Eucalyptus saddle inlay', (0, -.045, .660), (.191, .306, .092), self.accent, body, fine=True)
        self.ell('Porcelain saddle lid', (0, -.042, .698), (.142, .244, .063), self.ivory, body, fine=True)
        self.ell('Padded breastplate', (0, .283, .585), (.181, .179, .206), self.white, body, fine=True)
        self.pin('Neck rotation bearing', (0, .294, .722), .121, .130, self.rubber, body, normal=(0, .24, 1))
        self.pin('Champagne collar', (0, .307, .762), .133, .051, self.gold, body, normal=(0, .24, 1))
        self.ell('Pendant bezel', (0, .433, .604), (.056, .025, .055), self.highlight, body)
        self.ell('Eucalyptus pendant', (0, .453, .606), (.045, .016, .043), self.accent, body)
        self.ell('Pendant status light', (0, .465, .608), (.020, .005, .005), self.iris, body)
        for s in (-1, 1):
            for i in range(3):
                self.ell('Shoulder intake', (s*(.212-i*.007), -.11+i*.036, .605+i*.008), (.010, .008, .020), self.rubber, body, tilt=-15)
        self.quadruped_legs(body, 'dog')
        tail = self.joint('Tail', (0, -.383, .586), body)
        knots = ((0,-.365,.565),(0,-.502,.641),(.024,-.617,.743),(.051,-.686,.856),(.061,-.690,.931))
        self.tail(knots, (.056, .048, .040, .031), tail)
        head = self.joint('Head', (0, .331, .776), body)
        self.joint('EyeCamera', (0, .735, .895), head)
        self.ell('Porcelain skull', (0, .373, .851), (.221, .197, .178), self.white, head, fine=True)
        self.ell('Eucalyptus visor surround', (0, .472, .871), (.185, .111, .124), self.accent, head, fine=True)
        self.ell('Soft jade visor', (0, .508, .881), (.160, .067, .098), self.rubber, head, fine=True)
        for s in (-1, 1):
            self.sensor(s*.079, .564, .895, .057, .042, head)
            self.ell('Canine cheek cap', (s*.129, .503, .800), (.072, .074, .065), self.white, head)
        self.ell('Ceramic muzzle bridge', (0, .550, .814), (.103, .128, .054), self.ivory, head, fine=True)
        self.ell('Quiet muzzle gasket', (0, .587, .779), (.110, .123, .040), self.rubber, head)
        self.ell('Rounded ivory muzzle', (0, .601, .790), (.115, .128, .055), self.ivory, head, fine=True)
        self.ell('Jade nose', (0, .711, .810), (.063, .042, .031), self.lens, head, fine=True)
        for s in (-1, 1):
            self.ell('Nose microphone', (s*.019, .748, .814), (.010, .006, .006), self.rubber, head)
        self.stroke('Gentle mouth seam', [(-.072,.682,.776),(-.039,.712,.763),(0,.728,.770),(.039,.712,.763),(.072,.682,.776)], .003, self.rubber, head)
        for s, name in ((-1, 'L'), (1, 'R')):
            ear = self.joint(f'Ear_{name}', (s*.176,.343,.927), head)
            self.pin('Ear bearing', (s*.201,.346,.927), .063, .064, self.gold, ear, normal=(s,0,0))
            profile = [(s*x,z) for x,z in ((.166,.967),(.203,1.025),(.246,1.028),(.291,.994),(.323,.891),(.303,.796),(.265,.773),(.232,.806),(.208,.893))]
            self.plate('Floppy ear shell', profile, .394, .095, .031, self.ivory, ear)
            profile = [(s*x,z) for x,z in ((.215,.977),(.245,.990),(.270,.961),(.291,.891),(.279,.826),(.258,.820),(.234,.891))]
            self.plate('Eucalyptus ear insert', profile, .405, .028, .016, self.accent, ear)
            self.screw('Ear service screw', (s*.229,.410,.950), .013, ear)

    def tail(self, knots, radii, tail):
        for i, (a, b, r) in enumerate(zip(knots, knots[1:], radii)):
            self.ell('Tail flex coupling', a, (r*.75, r*.75, r*.75), self.rubber, tail)
            start = tuple(x+(y-x)*.045 for x, y in zip(a, b))
            end = tuple(y+(y-x)*.055 for x, y in zip(a, b))
            self.link('Curved tail shell', start, end, (r, r), self.ivory if i < len(radii)-1 else self.accent, tail)

    def cat(self):
        body = self.start('cat', .800, .530)
        self.ell('Alabaster torso', (0, -.028, .467), (.171, .386, .151), self.white, body, fine=True)
        self.ell('Champagne chassis seam', (0, -.022, .458), (.173, .337, .110), self.gold, body, fine=True)
        self.ell('Underside porcelain shell', (0, -.009, .439), (.169, .335, .113), self.ivory, body)
        self.ell('Curved eucalyptus saddle', (0, -.042, .568), (.140, .282, .066), self.accent, body, fine=True)
        self.ell('Saddle centre shell', (0, -.044, .596), (.101, .214, .047), self.ivory, body)
        self.ell('Tapered breast shell', (0, .260, .506), (.137, .141, .164), self.ivory, body, fine=True)
        self.pin('Soft neck joint', (0, .251, .622), .099, .119, self.rubber, body, normal=(0, .38, 1))
        self.pin('Champagne collar', (0, .274, .658), .112, .043, self.highlight, body, normal=(0, .38, 1))
        self.ell('Collar clasp', (0, .383, .592), (.040, .017, .040), self.gold, body)
        self.ell('Clasp status light', (0, .399, .594), (.018, .006, .018), self.iris, body)
        self.quadruped_legs(body, 'cat')
        tail = self.joint('Tail', (0, -.364, .535), body)
        knots = ((0,-.355,.526),(-.020,-.468,.586),(-.044,-.551,.681),(-.056,-.590,.796),(-.040,-.598,.899),(.002,-.585,.979),(.067,-.550,1.023),(.119,-.505,1.020),(.149,-.465,.984))
        self.tail(knots, (.047,.044,.039,.034,.029,.026,.023,.020), tail)
        head = self.joint('Head', (0, .296, .684), body)
        self.joint('EyeCamera', (0, .530, .800), head)
        self.ell('Feline porcelain skull', (0, .320, .774), (.184, .144, .142), self.white, head, fine=True)
        self.ell('Feline eucalyptus face rim', (0, .398, .784), (.163, .071, .100), self.accent, head, fine=True)
        self.ell('Jade facial lens', (0, .428, .791), (.148, .043, .078), self.rubber, head, fine=True)
        for s in (-1, 1):
            self.sensor(s*.072, .464, .800, .054, .037, head)
            self.ell('Rounded whisker cheek', (s*.062,.460,.729), (.077,.053,.041), self.ivory, head, fine=True)
            for i in range(3):
                p = (s*(.090+i*.015),.504-i*.005,.734-i*.013)
                self.ell('Whisker root', p, (.007,.005,.005), self.gold, head)
                tip = (s*(.272-i*.018),.525-i*.012,.765-i*.036)
                self.stroke('Champagne sensory whisker', [p,(s*.171,.513,.747-i*.018),tip], .0028, self.highlight, head)
                self.ell('Whisker sensing bead', tip, (.005,.005,.005), self.gold, head)
        self.plate('Feline nose', [(-.030,.755),(0,.725),(.030,.755),(.019,.766),(-.019,.766)], .522,.029,.010,self.lens,head)
        self.stroke('Mouth seam', [(-.040,.503,.712),(-.019,.515,.704),(0,.521,.721),(.019,.515,.704),(.040,.503,.712)], .0028, self.rubber, head)
        for s, name in ((-1, 'L'), (1, 'R')):
            ear = self.joint(f'Ear_{name}', (s*.123,.288,.869), head)
            self.pin('Ear hinge', (s*.143,.304,.861), .048, .069, self.gold, ear, normal=(s,0,0))
            profile = [(s*x,z) for x,z in ((.055,.874),(.107,.963),(.164,1.040),(.184,1.043),(.204,1.021),(.217,.878),(.196,.848),(.137,.848))]
            self.plate('Pointed porcelain ear', profile,.351,.080,.027,self.ivory,ear)
            profile = [(s*x,z) for x,z in ((.101,.891),(.168,1.000),(.180,1.005),(.190,.993),(.196,.892),(.181,.875),(.143,.876))]
            self.plate('Eucalyptus ear insert', profile,.364,.029,.013,self.accent,ear)
            self.screw('Ear service screw', (s*.159,.370,.898), .010, ear)

    def owl(self):
        body = self.start('owl', .934, .351)
        self.ell('Owl body shell', (0,-.024,.524), (.278,.232,.385), self.white, body, fine=True)
        self.ell('Champagne breast bezel', (0,.110,.494), (.229,.149,.298), self.highlight, body, fine=True)
        self.ell('Layered porcelain breast', (0,.143,.493), (.216,.130,.278), self.ivory, body, fine=True)
        for row in range(3):
            for i in (-1,0,1):
                z = .458-row*.074
                x = i*(.094-row*.015)
                y = .267-abs(i)*.020-row*.017
                self.ell('Porcelain breast feather', (x,y,z), (.061,.018,.054), self.white if row%2 == 0 else self.accent, body, roll=-i*12)
        for s, name in ((-1, 'L'), (1, 'R')):
            leg = self.joint(f'Leg_{name}', (s*.121,.042,.250), body)
            self.link('Owl foot stem', (s*.121,.042,.252), (s*.131,.086,.061), (.049,.049), self.gold, leg)
            self.ell('Owl paw gasket', (s*.130,.087,.046), (.082,.100,.046), self.rubber, leg)
            for j in (-1, 0, 1):
                self.ell('Champagne toe', (s*.130+j*.047,.130-.018*abs(j),.054), (.028,.085,.043), self.highlight, leg, twist=j*10)
                self.ell('Padded toe tip', (s*.130+j*.052,.195-.018*abs(j),.046), (.024,.025,.030), self.rubber, leg)
            wing = self.joint(f'Wing_{name}', (s*.242,.005,.683), body)
            self.pin('Wing rotary joint', (s*.261,.005,.682), .098, .080, self.rubber, wing, normal=(s,0,0))
            self.ell('Eucalyptus wing', (s*.267,-.025,.538), (.100,.147,.248), self.accent, wing, roll=s*-10, tilt=-16, fine=True)
            for i in range(5):
                a = (s*(.274+i*.012),.101-i*.038,.641+i*.003)
                b = (s*(.266+i*.013),-.027-i*.049,.300+i*.028)
                self.link('Layered champagne flight feather', a,b,(.038,.060),self.gold,wing)
                self.link('Layered porcelain flight feather', (a[0]+s*.018,a[1]+.019,a[2]),(b[0]+s*.019,b[1]+.013,b[2]+.016),(.033,.053),self.white,wing)
            for i in range(3):
                a = (s*(.303+i*.021), .158-i*.012, .581+i*.017)
                b = (s*(.260+i*.045), .136-i*.011, .321+i*.033)
                self.link('Champagne-edged wing panel', a,b,(.041,.034),self.gold,wing)
                self.link('Curved wing cover feather', (a[0],a[1]+.018,a[2]-.009),
                          (b[0],b[1]+.013,b[2]+.016),(.034,.030),
                          self.ivory if i % 2 == 0 else self.accent,wing)
            self.ell('Porcelain shoulder cover', (s*.287,.061,.668), (.085,.115,.135), self.ivory, wing, roll=s*-13, tilt=-13, fine=True)
            self.screw('Wing service screw', (s*.370,.049,.686), .015, wing, normal=(s,0,0))
        self.ell('Owl tail fan', (0,-.203,.271), (.147,.135,.101), self.accent, body, tilt=-26)
        for i in (-1,0,1):
            self.link('Owl tail porcelain feather', (i*.064,-.197,.369), (i*.097,-.289,.152), (.043,.045), self.white, body)
        self.pin('Hidden owl neck bearing', (0,0,.782), .178, .104, self.gold, body, normal=(0,0,1))
        head = self.joint('Head', (0,.027,.778), body)
        self.joint('EyeCamera', (0, .351, .934), head)
        self.ell('Owl head shell', (0,.017,.923), (.304,.223,.239), self.white, head, fine=True)
        self.ell('Eucalyptus face panel', (0,.169,.927), (.264,.108,.185), self.accent, head, fine=True)
        for s in (-1,1):
            x = s*.119
            self.ell('Ivory face disc', (x,.231,.937), (.144,.060,.151), self.ivory, head, fine=True)
            self.ring('Champagne face disc rim', (x,.278,.935), .104,.012,self.highlight,head,x=1.03,z=1.08)
            self.ell('Owl jade lens', (x,.283,.934), (.101,.040,.107), self.lens, head, fine=True)
            eye = self.joint('Eye_L' if x < 0 else 'Eye_R', (x,.324,.934), head)
            self.ring('Owl optical ring', (x,.315,.934), .069,.010,self.iris,eye,x=1,z=1.04)
            self.ell('Owl mint pupil', (x,.324,.934), (.039,.012,.044), self.eye, eye, fine=True)
            self.ell('Owl lens reflection', (x-.041,.331,.979), (.015,.006,.015), self.glint, eye)
            self.ell('Porcelain brow crest', (s*.156,.185,1.066), (.111,.065,.054), self.white, head, roll=-s*23)
        self.plate('Champagne owl beak', [(-.049,.872),(-.032,.900),(0,.911),(.032,.900),(.049,.872),(.019,.822),(0,.804),(-.019,.822)],.325,.073,.024,self.gold,head)
        self.ell('Satin beak ridge', (0,.331,.870), (.023,.016,.027), self.highlight, head)

    def build_and_export(self, kind):
        # Joint names from earlier animals were namespaced after their exports.
        getattr(self, kind)()
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = self.root
        bpy.ops.export_scene.gltf(
            filepath=str(OUT / f'robot-{kind}.glb'),
            use_selection=True,
            export_apply=True,
            export_extras=True,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
        for obj in self.objects:
            if obj.type == 'EMPTY' and obj != self.root:
                # Keep authored export names in case an individual animal is re-exported.
                obj['joint'] = obj.name
                obj.name = f'{kind.title()} · {obj.name}'

    def setup_studio(self, draft):
        self.use('Studio · portrait only')
        scene = self.scene
        for kind, x, y, yaw in [('dog', -1.17, .065, -16), ('cat', -.035, .17, 13), ('owl', 1.085, -.02, -7)]:
            root = self.parts[kind][1]
            root.location = (x, y, 0)
            root.rotation_euler.z = radians(yaw)

        stone = material('Warm studio limestone', 'D8C9B3', .72)
        bpy.ops.mesh.primitive_plane_add(size=200)
        self.place(bpy.context.object, 'Warm seamless studio floor', (0,0,-.002), mat=stone)
        world = bpy.data.worlds.new('Soft neutral daylight')
        world.use_nodes = True
        world.node_tree.nodes.get('Background').inputs[0].default_value = (.72,.78,.79,1)
        world.node_tree.nodes.get('Background').inputs[1].default_value = .35
        scene.world = world

        def area(name, pos, target, power, size, color):
            data = bpy.data.lights.new(name, 'AREA')
            data.energy, data.shape, data.size, data.color = power, 'DISK', size, color
            obj = bpy.data.objects.new(name, data)
            self.collection.objects.link(obj)
            obj.location = pos
            obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

        area('Broad warm window', (-3.7,-4.0,5.4), (0,0,0), 610, 4.3, (1,.90,.78))
        area('Porcelain fill', (3.6,-1.7,3.2), (0,0,.5), 230, 4.0, (.87,.96,1))
        area('Champagne rim light', (.75,3.8,4.3), (0,0,.4), 540, 4.3, (1,.88,.72))
        camera = bpy.data.cameras.new('Studio portrait')
        obj = bpy.data.objects.new('Studio portrait', camera)
        self.collection.objects.link(obj)
        obj.location = (.45,-5.2,2.02)
        obj.rotation_euler = (Vector((0,.01,.56))-obj.location).to_track_quat('-Z','Y').to_euler()
        camera.type = 'ORTHO'
        camera.ortho_scale = 3.75
        scene.camera = obj
        scene.render.engine = 'CYCLES'
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 7
        scene.cycles.samples = 24 if draft else 56
        scene.cycles.adaptive_threshold = .025
        if os.environ.get('STEWARD_METAL') == '1':
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'METAL'
            prefs.get_devices()
            for device in prefs.devices:
                device.use = device.type == 'METAL'
            if any(device.use for device in prefs.devices):
                scene.cycles.device = 'GPU'
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
        scene.view_settings.exposure = .37
        scene.render.resolution_x = 900 if draft else 1800
        scene.render.resolution_y = 500 if draft else 1000
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGB'
        scene.render.filepath = str(Path('/tmp/robot-animals-draft.png') if draft else OUT / 'robot-animals-preview.png')
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == 'VIEW_3D':
                    viewport = area.spaces.active
                    viewport.region_3d.view_perspective = 'CAMERA'
                    viewport.shading.color_type = 'MATERIAL'
                    viewport.overlay.show_overlays = False
        bpy.ops.object.select_all(action='DESELECT')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--draft', action='store_true')
    parser.add_argument('--no-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    workshop = Workshop()
    for kind in SPECIES:
        workshop.build_and_export(kind)
    workshop.setup_studio(args.draft)
    if not args.draft:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'robot-animals.blend'), compress=True)
    if not args.no_render:
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
