"""Architectural joinery and furniture fittings for the editable estate.

Build these after the base rooms and landmarks. Every fitting is independently
editable and inherits its host floor and room; none adds navigation collision.
"""
from math import cos, pi, sin, tau
from re import sub

from mathutils import Vector


def rounded_rect(w, d, r, steps=5):
    """Counterclockwise plan, in metres, with true radius corners."""
    r = min(r, w / 2, d / 2)
    corners = [(w/2-r, d/2-r), (-w/2+r, d/2-r),
               (-w/2+r, -d/2+r), (w/2-r, -d/2+r)]
    return [(x+r*cos((i+j/steps)*pi/2), y+r*sin((i+j/steps)*pi/2))
            for i, (x, y) in enumerate(corners) for j in range(steps+1)]


class Joinery:
    def __init__(self, ns):
        self.ns = ns
        self.count = 0

    def room(self, floor, room):
        self.ns['CURRENT_FLOOR'] = floor
        self.ns['CURRENT_ROOM'] = room

    def box(self, name, x, y, z, w, d, h, m, edge=0):
        self.count += 1
        return self.ns['box'](name, x, y, z, w, d, h, m, edge, part='finish')

    def disk(self, name, xyz, r, depth, m, verts=32):
        self.count += 1
        o = self.ns['cyl'](name, xyz, r, depth, m, verts, part='finish')
        for p in o.data.polygons:
            p.use_smooth = len(p.vertices) == 4
        return o

    def mesh(self, name, verts, faces, m, smooth=False):
        self.count += 1
        mid = tuple((min(v[i] for v in verts)+max(v[i] for v in verts))*.5 for i in range(3))
        obj = self.ns['mesh'](name, [tuple(a-b for a, b in zip(v, mid)) for v in verts], faces, m)
        obj.location = mid
        obj['part'] = 'finish'
        if smooth:
            for p in obj.data.polygons:
                p.use_smooth = True
        return obj

    def profile(self, name, xyz, section, material, verts=48, axis=None):
        """Turn a closed radial profile; the supplied section winds CCW in r/z."""
        center = Vector(xyz)
        rot = Vector(axis).to_track_quat('Z', 'Y') if axis is not None else None
        pts = [Vector((r*cos(tau*i/verts), r*sin(tau*i/verts), z))
               for r, z in section for i in range(verts)]
        faces = []
        for j in range(len(section)):
            a, b = j*verts, ((j+1) % len(section))*verts
            for i in range(verts):
                k = (i+1) % verts
                faces.append((a+i, a+k, b+k, b+i))
        o = self.mesh(name, [tuple(center + (rot @ p if rot else p)) for p in pts], faces, material)
        for j, (r, z) in enumerate(section):
            if abs(z-section[(j+1) % len(section)][1]) > .0001:
                for p in list(o.data.polygons)[j*verts:(j+1)*verts]:
                    p.use_smooth = True
        return o

    def ring(self, name, xyz, r, width, height, material, verts=48, axis=None):
        return self.profile(name, xyz, [(r-width, -height/2), (r, -height/2),
                          (r, height/2), (r-width, height/2)], material, verts, axis)

    def band(self, name, xyz, w, d, radius, width, material, thickness=.006):
        x, y, z = xyz
        outer = rounded_rect(w, d, radius)
        inner = rounded_rect(w-2*width, d-2*width, max(.005, radius-width))
        n = len(outer)
        verts = [(x+a, y+b, z+h) for ring, h in [(outer, -thickness/2), (outer, thickness/2),
                  (inner, thickness/2), (inner, -thickness/2)] for a, b in ring]
        faces = [(j*n+i, j*n+(i+1)%n, ((j+1)%4)*n+(i+1)%n, ((j+1)%4)*n+i)
                 for j in range(4) for i in range(n)]
        return self.mesh(name, verts, faces, material)

    def piping(self, name, host, w, d, corner, at, material, radius=.009, vertical=False):
        """A round cord laid into the edge of a cushion or upholstered back."""
        p = rounded_rect(w, d, corner)
        points, faces = [], []
        for i, (x, y) in enumerate(p):
            before, after = p[i-1], p[(i+1)%len(p)]
            a = Vector((after[1]-before[1], before[0]-after[0])).normalized()
            for j in range(5):
                t = j*tau/5
                u, v, h = x+radius*cos(t)*a.x, y+radius*cos(t)*a.y, at+radius*sin(t)
                local = (u, -h, v) if vertical else (u, v, h)
                points.append(tuple(host.matrix_world @ Vector(local)))
            for j in range(5):
                k = (j+1)%5
                nxt = (i+1)%len(p)*5
                faces.append((i*5+j, nxt+j, nxt+k, i*5+k))
        self.mesh(name, points, faces, material, smooth=True)


def _coffer(k, name, x, y, z, w, d, ceiling='wood'):
    # Open center keeps the existing slab and its fixtures visible. The small
    # setback reads as a shadow gap along the edge of the timber soffit.
    k.band(name+' · Floating soffit perimeter', (x, y, z), w, d, .11, .17, ceiling, .11)
    k.band(name+' · Bronze rebate at ceiling', (x, y, z-.051), w-.245, d-.245, .074, .014, 'gold', .012)
    for s in [-1, 1]:
        k.box(name+' · Warm recessed cove', x+s*(w/2-.179), y, z-.018,
              .021, d-.46, .019, 'strip', .004)
        for u in [-.28, .28]:
            pos = (x+s*(w/2-.113), y+u*d, z-.060)
            k.ring(name+' · Deep bronze downlight baffle', pos, .063, .014, .020, 'gold', 20)
            k.disk(name+' · Recessed opal optic', (pos[0], pos[1], pos[2]+.003), .044, .012, 'opal', 20)


def _central_architecture(k):
    ns = k.ns
    for f, (cx, cy, w, d, front) in enumerate(ns['dims']):
        z = ns['floor_z'][f]
        rear = cy+d/2-.34
        h = 3.11
        if f == 0:
            rooms = [('library', -5.85, 5.80), ('hall', .10, 4.48), ('hall', 6.31, 4.84)]
        elif f == 1:
            rooms = [('gallery', -5.72, 5.45), ('quiet-room', 5.54, 5.44)]
        else:
            rooms = [('observatory', -4.65, 3.72), ('observatory', .56, 4.11),
                     ('observatory', 5.94, 3.23)]
        for room, x, width in rooms:
            k.room(f, room)
            cy_in = (front+rear)/2+.24
            _coffer(k, room.title()+' ceiling', x, cy_in, z+3.49, width, rear-front-1.12,
                    'wood' if room in ('library', 'observatory') else 'trim')
            # Existing slats behind the library and gallery are retained. Layer
            # a cap and quiet shadow lines across those broad acoustic fields.
            k.box('Wall · Travertine dado rail', x, rear-.237, z+.166, width, .072, .102, 'stone', .012)
            k.box('Wall · Recessed skirting joint', x, rear-.275, z+.216, width-.08, .014, .018, 'shadow')
            k.box('Wall · Champagne head shadow line', x, rear-.245, z+3.28, width, .038, .044, 'gold', .009)
            for s in [-1, 1]:
                p = x+s*(width/2-.12)
                k.box('Wall · Walnut pilaster backing', p, rear-.245, z+1.71, .188, .119, h, 'wood', .014)
                for i in range(4):
                    k.box('Wall · Rounded solid walnut fluting', p+(i-1.5)*.039, rear-.319, z+1.71,
                          .023, .047, h-.06, 'woodlight', .009)
        if f == 0:
            k.room(f, 'hall')
            # Slab-lined backdrop for the reception desk, with bronze joints
            # and an indirect light shelf recessed into the existing rear wall.
            for i, width in enumerate([.88, 1.12, .88]):
                x = [-1.01, .12, 1.25][i]
                k.box('Reception wall · Honed travertine slab', x, rear-.095, z+1.79,
                      width, .17, 2.91, 'stone', .020)
            for x in [-.452, .692]:
                k.box('Reception wall · Bronze reglet', x, rear-.19, z+1.79,
                      .018, .027, 2.76, 'gold', .004)
            k.box('Reception wall · Concealed wall wash', .12, rear-.212, z+3.215,
                  3.05, .061, .027, 'opal', .005)
        if f == 2:
            k.room(f, 'observatory')
            for r in [1.47, 1.53]:
                k.ring('Astral coffer · Fine concentric bronze', (.53, 2.36, z+3.523), r, .022, .033, 'gold', 72)
            for i in range(12):
                a = tau*i/12
                k.disk('Astral coffer · Crystal point', (.53+1.50*cos(a), 2.36+1.50*sin(a), z+3.495),
                       .017 if i%3 else .028, .024, 'opal', 12)


def _wing_architecture(k):
    ns = k.ns
    for room, _, district, side, f, i, theme, _ in ns['catalog']:
        x, y, z = side*ns['wing_x'], ns['room_y'][i], ns['floor_z'][f]
        k.room(f, room)
        if room == 'roof-terrace':
            # Accent only the existing panoramic rails; leave the inner bay open.
            k.box('Terrace · Bronze inlay beneath the sill', x, -10.005, z+.081, 12.32, .026, .012, 'gold')
            k.box('Terrace · Outdoor teak border', x, y-4.54, z+.070, 12.13, .22, .011, 'wood')
            for xx in [x-5.99, x+5.99]:
                k.box('Terrace · Outdoor teak border', xx, y, z+.070, .22, 8.88, .011, 'wood')
            continue
        _coffer(k, room.title()+' ceiling', x, y, z+3.52, 11.84, 9.03,
                'wood' if district in ('library', 'quiet-room', 'observatory') else 'trim')
        # The built acoustic spine is exactly y=-.20. Fit panel mouldings on
        # each exposed face, with no dressings on the adjacent door glazing.
        s = -1 if i == 0 else 1
        wy = -.20+s*.142
        for dx in [-3.86, 0, 3.86]:
            panel = 'stone' if (side < 0 or room == 'banquet-room') else 'woodlight'
            k.box('Divider · Floating bookmatched field', x+dx, wy, z+1.88,
                  2.68 if dx else 3.07, .094, 2.75, panel, .022)
            for ox in [-1, 1]:
                k.box('Divider · Fine bronze reglet', x+dx+ox*(1.284 if dx else 1.475), wy+s*.052,
                      z+1.88, .019, .018, 2.62, 'gold', .004)
        for dx in [-5.57, -1.91, 1.91, 5.57]:
            k.box('Divider · Smoked timber fluting field', x+dx, wy, z+1.88, .56, .092, 2.82, 'wood', .014)
            for n in range(6):
                k.box('Divider · Rounded acoustic batten', x+dx+(n-2.5)*.083, wy+s*.063,
                      z+1.88, .036, .045, 2.78, 'woodlight', .011)
        k.box('Divider · Honed stone plinth', x, wy+s*.045, z+.17, 12.13, .075, .18, 'stone', .012)
        k.box('Divider · Lit top reglet', x, wy+s*.058, z+3.285, 11.85, .038, .026, 'opal', .007)
        for d in [-4.53, 4.53]:
            k.box('Terrazzo · Fine perimeter inlay', x, y+d, z+.072, 11.92, .025, .010, 'gold')
        # Three segments at the inner edge stop well short of its open bay.
        for d in [-2.84, 2.84]:
            k.box('Terrazzo · Inner perimeter inlay', x-side*5.96, y+d, z+.072, .025, 3.40, .010, 'gold')
        k.box('Terrazzo · Outer perimeter inlay', x+side*5.96, y, z+.072, .025, 9.08, .010, 'gold')


def _furnishings(k, originals):
    def base_name(obj):
        return sub(r'\.\d{3,}$', '', obj.name)

    for o in originals:
        if o.type != 'MESH' or o.get('room_id') is None:
            continue
        n = base_name(o)
        x, y, z = o.location
        w, d, h = o.dimensions
        room = o['room_id']
        k.room(o['floor'], room)
        if n == 'Sofa · Floating plinth':
            k.band('Sofa · Recessed bronze welt at base', (x, y, z-.081), w+.014, d+.013,
                   .071, .025, 'gold', .018)
        elif n in ('Sofa · Linen cushion', 'Sofa · Armrest', 'Sofa · Contrast pillow',
                   'Velvet armchair cushion', 'Armchair high back'):
            # Width/depth of a rotated chair in its own axes. Local bounds keep
            # the welt pinned to the armchair even for the two angled seats.
            ww, dd, hh = (max(c[j] for c in o.bound_box)-min(c[j] for c in o.bound_box) for j in range(3))
            piping = 'saddle_edge' if n in ('Sofa · Contrast pillow', 'Velvet armchair cushion', 'Armchair high back') else 'linen_edge'
            if n == 'Armchair high back':
                k.piping('Armchair · Saddle stitching at back', o, ww-.039, hh-.040, .047, dd*.49,
                         piping, .009, vertical=True)
            else:
                corner = {'Sofa · Linen cushion':.081, 'Sofa · Armrest':.072,
                          'Sofa · Contrast pillow':.069, 'Velvet armchair cushion':.048}[n]
                k.piping('Upholstery · Continuous tailored piping', o, ww-.044, dd-.045, corner,
                         hh*.477, piping, .009)
        elif n == 'Sofa · Continuous back':
            k.piping('Sofa · Tailored back perimeter seam', o, w-.073, h-.073, .101, d*.48,
                     'linen_edge', .0075, vertical=True)
        elif n == 'Round writing table':
            r = w/2
            k.ring('Table · Inlaid bronze edge', (x, y, z+.043), r+.002, .009, .017, 'gold')
            k.profile('Table · Turned walnut apron', (x, y, z), [(r-.13, -.115), (r-.046, -.115),
                      (r-.021, -.092), (r-.007, -.061), (r-.15, -.056)], 'wood')
            k.ring('Table · Pencil edge inlay in oak', (x, y, z+.061), r-.044, .007, .006, 'gold')
        elif n == 'Table pedestal':
            for dz in [-.248, .258]:
                k.ring('Table · Cast bronze pedestal ferrule', (x, y, z+dz), .122, .021, .041, 'gold', 36)
        elif n == 'Table carved base':
            k.ring('Table · Bronze base line', (x, y, z-.02), w*.5+.003, .018, .017, 'gold')
        elif n == 'Library walnut back':
            k.box('Library · Smoked walnut crown', x, y-.232, z+1.205, w+.141, .66, .145, 'wood', .019)
            k.box('Library · Crown bronze fillet', x, y-.568, z+1.184, w+.081, .017, .022, 'gold', .004)
            k.box('Library · Recessed light beneath crown', x, y-.504, z+1.128, w-.20, .031, .021, 'opal', .005)
        elif n == 'Library carved side':
            for dx in [-.033, 0, .033]:
                k.box('Library · Rounded timber stile bead', x+dx, y-d/2-.006, z+.045, .018, .034,
                      h-.25, 'wood', .006)
        elif n == 'Library shelf':
            k.box('Library · Shelf inlaid bronze lip', x, y-d/2-.002, z+.018, w-.105, .018, .018, 'gold', .003)
            if z-k.ns['floor_z'][o['floor']] > .30:
                k.box('Library · Integrated warm shelf light', x, y-d/2+.029, z-.050,
                      w-.155, .025, .013, 'opal', .003)
        elif n == 'Reception · Floating walnut desk':
            for i in range(37):
                k.box('Reception · Radius reeded walnut front', x+(i-18)*.077, y-d/2-.006, z-.041,
                      .040, .046, .972, 'woodlight', .012)
            k.box('Reception · Bronze toe rail', x, y-d/2-.025, z-.533, w-.10, .022, .032, 'gold', .007)
        elif n == 'Reception · Basalt counter':
            k.band('Reception · Champagne pencil edge below counter', (x, y, z-h/2-.005),
                   w-.027, d-.027, .052, .019, 'gold', .023)
        elif n == 'Pendant · Bronze linear suspension':
            for xx in [x-.987, x+.987]:
                k.box('Pendant · Machined solid bronze end', xx, y, z-.039, .058, .167, .105, 'gold', .009)
            for j in range(19):
                # Vertical opal crystal flutes form one compact light bar under
                # the existing suspension rather than a second chandelier.
                k.disk('Pendant · Hand-cast opal flute', (x+(j-9)*.102, y, z-.083),
                       .044, .102 if j%2 else .125, 'opal', 14)
            for xx in [x-.73, x+.73]:
                k.ring('Pendant · Bronze cable ferrule', (xx, y, z+.056), .028, .010, .055, 'gold', 20)
        elif n in ('Lounge · Woven rug', 'Library · Blue wool carpet', 'Quiet room · Woven tatami') or n.endswith(' · Central woven carpet'):
            radius = .13 if n.endswith(' · Central woven carpet') else .115
            mm = 'linen_edge' if room in ('hall', 'library', 'workshop', 'planetarium', 'reflection-suite') else 'wood'
            k.band('Textile · Hand bound perimeter', (x, y, z+h/2+.003), w-.066, d-.066,
                   radius, .024, mm, .007)
            k.band('Textile · Fine woven inner line', (x, y, z+h/2+.002), w-.239, d-.239,
                   .079, .009, mm, .005)
            if room == 'quiet-room':
                for dx in [-.77, .77]:
                    k.box('Tatami · Binding between rush panels', x+dx, y, z+h/2+.002,
                          .023, d-.106, .006, 'wood')
        elif n in ('Arrival · Circular woven rug', 'Observatory · Astral map'):
            r = w/2
            k.ring('Textile · Round hand bound edge', (x, y, z+h/2+.002), r-.022, .024, .006, 'linen_edge', 72)
        elif n == 'Quiet room · Meditation cushion':
            for dz, r in [(.061, .532), (-.061, .532)]:
                k.ring('Meditation · Piped wool cushion edge', (x, y, z+dz), r, .013, .016, 'linen_edge')
            k.disk('Meditation · Hand-tufted center', (x, y, z+h/2+.003), .047, .008, 'blue', 20)
        elif n == 'Quiet room · Low oak tea platform':
            k.band('Tea platform · Honed edge reveal', (x, y, z-.082), w+.003, d+.003,
                   .065, .020, 'gold', .013)
        elif n == 'Quiet room · Singing bowl':
            k.ring('Singing bowl · Turned bronze rolled lip', (x, y, z+h/2-.005), .317, .023, .023, 'gold')
        elif n == 'Gallery · Linen abstract panel':
            # A shadow line between artwork and metal frame catches raking light.
            for s in [-1, 1]:
                k.box('Gallery frame · Deep reveal', x+s*(w/2+.010), y-.014, z,
                      .017, .034, h-.032, 'shadow', .002)
                k.box('Gallery frame · Deep reveal', x, y-.014, z+s*(h/2+.010),
                      w+.025, .034, .017, 'shadow', .002)
            k.box('Gallery · Directional artwork light bar', x, y-.053, z+h/2+.105,
                  w*.52, .073, .056, 'gold', .011)
            k.box('Gallery · Recessed picture light optic', x, y-.066, z+h/2+.076,
                  w*.47, .042, .009, 'opal', .004)
        elif n == 'Gallery · Limestone display bench':
            k.band('Gallery bench · Bronze reveal below limestone', (x, y, z-h/2+.023),
                   w-.008, d-.008, .055, .014, 'gold', .012)
        elif n == 'Observatory · Bronze instrument column':
            for dz, r, ht in [(-.375,.273,.061), (-.313,.255,.024), (.338,.262,.042), (.418,.278,.064)]:
                k.ring('Armillary · Machined bearing collar', (x, y, z+dz), r, .044, ht, 'gold', 36)
        elif n == 'Observatory · Blue planetary globe':
            for angle in [0, pi/3, 2*pi/3]:
                k.ring('Armillary · Globe engraved meridian', (x,y,z), .484, .012, .009,
                       'gold', 56, (cos(angle), sin(angle), 0))
            k.ring('Armillary · Globe equator', (x,y,z), .484, .013, .011, 'gold', 56)
        elif n == 'Observatory · Carbon optical tube':
            axis = o.rotation_euler.to_quaternion() @ Vector((0, 0, 1))
            for t, rr, ht in [(-.44,.205,.034), (-.25,.200,.023), (.25,.196,.019), (.41,.205,.039)]:
                p = o.location+axis*(t*h)
                k.ring('Telescope · Turned optical housing', p, rr, .020, ht, 'gold', 40, axis)
        elif n == 'Observatory · Future desk':
            k.band('Observatory desk · Shadow joint', (x,y,z-h/2+.012), w+.003, d+.003,
                   .037, .012, 'shadow', .017)
            k.box('Observatory desk · Saddle leather writing panel', x+.07, y-.166, z+h/2+.011,
                  1.14, .36, .023, 'rug', .011)
        elif n.endswith(' · Porcelain luminous shade'):
            section = [(.260,-.154), (.273,-.153), (.274,-.129), (.171,.153),
                       (.160,.154), (.160,.135), (.257,-.123)]
            k.profile('Lamp · Woven translucent linen shade', (x,y,z), section, 'shade', 48)
            for dz,r in [(-.145,.277),(.146,.174)]:
                k.ring('Lamp · Bronze shade welt', (x,y,z+dz), r, .016, .017, 'gold', 48)
            for i in range(24):
                a = tau*i/24
                A = (x+.274*cos(a), y+.274*sin(a), z-.13)
                B = (x+.173*cos(a), y+.173*sin(a), z+.141)
                # Slim stitched stays are kept as part of the shade assembly.
                o = k.ns['beam']('Lamp · Linen shade seam', A, B, .0027, 'linen_edge', 5)
                o['part'] = 'finish'
                k.count += 1
        elif n.endswith(' · Drawer face'):
            k.box('Cabinet · Recessed bottom drawer seam', x, y-d/2-.001, z-h/2+.021,
                  w-.058, .012, .013, 'shadow', .002)
            k.box('Cabinet · Inset bronze label frame', x, y-d/2-.009, z+.018,
                  .137, .020, .072, 'gold', .006)
            k.box('Cabinet · Ivory label card', x, y-d/2-.021, z+.018,
                  .101, .006, .045, 'paper', .002)
        elif n.endswith(' · Case'):
            k.box('Cabinet · Recessed dark toe kick', x, y-d/2-.003, z-h/2+.029,
                  w-.044, .035, .068, 'shadow', .007)
        elif n.endswith(' · Sculpture plinth') or n == 'Gallery · Sculptural pedestal':
            k.band('Art plinth · Floating bronze edge at cap', (x,y,z+h/2-.016),
                   w+.006, d+.006, .055, .022, 'gold', .023)
            k.band('Art plinth · Blackened bronze toe reveal', (x,y,z-h/2+.038),
                   w-.020, d-.020, .051, .018, 'gold', .016)
        elif n.endswith(' · Worktop'):
            k.band('Worktop · Inlaid bronzework at edge', (x,y,z-h*.30),
                   w+.005, d+.005, .056, .018, 'gold', .011)
        elif n.endswith(' · Open folio page') or n == 'Library · Open book':
            for j in range(3):
                q = k.box('Folio · Layered edges of laid paper', x, y-d/2-.001, z-h/2+.009+.010*j,
                          w-.029, .009, .0026, 'linen_edge')
                q.rotation_euler.y = o.rotation_euler.y
        elif n.endswith(' · Fine porcelain plate'):
            k.ring('Banquet · Porcelain and gilt tableware', (x,y,z+.011), w/2+.001, .014, .010, 'gold', 28)
        elif n.endswith(' · Instrument globe'):
            k.ring('Globe · Inlaid equatorial line', (x,y,z), w/2+.003, .008, .011, 'gold', 48)
        elif n.endswith(' · Bowl rim'):
            k.ring('Vessel · Rolled and polished lip', (x,y,z+h/2-.005), w/2+.006, .019, .022, 'gold', 42)
        elif n.endswith(' · Weighted foot'):
            k.ring('Lamp · Bronze ferrule at base', (x,y,z+h/2+.001), .084, .047, .020, 'gold', 28)
        elif n.endswith(' · Ribbed ceramic pot') or (n.endswith(' · Pot') and h > .50):
            # The slip-cast body remains intact; each vertical rib tapers with
            # the existing pot, and a thrown lip closes the shoulder.
            r, r0 = w/2, (.38 if n.startswith('Interior') else .37)
            k.ring('Planter · Glazed rolled ceramic lip', (x,y,z+h/2-.026), r+.018, .025, .029, 'trim', 40)
            for j in range(20):
                a = tau*j/20
                v = (cos(a), sin(a))
                A = (x+(r0+.003)*v[0], y+(r0+.003)*v[1], z-h/2+.045)
                B = (x+r*v[0], y+r*v[1], z+h/2-.047)
                b = k.ns['beam']('Planter · Slip cast ceramic fluting', A, B, .012, 'trim', 6)
                b['part'] = 'finish'
                k.count += 1
        elif n.endswith(' · Woven cushion'):
            k.piping('Cushion · Hand closed welt seam', o, w-.048, d-.048, .118, h*.24,
                     'linen_edge', .010)
        elif n.endswith(' · Seat') and d < .75 and h > .15:
            k.band('Bench · Tapered rail joint', (x,y,z-h/2+.025), w+.003, d+.003,
                   .075, .020, 'wood', .018)


def _landscape(k):
    k.room(-1, 'garden')
    for x in [-2.84, 2.84]:
        k.box('Pool coping · Fine flush bronze reglet', x, -11.50, .396, .024, 5.99, .011, 'gold')
    for y in [-14.63, -8.37]:
        k.box('Pool coping · Fine flush bronze reglet', 0, y, .396, 5.706, .024, .011, 'gold')
    k.box('Fountain · Bronze slot return', 0, -9.906, .847, 2.78, .029, .061, 'gold', .007)
    for j in range(13):
        k.box('Fountain · Fluted basalt face', (j-6)*.229, -9.832, .450, .087, .057, .469, 'shadow', .019)
    for x in [-8.2, 8.2]:
        for yy in [-.154,.154]:
            k.box('Garden bench · Sealed oak board joint', x, -7.05+yy, .716,
                  2.49, .017, .008, 'wood', .002)
    k.room(-1, 'arrival-court')
    for a in range(12):
        t = tau*a/12
        r = 3.64
        o = k.box('Arrival court · Compass index set into stone', r*cos(t), -26.4+r*sin(t), .279,
                  .27 if a%3 == 0 else .13, .038, .009, 'gold', .003)
        o.rotation_euler.z = t
    k.room(-1, 'water-garden')
    for yy in [-4.65, 4.65]:
        k.box('Water garden · Bronze edge expansion joint', 12.75, -26.4+yy, .289,
              11.35, .028, .013, 'gold', .003)
    for xx in [-5.64, 5.64]:
        k.box('Water garden · Bronze edge expansion joint', 12.75+xx, -26.4, .289,
              .028, 9.27, .013, 'gold', .003)
    k.room(-1, 'stone-garden')
    for xx in [-5.59, 5.59]:
        k.box('Stone garden · Mortised timber edge', 25.55+xx, -26.4, .294,
              .098, 9.25, .018, 'wood', .005)
    k.room(-1, 'orchard')
    for xx in [-1.12, 1.12]:
        k.box('Orchard · Weathered bronze paving margin', -25.55+xx, -26.40, .286,
              .032, 8.83, .012, 'gold', .003)
    k.room(-1, 'sculpture-court')
    for xx in [-4.8, 4.8]:
        for yy in [-3.55, 3.55]:
            k.box('Sculpture court · Recessed uplight in stone planter', -12.75+xx, -26.4+yy,
                  .565, .39, .096, .026, 'metal', .011)
            k.box('Sculpture court · Frosted planter optic', -12.75+xx, -26.4+yy,
                  .580, .29, .047, .012, 'opal', .005)
    k.room(2, 'skybridge')
    y, z = k.ns['bridge_y'][1], k.ns['floor_walk'][2]
    for i in range(7):
        x = (i-3)*3.92
        k.box('Sky bridge flooring · Inlaid light under glass rail', x, y-1.02, z+.016,
              2.97, .026, .019, 'opal', .004)


def add_luxury_details(ns):
    """Add fitted details after the 24 base rooms and 192 locus anchors exist."""
    k = Joinery(ns)
    saved_floor, saved_room = ns['CURRENT_FLOOR'], ns['CURRENT_ROOM']
    bpy = ns['bpy']
    bpy.context.view_layer.update()
    originals = list(bpy.context.scene.objects)
    ns['M'].update({
        'linen_edge': ns['mat']('Linen · Warm flax binding and piping', (.61,.46,.30), .75),
        'saddle_edge': ns['mat']('Leather · Burnished saddle piping', (.181,.074,.035), .54),
        'opal': ns['mat']('Light · Warm opal glass and cast crystal', (1,.80,.59), .32, 0, 1.35),
        'shade': ns['mat']('Light · Woven flax diffuser', (.89,.72,.52), .78, 0, .52),
    })
    try:
        _central_architecture(k)
        _wing_architecture(k)
        _furnishings(k, originals)
        _landscape(k)
    finally:
        k.room(saved_floor, saved_room)
    print(f'LUXURY_JOINERY_COMPLETE {k.count} editable finish objects')
    return k.count
