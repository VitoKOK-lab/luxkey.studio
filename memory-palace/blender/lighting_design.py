"""Build the installed luminaires and publish their browser light schedule.

Blender keeps area emitters for the real shape of a cove, shade or pendant.
The schedule represents each installed circuit with a point or a spot.
"""
import json
from collections import defaultdict

from mathutils import Matrix, Vector

from luxury_details import Joinery


NEUTRAL = '#fff0db'
OPAL = '#ffe4c4'
AMBER = '#ffdab2'
DAY = '#f7f2e9'

CENTRAL = {
    'hall': (-2.9, 9.9),
    'library': (-9.9, -2.9),
    'gallery': (-9.6, .35),
    'quiet-room': (.35, 9.6),
    'observatory': (-7.2, 8.3),
}


def linear_color(hex_color):
    channels = [int(hex_color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4
                 for c in channels)


class Lighting:
    def __init__(self, ns):
        self.ns = ns
        self.joinery = Joinery(ns)
        self.fixtures = defaultdict(list)
        self.objects = defaultdict(list)
        for obj in list(ns['bpy'].context.scene.objects):
            if obj.type == 'MESH':
                self.objects[obj.get('room_id')].append(obj)

    def room(self, floor, room):
        self.joinery.room(floor, room)
        self.zone = room

    def matching(self, text):
        return sorted((obj for obj in self.objects[self.zone] if text in obj.name),
                      key=lambda obj: (*obj.location, obj.name))

    def emit(self, name, role, position, color, power, intensity, distance,
             target=None, angle=.75, penumbra=.55, size=.22, length=0, width=.14):
        """Use a shaped area source in Cycles where the fixture has an optic."""
        bpy = self.ns['bpy']
        pos = Vector(position)
        kind = 'spot' if target is not None else 'point'
        fixture_id = f'{self.zone}-{len(self.fixtures[self.zone])+1:02d}'
        label = f'Luminaire · {name} · {fixture_id}'
        data = bpy.data.lights.new(label, 'AREA' if length else kind.upper())
        obj = bpy.data.objects.new(label, data)
        bpy.context.collection.objects.link(obj)
        obj.location = pos
        obj['part'] = 'lighting'
        obj['floor'] = self.ns['CURRENT_FLOOR']
        obj['room_id'] = self.zone
        obj['fixture_id'] = fixture_id
        obj['role'] = role
        data.color = linear_color(color)
        data.energy = power
        if length:
            data.shape = 'RECTANGLE'
            data.size = length
            data.size_y = width
        else:
            data.shadow_soft_size = size
            if kind == 'spot':
                data.spot_size = angle * 2
                data.spot_blend = penumbra
        if target is not None:
            obj.rotation_euler = (Vector(target) - pos).to_track_quat('-Z', 'Y').to_euler()
        fixture = {'id': fixture_id, 'type': kind, 'role': role,
                   'position': self.ns['tup'](pos), 'color': color,
                   'intensity': intensity, 'distance': distance}
        if target is not None:
            fixture.update(target=self.ns['tup'](target), angle=angle, penumbra=penumbra)
        self.fixtures[self.zone].append(fixture)
        return obj

    def area_aim(self, obj, target, horizontal_axis):
        direction = (Vector(target) - obj.location).normalized()
        tangent = Vector(horizontal_axis)
        tangent = (tangent - tangent.dot(direction) * direction).normalized()
        bitangent = (-direction).cross(tangent)
        obj.rotation_euler = Matrix((tangent, bitangent, -direction)).transposed().to_euler()

    def downlight(self, name, x, y, z, target, color=NEUTRAL, power=58, intensity=150):
        self.emit(name, 'ambient', (x,y,z), color, power, intensity, 9,
                  target, angle=.92, penumbra=.72, size=.093)

    def coffer(self, height, color, level=1):
        for optic in self.matching(' · Recessed opal optic'):
            x, y, z = optic.location
            self.downlight('Wide-beam coffer downlight', x, y, z-.058,
                           (x, y, height+.45), color, 68*level, round(175*level))
        for cove in self.matching(' · Warm recessed cove'):
            x, y, z = cove.location
            obj = self.emit('Concealed cove bounce', 'ambient', (x,y,z-.114),
                            OPAL, 66*level, round(92*level), 8.6,
                            length=max(.5, cove.dimensions.y-.32), width=.060)
            self.area_aim(obj, (x,y,height+.65), (0,1,0))

    def linear(self, name, role, source, target, length, color, power, intensity,
               distance, width=.11, angle=.87):
        obj = self.emit(name, role, source, color, power, intensity, distance,
                        target, angle=angle, penumbra=.77, length=length, width=width)
        self.area_aim(obj, target, (1,0,0))

    def surface_bar(self, name, x, y, z, length, target, role='task', color=NEUTRAL,
                    power=90, intensity=210):
        k = self.joinery
        k.box(name+' · Micro-bevel bronze channel', x,y,z, length,.172,.055,'gold',.016)
        k.box(name+' · Inset graphite baffle', x,y,z-.026, length-.05,.141,.016,'metal',.010)
        k.box(name+' · Continuous opal lens', x,y,z-.039, length-.096,.097,.013,'opal',.006)
        self.linear(name, role, (x,y,z-.082), target, length-.12, color, power,
                    intensity, 9, angle=.80)

    def sconce(self, x, y, height, direction):
        k = self.joinery
        k.box('Sconce · Champagne bronze wall plate',x,y,height,.146,.073,.44,'gold',.018)
        k.box('Sconce · Recessed bronze yoke',x,y+direction*.062,height,.094,.085,.132,'gold',.009)
        lens_y = y+direction*.115
        k.disk('Sconce · Fluted opal cylinder',(x,lens_y,height),.061,.37,'opal',32)
        for dz in [-.194,.194]:
            k.disk('Sconce · Machined bronze end cap',(x,lens_y,height+dz),.066,.025,'gold',32)
        for dx in [-.045,-.027,0,.027,.045]:
            k.box('Sconce · Cast glass rib',x+dx,lens_y+direction*(.06-3*dx*dx),
                  height,.006,.010,.353,'opal',.003)
        self.emit('Fluted opal wall sconce','accent',(x,lens_y+direction*.076,height),
                  OPAL,22,32,4.8,size=.10)

    def table_lamp(self, name, x, y, z, span):
        k = self.joinery
        k.disk(name+' · Weighted bronze foot', (x,y,z+.020), .094,.036,'gold')
        k.disk(name+' · Slim bronze upright', (x,y,z+.225), .014,.40,'gold',16)
        k.box(name+' · Articulated bronze arm',x+span/2,y,z+.425,
              abs(span)+.075,.028,.032,'gold',.009)
        head = x+span
        k.disk(name+' · Shallow bronze shade',(head,y,z+.413),.127,.052,'gold',48)
        k.disk(name+' · Recessed opal lens',(head,y,z+.381),.106,.015,'opal',36)
        self.linear(name,'task',(head,y,z+.352),(head+.065,y-.05,z),
                    .15,NEUTRAL,12,16,2.8,width=.13,angle=.89)

    def shades(self, interior):
        for obj in self.matching(' · Porcelain luminous shade'):
            x, y, z = obj.location
            self.emit('Linen shade','task' if interior else 'path',
                      (x,y-.17,z-.17),AMBER,28 if interior else 10,
                      49 if interior else 15,4.9 if interior else 3.7,size=.17)

    def step_light(self, x, y, z, goal, width, exterior=False):
        k = self.joinery
        bezel = k.box('Guide · Bronze slot bezel',x,y,z,width,.055,.043,'gold',.009)
        lens = k.box('Guide · Shielded opal slot',x,y-.030,z,width-.056,.010,.019,'opal',.004)
        if exterior:
            bezel['part'] = lens['part'] = 'lighting-guide'
        self.linear('Shielded tread marker','path',(x,y-.055,z-.017),goal,
                    width-.056,OPAL,3.5,7,2.9,width=.035,angle=.91)

    def ground_light(self, name, x, y, z, target, role='path', power=12, intensity=23):
        k = self.joinery
        k.disk('Landscape · '+name+' bronze collar',(x,y,z),.093,.034,'gold')
        k.disk('Landscape · '+name+' recessed optic',(x,y,z+.022),.062,.017,'opal',24)
        self.emit(name,role,(x,y,z+.060),OPAL,power,intensity,4.8,
                  target,angle=.79,size=.080)

    def zone_data(self, rid, floor, interior, bounds):
        x0, x1, y0, y1, z0, z1 = bounds
        return {'id': rid, 'floor': floor, 'interior': interior,
                'bounds': {'min': self.ns['tup']((x0,y1,z0)), 'max': self.ns['tup']((x1,y0,z1))},
                'fixtures': self.fixtures[rid]}


def central_design(k, rid, floor, height):
    color = DAY if rid in {'gallery', 'observatory'} else NEUTRAL
    k.coffer(height, color, .85 if rid in {'quiet-room','observatory'} else 1)
    for pendant in k.matching(' · Warm diffuser'):
        x, y, z = pendant.location
        k.linear('Cast crystal pendant','ambient',(x,y,z-.135),(x,y,height+.45),
                 1.88,OPAL,78 if rid == 'quiet-room' else 112,155,7.2,angle=.97)
    if rid == 'hall':
        for obj in k.matching('Reception wall · Concealed wall wash'):
            x, y, z = obj.location
            k.linear('Travertine wall grazer','accent',(x,y-.16,z-.04),(x,y+.15,height+1.18),
                     2.9,NEUTRAL,74,105,5.2,width=.068)
        k.table_lamp('Reception desk lamp',-.93,3.49,2.055,.26)
    elif rid == 'library':
        for obj in k.matching('Library · Integrated warm shelf light'):
            x, y, z = obj.location
            # Keep the three lower runs in Cycles. Group each stack as one
            # authored web fixture at its separately modelled crown optic.
            data = k.ns['bpy'].data.lights.new('Library · Shelf tape', 'AREA')
            data.shape = 'RECTANGLE'
            data.size = 1.79
            data.size_y = .036
            data.energy = 8
            data.color = linear_color(OPAL)
            emitter = k.ns['bpy'].data.objects.new('Library · Shelf tape', data)
            k.ns['bpy'].context.collection.objects.link(emitter)
            emitter.location = (x,y-.012,z-.019)
            emitter['floor'] = floor
            emitter['room_id'] = rid
            emitter['part'] = 'lighting'
            emitter['role'] = 'accent'
        for obj in k.matching('Library · Recessed light beneath crown'):
            x, y, z = obj.location
            k.linear('Library shelf wash','accent',(x,y-.115,z-.070),(x,y+.16,height+1.1),
                     1.74,OPAL,27,54,4.7,width=.06)
        k.table_lamp('Reading table lamp',-6.24,1.63,1.58,.25)
    elif rid == 'gallery':
        for optic in k.matching('Gallery · Recessed picture light optic'):
            x, y, z = optic.location
            k.linear('Shielded picture light','accent',(x,y-.044,z-.024),(x,y+.012,z-.89),
                     .59,DAY,13,28,3.1,width=.052,angle=.61)
    elif rid == 'quiet-room':
        for x in (3.48,7.76):
            k.sconce(x,6.17,height+1.93,-1)
    elif rid == 'observatory':
        k.downlight('Armillary focal optic',.53,2.36,height+3.47,(.53,2.36,height+1.72),
                    DAY,39,112)
        k.table_lamp('Star chart lamp',-5.27,2.40,9.58,.28)
    k.shades(True)


def wing_design(k, rid, x, y, height, room_index, loci):
    level = .80 if rid in {'tea-room','reflection-suite','planetarium'} else 1
    color = DAY if rid in {'cartography-room','workshop','portrait-hall','glasshouse'} else NEUTRAL
    k.coffer(height,color,level)
    accents = {
        'archive': 'folio', 'workshop': 'vise', 'cartography-room': 'atlas',
        'portrait-hall': 'pair', 'music-room': 'piano', 'planetarium': 'projector',
        'atrium': 'tree', 'banquet-room': 'table', 'tea-room': 'tray',
        'reflection-suite': 'low-table', 'glasshouse': 'tray',
    }
    tx,tz,negative_y = loci[rid+'-'+accents[rid]]['position']
    ty = -negative_y
    k.surface_bar('Landmark task optic',tx,ty+.42,height+3.45,1.22 if rid == 'banquet-room' else .83,
                  (tx,ty,tz), color=color,power=84*level,intensity=round(175*level))
    k.surface_bar('Central opal ceiling optic',x,y+.18,height+3.45,1.44,(x,y,height+.5),
                  role='ambient',color=color,power=109*level,intensity=round(170*level))
    sign = 1 if room_index else -1
    for dx in (-2.34,2.34):
        k.sconce(x+dx,-.20+sign*.242,height+1.96,sign)
    # One lamp per divider field keeps the material relief visible between sconces.
    for obj in k.matching('Divider · Lit top reglet'):
        sx, sy, z = obj.location
        k.linear('Acoustic divider grazer','accent',(sx,sy+sign*.13,z-.047),
                 (sx,sy-sign*.16,height+1.45),9.8,NEUTRAL,108*level,115,6.1,width=.075)
    k.shades(True)


def garden_design(k, rid, x, y):
    if rid == 'garden':
        for bx in [-5.7,5.7]:
            for by in [-9.2,-14.9]:
                k.emit('Reflecting garden bollard','path',(bx,by,.755),AMBER,10,18,4.4,size=.106)
        for bx in [-1.55,1.55]:
            k.ground_light('Fountain footlight',bx,-9.59,.212,(0,-9.85,.93),'accent')
    elif rid == 'sculpture-court':
        for obj in k.matching('Sculpture court · Frosted planter optic'):
            sx,sy,z = obj.location
            k.linear('Recessed planter uplight','accent',(sx,sy,z+.037),
                     (sx+(x-sx)*.14,sy,.98),.23,OPAL,10,23,4,width=.045)
    else:
        for dx in [-1.10,1.10]:
            k.ground_light('Entry threshold marker',x+dx,y+3.95,.278,(x+dx*.53,y+2.85,.28))
        if rid in {'orchard','stone-garden'}:
            for dx in [-4.86,4.86]:
                k.ground_light('Landscape accent',x+dx,y+.55,.29,
                               (x+dx*.79,y+.25,1.1),'accent')
    k.shades(False)


def circulation(k):
    ns = k.ns
    zones = []
    z = ns['floor_walk'][2]
    y = ns['bridge_y'][1]
    k.room(2,'skybridge')
    for obj in k.matching('Sky bridge flooring · Inlaid light under glass rail'):
        x, sy, sz = obj.location
        k.linear('Skybridge recessed rail wash','path',(x,sy+.025,sz+.042),
                 (x,y+.12,z+.04),2.78,OPAL,6,14,3.7,width=.045)
    k.shades(False)
    for f, x in enumerate([3.12,-2.18]):
        rid = f'central-stair-{f+1}'
        k.room(f,rid)
        z = ns['floor_z'][f]
        for j in range(1,16,3):
            step_y, step_z = .67+j*.291, z+.18+j*.241
            k.step_light(x,step_y-.175,step_z-.010,(x,step_y-.42,step_z-.19),.69)
        zones.append(k.zone_data(rid,f,True,(x-.98,x+.98,.47,5.30,z,z+4.39)))
    for side, flank in [(-1,'west'),(1,'east')]:
        x = side*ns['stairs_x']
        for f in (1,2):
            rid = f'{flank}-stair-{f}'
            k.room(f,rid)
            sy, ey = ns['flight_y'][f-1:f+1]
            sz = ns['court_z'] if f == 1 else ns['floor_walk'][f-1]
            ez = ns['floor_walk'][f]
            step = (ey-sy)/25
            for i in (3,8,13,18,23):
                y = sy+i*step-step/2
                z = sz+(ez-sz)*i/25
                k.step_light(x,y,z-.071,(x,y-.48,z-.23),.95,exterior=True)
            zones.append(k.zone_data(rid,f,False,(x-1.25,x+1.25,sy,ey,sz,ez+1.55)))
    z,y = ns['floor_walk'][1],ns['bridge_y'][0]
    k.room(1,'first-skybridge')
    for x in (-12,-8,-4,0,4,8,12):
        k.ground_light('Bridge guide',x,y-.99,z+.016,(x,y+.32,z+.14),power=5,intensity=12)
    zones.append(k.zone_data('first-skybridge',1,False,(-16.2,16.2,y-1.15,y+1.15,z,z+2.75)))
    for x0,x1,rid in [(-32,-11,'west-promenade'),(-11,11,'central-promenade'),(11,32,'east-promenade')]:
        k.room(-1,rid)
        for obj in k.objects[None]:
            if not obj.name.startswith('Promenade · Amber diffuser'):
                continue
            x,y,z = obj.location
            if x0 <= x < x1 and round(y, 2) in (-16.19,-21.05):
                k.emit('Promenade bollard','path',(x,y,z+.077),AMBER,8,16,4.8,size=.13)
        zones.append(k.zone_data(rid,-1,False,(x0,x1,-21.5,-16.0,.18,2.9)))
    return zones


def add_lighting_design(ns, manifest, out):
    saved = (ns['CURRENT_FLOOR'],ns['CURRENT_ROOM'])
    ns['bpy'].context.view_layer.update()
    k = Lighting(ns)
    wing_room_indices = {rid: i for rid,_,_,_,_,i,_,_ in ns['catalog']}
    rooms = []
    for room in manifest['rooms']:
        rid, floor, height = room['id'],room['floor'],room['walk_height']
        x, _, negative_y = room['position']
        y = -negative_y
        k.room(floor,rid)
        interior = floor >= 0 and rid not in {'skybridge','roof-terrace'}
        if rid in CENTRAL:
            central_design(k,rid,floor,height)
            a,b = CENTRAL[rid]
            cx,cy,w,d,front = ns['dims'][floor]
            bounds = (a,b,front,cy+d/2-.28,height,height+3.53)
        elif rid == 'skybridge':
            bounds = (-16.2,16.2,y-1.15,y+1.15,height,height+2.75)
        elif rid == 'roof-terrace':
            k.shades(False)
            for dx in (-4.62,0,4.62):
                k.ground_light('Terrace edge marker',x+dx,-9.88,height+.022,
                               (x+dx,-8.57,height+.16),power=5,intensity=11)
            bounds = (x-6.35,x+6.35,y-4.94,y+4.94,height,height+2.75)
        elif interior:
            loci = {locus['id']: locus for locus in room['loci']}
            wing_design(k,rid,x,y,height,wing_room_indices[rid],loci)
            bounds = (x-6.35,x+6.35,y-4.94,y+4.94,height,height+3.57)
        else:
            garden_design(k,rid,x,y)
            bounds = (-10.1,10.1,-16.2,-4.75,height,height+3.5) if rid == 'garden' else (
                      x-5.9,x+5.9,y-4.9,y+4.9,height,height+3.5)
        rooms.append((rid,floor,interior,bounds))
    zones = circulation(k)
    result = {'version': 1, 'rooms': [k.zone_data(*room) for room in rooms], 'circulation': zones}
    empty = [zone['id'] for zone in result['rooms'] + zones if not zone['fixtures']]
    assert not empty, f'Lighting zones with no installed fixtures: {empty}'
    (out/'lighting-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    k.joinery.room(*saved)
    print('LIGHTING_DESIGN_COMPLETE',sum(map(len,k.fixtures.values())), 'authored luminaires')
