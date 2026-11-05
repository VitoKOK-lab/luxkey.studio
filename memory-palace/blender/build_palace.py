"""Generate the editable Memory Palace estate. Run with Blender --background --python."""
import bpy, bmesh, math, os, random, json, sys
from pathlib import Path
from mathutils import Vector

random.seed(18)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets'
OUT.mkdir(exist_ok=True)
sys.path.insert(0, str(Path(__file__).resolve().parent))
random_state=random.getstate()
from build_accessories import leaf_blade, pipe
random.setstate(random_state)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for dat in list(bpy.data.materials): bpy.data.materials.remove(dat)

def mat(name, color, rough=.65, metal=0, glow=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    if glow: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=glow
    return m
CURRENT_FLOOR=-1
CURRENT_ROOM=None
def tag(obj,name,material=None,floor=None,part='architecture'):
    obj.name=name
    if name.startswith(('Courtyard stair ·', 'Front skybridge ·', 'Inner side gallery ·',
                        'Stair flight landing ·', 'Inner room entry bridge ·', 'Skybridge ·',
                        'Side gallery ·')):
        part='circulation'
    if material: obj.data.materials.append(M[material] if isinstance(material,str) else material)
    obj['floor']=CURRENT_FLOOR if floor is None else floor; obj['part']=part
    if CURRENT_ROOM: obj['room_id']=CURRENT_ROOM
    return obj
def cube(name,loc,scale,material,bevel=0, floor=None,part='architecture'):
    w,d,h=[a*.5 for a in scale]
    verts=[(-w,-d,-h),(w,-d,-h),(w,d,-h),(-w,d,-h),(-w,-d,h),(w,-d,h),(w,d,h),(-w,d,h)]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.location=loc
    tag(o,name,material,floor,part)
    if bevel:
        mod=o.modifiers.new('Soft crafted edges','BEVEL');mod.width=bevel;mod.segments=3 if max(scale)>.9 else 2
        o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o
def cyl(name,loc,r,depth,material,verts=16,r2=None,floor=None,part='architecture'):
    if r > .15: verts=max(32,verts)
    bm=bmesh.new();bmesh.ops.create_cone(bm,cap_ends=True,cap_tris=False,segments=verts,radius1=r,radius2=r if r2 is None else r2,depth=depth)
    me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.location=loc
    return tag(o,name,material,floor,part)
def ico(name,loc,r,material,scale=(1,1,1),sub=1,floor=None,part='landscape'):
    sub=max(2,sub)
    bm=bmesh.new();bmesh.ops.create_icosphere(bm,subdivisions=sub,radius=r)
    me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free()
    for polygon in me.polygons: polygon.use_smooth=True
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.location=loc;o.scale=scale
    return tag(o,name,material,floor,part)
def beam(name,a,b,r,material,verts=8):
    mid=(Vector(a)+Vector(b))/2;o=cyl(name,mid,r,(Vector(b)-Vector(a)).length,material,verts)
    o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler();return o
def torus(name,loc,major,minor,material,rot=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=6,location=loc,major_radius=major,minor_radius=minor)
    o=tag(bpy.context.object,name,material)
    if rot:o.rotation_euler=rot
    return o
def mesh(name,verts,faces,material):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return tag(o,name,material)
def bookcase(x,y,z,w=2.2):
    cube('Library walnut back',(x,y,z+1.2),(w,.2,2.4),'wood',.03,part='furniture')
    for xx in [x-w/2,x+w/2]:cube('Library carved side',(xx,y-.22,z+1.2),(.12,.60,2.55),'woodlight',.02,part='furniture')
    for k in range(5):
        zz=z+k*.55;cube('Library shelf',(x,y-.22,zz),(w,.65,.09),'woodlight',.02,part='furniture')
        if k<4:
            bx=x-w/2+.15
            while bx<x+w/2-.13:
                bw=random.uniform(.09,.17);bh=random.uniform(.29,.47)
                cube('Individual leather book',(bx+bw/2,y-.31,zz+bh/2+.045),(bw,.32,bh),random.choice(['rug','blue','woodlight','green']),.008,part='furniture')
                cube('Book gilt spine',(bx+bw/2,y-.48,zz+bh*.75),(bw*.7,.015,.025),'gold',part='furniture');bx+=bw+.025
def chair(x,y,z,rot=0):
    objs=[]
    def cc(n,l,s,m):o=cube(n,(x+l[0],y+l[1],z+l[2]),s,m,.035,part='furniture');objs.append(o);return o
    cc('Velvet armchair cushion',(0,0,.43),(.83,.73,.22),'rug');cc('Armchair high back',(0,.28,.88),(.82,.18,.98),'rug')
    for sx in [-1,1]:
        cc('Armchair arm',(sx*.43,0,.63),(.13,.8,.17),'woodlight')
        for sy in [-1,1]:cc('Armchair leg',(sx*.32,sy*.27,.19),(.09,.09,.38),'wood')
    if rot:
        for o in objs:
            p=Vector(o.location)-Vector((x,y,z));p.rotate(__import__('mathutils').Euler((0,0,rot)));o.location=Vector((x,y,z))+p;o.rotation_euler.z=rot
def table(x,y,z,r=.8):
    cyl('Round writing table',(x,y,z+.77),r,.12,'woodlight',24,part='furniture')
    cyl('Table pedestal',(x,y,z+.4),.11,.7,'wood',12,part='furniture')
    cyl('Table carved base',(x,y,z+.08),.44,.12,'wood',12,part='furniture')


M={
'stone':mat('01 · Vein-cut ivory travertine',(.68,.62,.51),.62),
'trim':mat('02 · Chalk mineral plaster',(.81,.77,.67),.6),
'shadow':mat('03 · Dove-gray basalt',(.245,.253,.237),.61),
'metal':mat('04 · Satin pewter',(.30,.294,.265),.43,.54),
'gold':mat('05 · Champagne bronze',(.55,.33,.145),.38,.68),
'roof':mat('06 · Pearl zinc',(.39,.413,.392),.46,.42),
'wood':mat('07 · Natural walnut',(.40,.255,.157),.61),
'woodlight':mat('08 · Pale European oak',(.63,.49,.33),.59),
'floor':mat('09 · Sandstone terrazzo',(.50,.39,.28),.56),
'glass':mat('10 · Solar control glazing',(.46,.68,.77),.14,.17),
'green':mat('11 · Yew foliage',(.15,.263,.149)),
'leaf':mat('12 · Olive foliage',(.251,.351,.196)),
'leafdark':mat('13 · Cypress foliage',(.092,.183,.118)),
'grass':mat('14 · Native grasses',(.177,.273,.156)),
'moss':mat('15 · Ground cover',(.104,.177,.117)),
'path':mat('16 · Ash limestone pavers',(.49,.479,.431)),
'water':mat('17 · Reflecting pool',(.092,.29,.294),.14,.39),
'flower':mat('18 · Linen',(.89,.80,.64)),
'rose':mat('19 · Lavender rose',(.53,.309,.375)),
'blue':mat('20 · Mist-blue wool',(.20,.35,.39)),
'rug':mat('21 · Sage leather',(.25,.35,.24)),
'orb':mat('22 · Amber locus',(1,.64,.26),.27,.19,2.6),
'strip':mat('23 · Warm concealed light',(1,.87,.71),.5,0,2.2),
'cyan':mat('24 · Robot cyan light',(.045,.72,.96),.35,.1,2.9),
'butler':mat('25 · Robot carbon ceramic',(.027,.041,.051),.34,.6),
'paper':mat('26 · Uncoated paper',(.86,.80,.68)),
'cream':mat('27 · Ceramic porcelain',(.79,.83,.83),.25,.22),
}
M['glass'].diffuse_color=(.91,.95,.94,1)
glass_shader=M['glass'].node_tree.nodes.get('Principled BSDF')
glass_shader.inputs['Base Color'].default_value=(.91,.95,.94,1)
glass_shader.inputs['Alpha'].default_value=1
glass_shader.inputs['Metallic'].default_value=0
glass_shader.inputs['Transmission Weight'].default_value=1
glass_shader.inputs['IOR'].default_value=1.45
glass_shader.inputs['Roughness'].default_value=.065
M['glass'].surface_render_method='BLENDED'

def flat(name,coords,material,part='architecture'):
    o=mesh(name,coords,[tuple(range(len(coords)))],material)
    o['part']=part
    return o

def box(name,x,y,z,w,d,h,m,edge=0,part='architecture'):
    return cube(name,(x,y,z),(w,d,h),m,edge,part=part)

def facade(name,cx,cy,z,w,h,n,side=False,door=False,opening=None):
    def b(label,t,z,w,d,h,m):
        return box(name+' · '+label,cx+(0 if side else t),cy+(t if side else 0),z,d if side else w,w if side else d,h,m)
    for j in range(n):
        if j == opening: continue
        a=-w/2+j*w/n; e=a+w/n
        if not side:
            coords=[(cx+a,cy,z),(cx+e,cy,z),(cx+e,cy,z+h),(cx+a,cy,z+h)]
        else:
            coords=[(cx,cy+a,z),(cx,cy+e,z),(cx,cy+e,z+h),(cx,cy+a,z+h)]
        o=flat(name+' · Full height glass',coords,'glass','glazing')
        glazing=o.modifiers.new('Laminated glazing · 18 mm','SOLIDIFY')
        glazing.thickness=.018;glazing.offset=0
        if door and j in [n//2-1,n//2]:
            t=(a+e)/2; b('Sliding entrance meeting rail',t,z+h/2,.045,.14,h,'metal')
            o['part']='glazing'
    for j in range(n+1):
        b('Graphite mullion',-w/2+j*w/n,z+h/2,.079,.15,h,'metal')
    b('Graphite head track',0,z+h-.045,w,.15,.09,'metal')
    if opening is None:
        b('Graphite sill track',0,z+.045,w,.15,.09,'metal')
    else:
        for first,last in [(0,opening),(opening+1,n)]:
            if last > first:
                b('Graphite sill track',w*((first+last)/(2*n)-.5),z+.045,w*(last-first)/n,.15,.09,'metal')

def balcony(cx,cy,z,w,d):
    for side,xx,yy,span in [(False,cx,cy-d/2,w),(True,cx-w/2,cy,d),(True,cx+w/2,cy,d)]:
        facade('Terrace balustrade',xx,yy,z,span,.86,max(1,round(span/2.3)),side)
        box('Bronze balustrade handrail',xx,yy,z+.88,.10 if side else span,span if side else .10,.055,'gold')

def light(name,loc,power,color,size,target):
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    o['floor']=CURRENT_FLOOR;o['part']='light'
    return o

def paving(x,y,z,w,d,nx,ny):
    for i in range(nx):
        for j in range(ny):
            xx=x-w/2+w*(i+.5)/nx; yy=y-d/2+d*(j+.5)/ny
            box('Limestone paving module',xx,yy,z,w/nx-.028,d/ny-.028,.095,'path',.018,'landscape')

def tree(x,y,s=1,kind='olive'):
    beam('Planting · Root trunk',(x,y,.13),(x+.16*s,y,s*1.65),.095*s,'wood',8)
    if kind=='cypress':
        for k in range(3):
            ico('Cypress vertical canopy',(x,y,.95*s+s*.53*k),.65*s*(1-k*.14),'leafdark',(1,1,1.75),2)
    else:
        for j in range(12):
            a=j*2.4;d=random.uniform(.26,.98)*s;xx=x+math.cos(a)*d;yy=y+math.sin(a)*d
            z=s*(2.03+random.uniform(-.30,.65))
            if j<6:beam('Olive branch',(x,y,s*.96),(xx,yy,z),.037*s,'wood',6)
            ico('Olive canopy',(xx,yy,z),random.uniform(.52,.88)*s,random.choice(['green','green','leaf']),(1,1,.75),2)

def bollard(x,y):
    box('Promenade · Graphite bollard',x,y,.44,.16,.16,.72,'metal',.025,'landscape')
    box('Promenade · Amber diffuser',x,y,.75,.17,.17,.10,'strip',.01,'landscape')
    box('Promenade · Bollard cap',x,y,.82,.19,.19,.045,'metal',.01,'landscape')

# Two interleaved basalt / bronze plinth layers support a landscaped collection model.
box('Estate · Chamfered basalt plinth',0,-5.5,-.51,74.4,55.4,1.08,'shadow',.52,'landscape')
box('Estate · Bronze reveal',0,-5.5,-.15,74.3,55.3,.042,'gold',.22,'landscape')
box('Estate · Garden surface',0,-5.5,-.037,74.0,55,.32,'grass',.36,'landscape')
paving(0,-6.45,.16,20,4.8,10,4)
for x in [-4.3,4.3]:
    paving(x,-11.78,.16,2.35,5.88,2,6)
paving(0,-15.45,.16,11.2,1.4,8,1)
paving(0,6.85,.15,27,10.2,14,6)
for x in [-11.9,11.9]:
    paving(x,-.2,.16,2.45,16.5,2,12)
box('Rear basalt retaining wall',0,12,.47,30.15,.28,.69,'shadow',.05,'landscape')

# Dark reflecting basin, luminous inlay and blade fountain.
px,py=0,-11.5
box('Reflecting pool · Water',px,py,.23,5.5,5.98,.12,'water',.075,'landscape')
for xx in [-2.87,2.87]:
    box('Reflecting pool · Travertine coping',xx,py,.28,.26,6.36,.23,'stone',.04,'landscape')
    box('Reflecting pool · Submerged light',xx*.938,py,.249,.038,5.97,.035,'strip',0,'landscape')
for yy in [-14.66,-8.34]:
    box('Reflecting pool · Travertine coping',0,yy,.28,5.99,.28,.23,'stone',.04,'landscape')
box('Fountain · Basalt monolith',0,-9.57,.54,3.45,.51,.68,'shadow',.065,'landscape')
box('Fountain · Spillway bronze cap',0,-9.63,.89,3.55,.59,.079,'gold',.025,'landscape')
box('Fountain · Water curtain',0,-9.95,.55,2.72,.028,.60,'glass',0,'landscape')
box('Fountain · Light at spill edge',0,-9.958,.848,2.78,.028,.026,'strip',0,'landscape')
for x in [-5.7,5.7,-9.55,9.55]:
    for y in [-14.9,-9.2,-5.05]:bollard(x,y)
for x,y,s in [(-13.8,9,1.65),(13.4,9,1.65),(-10.78,1.4,1.13),(10.98,1.58,1.12),
                (-10.72,-8.63,1.20),(10.75,-8.63,1.23),(-8.8,-12.9,1.13),(9.6,-11,1.16)]:
    tree(x,y,s)
for x in [-10.2,10.2]:
    for y in [-3.1,3.4,7.5]:tree(x,y,1.3,'cypress')
for x in [-8,8]:
    box('Sunken planting bed',x,-10.7,.24,3.4,6.38,.37,'shadow',.10,'landscape')
    box('Garden bed ground cover',x,-10.7,.435,3.18,6.11,.12,'moss',.08,'landscape')
    for j in range(23):
        xx=x+random.uniform(-1.49,1.49);yy=-10.7+random.uniform(-2.92,2.92)
        s=random.uniform(.12,.36)
        ico('Garden · Low planting',(xx,yy,.45+s*.58),s,random.choice(['green','leaf','leafdark']),(1,.9,.8),1)
        if j%3==0:ico('Garden · Lavender bloom',(xx,yy,.50+s),s*.37,'rose',(1,1,.9))
for x,y in [(-8.2,-7.05),(8.2,-7.05)]:
    box('Garden bench · Oak',x,y,.64,2.6,.63,.15,'woodlight',.05,'landscape')
    for sx in [-.91,.91]:box('Garden bench · Basalt support',x+sx,y,.37,.25,.48,.46,'shadow',.035,'landscape')

# The long glazed podium and offset tower volumes give the estate a castle silhouette.
floor_z=[.68,4.67,8.66]
dims=[(0,1.56,20.3,10.4,-3.17),(0,1.91,19.25,9.6,-2.46),(.54,2.42,15.45,8.5,-1.54)]
for f,z in enumerate(floor_z):
    CURRENT_FLOOR=f
    cx,cy,w,d,front=dims[f]; rear=cy+d/2-.34; l=cx-w/2+.28;r=cx+w/2-.28
    box('Level %d · Cantilevered travertine slab'%(f+1),cx,cy,z-.21,w+.15,d+.15,.42,'stone',.075)
    box('Level %d · Bronze shadow line'%(f+1),cx,cy-d/2-.092,z-.13,w+.19,.055,.055,'gold',.014)
    box('Level %d · Terrazzo interior'%(f+1),cx,(front+rear)/2,z+.03,r-l,rear-front,.065,'floor',.015)
    box('Level %d · Walnut interior ceiling'%(f+1),cx,(front+rear)/2,z+3.64,r-l,rear-front,.11,'wood',.02, 'roof' if f==2 else 'architecture')
    box('Level %d · Rear mineral wall'%(f+1),cx,rear+.075,z+1.83,r-l,.24,3.61,'trim',.035)
    facade('Level %d · Main curtain wall'%(f+1),cx,front,z+.05,r-l,3.53,9,opening=4)
    for x in [l,r]:
        facade('Level %d · Return curtain wall'%(f+1),x,(front+rear)/2,z+.05,rear-front,3.53,5,True)
    for x in [l+.14,r-.14]:
        box('Seamless travertine corner pier',x,rear-.29,z+1.82,.37,.81,3.64,'stone',.055)
    for x in [cx-w*.29,cx+w*.29]:
        box('Oak acoustic backing panel',x,rear-.125,z+1.73,w*.235,.085,3.25,'woodlight',.015)
        for j in range(18):
            xx=x+w*.217*(j/17-.5)
            box('Walnut acoustic fin',xx,rear-.185,z+1.73,.056,.09,3.2,'wood',.013)
    for x in [cx-w*.37,cx-w*.12,cx+w*.12,cx+w*.37]:
        box('Ceiling · recessed amber bar',x,(front+rear)/2,z+3.573,.041,rear-front-.58,.037,'strip',.01,'roof' if f==2 else 'architecture')
        light('Interior · warm indirect fill',(x,cy,z+3.44),126,(1,.91,.80),2.9,(x,cy,z+.6))
    for j in range(11):
        box('Terrace paving seam',cx+w*(j/10-.5), (front+cy-d/2)/2, z+.002,.027,front-(cy-d/2),.018,'shadow')

# Vertical framing reaches the stepped roofs; side glass lanterns have their own rooms.
for x,ww,dep,yy,top in [(-9.06,3.6,5.8,3.58,13.93),(9.41,3.4,5.28,3.82,14.70)]:
    for f,z in enumerate(floor_z):
        CURRENT_FLOOR=f
        box('Tower · Outrigger deck',x,yy,z-.175,ww,dep,.35,'stone',.054)
        for sx in [-1,1]:
            box('Tower · Travertine blade',x+sx*(ww/2-.15),yy+.21,z+(3.64 if f<2 else top-z)/2,.33,dep-.15,3.64 if f<2 else top-z,'stone',.047)
        facade('Tower · Panoramic lantern',x,yy-dep/2,z+.07,ww-.64,(3.59 if f<2 else top-z-.28),2,opening=1 if x<0 else 0)
        box('Tower · Rear travertine',x,yy+dep/2-.06,z+(3.59 if f<2 else top-z)/2,ww,.24,3.59 if f<2 else top-z,'stone',.04)
        box('Tower · Balcony bronze rail',x,yy-dep/2-.071,z+.42,ww-.62,.055,.04,'gold',.015)
    box('Tower · Floating roof plate',x,yy,top,ww+.42,dep+.39,.37,'trim',.06,'roof')
    box('Tower · Inset roof zinc',x,yy,top+.219,ww-.23,dep-.33,.11,'roof',.035,'roof')
    box('Tower · Champagne reveal',x,yy-dep/2-.21,top-.109,ww+.46,.06,.045,'gold',.012,'roof')
    box('Tower · Warm luminous soffit',x,yy-dep/2-.205,top-.201,ww+.13,.063,.035,'strip',.008,'roof')
    light('Tower · Warm lantern',(x,yy,top-.56),540,(1,.89,.77),2.6,(x,yy,9.1))

CURRENT_FLOOR=2
box('Pavilion · Cantilevered flat roof',.54,2.48,12.52,16.12,9.04,.43,'trim',.069,'roof')
box('Pavilion · Inset standing seam zinc',.54,2.48,12.79,15.58,8.48,.18,'roof',.05,'roof')
box('Pavilion · Champagne edge',.54,-2.065,12.44,16.12,.067,.052,'gold',.012,'roof')
for j in range(26):
    box('Pavilion · Standing seam',.54+15.1*(j/25-.5),2.48,12.889,.035,8.29,.035,'metal',.01,'roof')
for x in [-4.8,.55,5.9]:
    box('Pavilion · Inset photovoltaic skylight',x,2.56,12.93,3.55,5.1,.11,'metal',.04,'roof')
    for j in range(4):
        for k in range(3):
            box('Pavilion · Photovoltaic module',x+(j-1.5)*.818,2.56+(k-1)*1.55,13.002,.782,1.49,.048,'blue',.016,'roof')

CURRENT_FLOOR=0
for j in range(4):
    box('Arrival · Floating limestone step',0,-4.52+j*.34,.15+j*.097,6.24,1.73,.24,'trim',.045)
box('Arrival · Dark canopy',0,-3.99,3.85,6.43,2.96,.26,'metal',.065)
box('Arrival · Champagne canopy rim',0,-5.47,3.805,6.34,.067,.071,'gold',.015)
for x in [-2.63,2.63]:
    box('Arrival · Dark column',x,-4.82,2.13,.155,.155,3.3,'metal',.025)
for x in [-1.96,0,1.96]:
    box('Arrival · Recessed canopy light',x,-4.56,3.708,.043,1.30,.038,'strip',.008)
light('Arrival · Warm canopy',(0,-4.13,3.64),420,(1,.89,.77),3.0,(0,-4.9,.4))

# Two usable modern stair flights with visible oak treads and rails.
for f,z in enumerate(floor_z[:2]):
    CURRENT_FLOOR=f
    x=3.12 if f==0 else -2.18
    for j in range(16):
        zz=z+.18+j*.241;yy=.67+j*.291
        box('Stair · Floating oak tread',x,yy,zz,1.40,.345,.13,'woodlight',.022,'furniture')
        if j%3==0:
            for s in [-1,1]:
                box('Stair · Balustrade post',x+s*.67,yy,zz+.38,.045,.045,.78,'metal',.008,'furniture')
    for s in [-1,1]:
        beam('Stair · Bronze grip rail',(x+s*.67,.67,z+.97),(x+s*.67,5.03,z+4.61),.027,'gold')

# Open each stairwell through the ceiling below and the two slab layers above.
for f,x in [(0,3.12),(1,-2.18)]:
    CURRENT_FLOOR=f+1
    z=floor_z[f+1]
    cutter=box('Temporary stairwell cutter',x,3.76,z-.19,1.60,3.12,1.22,None)
    for name in [f'Level {f+1} · Walnut interior ceiling',
                 f'Level {f+2} · Cantilevered travertine slab',
                 f'Level {f+2} · Terrazzo interior']:
        slab=bpy.data.objects[name]
        mod=slab.modifiers.new('Open stairwell','BOOLEAN')
        mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
        with bpy.context.temp_override(object=slab):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    for side in [-1,1]:
        xx=x+side*.84
        for yy in [2.18,3.23,4.28,5.31]:
            box('Stairwell · Graphite guard post',xx,yy,z+.49,.049,.049,.96,'metal',.01)
        beam('Stairwell · Bronze guard rail',(xx,2.18,z+.99),(xx,5.31,z+.99),.026,'gold')
    beam('Stairwell · Near guard rail',(x-.84,2.18,z+.99),(x+.84,2.18,z+.99),.026,'gold')


def furniture(name,x,y,z,w,d,h,m,edge=.04):
    return box(name,x,y,z,w,d,h,m,edge,'furniture')

def pendant(x,y,z):
    for a in [-.73,.73]:beam('Pendant · Cable',(x+a,y,z+2.69),(x+a,y,z+3.59),.014,'metal')
    furniture('Pendant · Bronze linear suspension',x,y,z+2.68,2.08,.16,.065,'gold',.02)
    furniture('Pendant · Warm diffuser',x,y,z+2.64,2.02,.114,.03,'strip',.008)

def planter(x,y,z):
    cyl('Interior · Ribbed ceramic pot',(x,y,z+.33),.38,.62,'trim',16,r2=.46,part='furniture')
    existing=set(bpy.data.objects)
    for j in range(7):
        a=j*2.4
        dx,dy=math.cos(a),math.sin(a)
        reach=.40+.023*j
        start=(x+.04*dx,y+.04*dy,z+.62)
        middle=(x+reach*.60*dx,y+reach*.60*dy,z+1.22+j*.06)
        tip=(x+reach*dx,y+reach*dy,z+.99+j*.06)
        leaf_blade('Interior · Sculpted botanical leaf',start,middle,tip,.14+.009*(j%3),
                   M['green'] if j%2 else M['leaf'],M['grass'],a)
        pipe('Interior · Botanical stem',[(x,y,z+.56),start,middle],.009,M['green'],sides=6)
    for obj in set(bpy.data.objects)-existing:
        obj['part']='finish';obj['floor']=CURRENT_FLOOR
        if CURRENT_ROOM:obj['room_id']=CURRENT_ROOM

def sofa(x,y,z,m='flower'):
    furniture('Sofa · Floating plinth',x,y,z+.20,2.64,.93,.32,'shadow',.058)
    furniture('Sofa · Continuous back',x,y+.37,z+.64,2.81,.26,.57,m,.09)
    for sx in [-1,1]:
        furniture('Sofa · Linen cushion',x+sx*.637,y-.077,z+.38,1.22,.69,.24,m,.08)
        furniture('Sofa · Armrest',x+sx*1.34,y,z+.54,.24,.94,.40,m,.066)
        furniture('Sofa · Contrast pillow',x+sx*.93,y+.19,z+.72,.34,.26,.31,'rug',.07)

def round_rug(name,x,y,z,r,m):
    cyl(name,(x,y,z+.045),r,.024,m,48,part='furniture')

def sculpture(name,x,y,z,m='gold'):
    for i,(rx,ry) in enumerate([(.45,.46),(-.64,.37),(1.24,-.61)]):
        torus(name+' · Orbit',(x,y,z+i*.13),.39+i*.12,.019,m,(rx,ry,i*.34))
    ico(name+' · Core',(x,y,z+.16),.14,'cyan',(1,1,1),2,part='furniture')

CURRENT_FLOOR=0;z=.75;CURRENT_ROOM='hall'
furniture('Reception · Floating walnut desk',.12,3.73,z+.61,3.04,.89,1.19,'wood',.08)
furniture('Reception · Basalt counter',.12,3.73,z+1.24,3.19,1.0,.13,'shadow',.047)
furniture('Reception · Amber desk reveal',.12,3.256,z+.98,2.96,.025,.043,'strip',.008)
furniture('Reception · Touch console',.64,3.54,z+1.36,.43,.41,.12,'butler')
furniture('Reception · Console face',.64,3.50,z+1.429,.35,.29,.014,'cyan',.01)
round_rug('Arrival · Circular woven rug',.0,.62,z,1.40,'blue')
torus('Arrival · Inlaid bronze circle',(0,.62,z+.067),1.24,.019,'gold')
pendant(0,1.06,z)
for x,y in [(-2.78,4.36),(2.15,5.95),(7.93,-1.54),(-8.3,-1.55)]:planter(x,y,z)
sofa(6.61,3.9,z);table(6.6,2.3,z,.66)
furniture('Lounge · Woven rug',6.62,2.97,z+.037,3.55,3.23,.034,'blue',.09)
planter(8.06,5.69,z)

CURRENT_ROOM='library'
for x in [-7.29,-4.88]:bookcase(x,5.91,z,2.05)
furniture('Library · Blue wool carpet',-5.93,2.02,z+.036,4.23,3.58,.03,'blue',.07)
chair(-6.85,2.37,z,math.radians(-28));chair(-4.75,2.43,z,math.radians(27))
table(-5.79,1.53,z,.76)
furniture('Library · Open book',-5.79,1.53,z+.846,.48,.35,.045,'paper',.01)
furniture('Library · Book gutter',-5.79,1.53,z+.873,.023,.34,.01,'wood',.005)
pendant(-5.85,1.87,z)
CURRENT_FLOOR=1;z=4.74;CURRENT_ROOM='gallery'
for i,x in enumerate([-7.25,-5.35,-3.45]):
    y=5.73
    furniture('Gallery · Bronze shadowbox',x,y,z+1.96,1.55,.09,1.85,'gold',.035)
    furniture('Gallery · Linen abstract panel',x,y-.059,z+1.96,1.43,.04,1.73,['blue','trim','shadow'][i],.012)
    for j in range(5):
        a=furniture('Gallery · Abstract applique',x+(j-2)*.163,y-.093,z+1.88+j*.06,.073,.04,1.10-j*.09,['gold','rose','woodlight','flower','wood'][j],.007)
        a.rotation_euler.y=(j-2)*.26+i*.25
furniture('Gallery · Limestone display bench',-5.23,1.93,z+.48,3.09,.68,.24,'trim',.055)
for x in [-6.30,-4.16]:furniture('Gallery · Bench legs',x,1.93,z+.22,.16,.54,.40,'shadow')
furniture('Gallery · Sculptural pedestal',-7.16,-.25,z+.51,.80,.80,1.02,'shadow')
sculpture('Gallery art',-7.16,-.25,z+1.42)
pendant(-5.29,3.7,z)
CURRENT_ROOM='quiet-room'
furniture('Quiet room · Woven tatami',5.56,1.29,z+.037,4.66,3.97,.036,'woodlight',.12)
for x in [4.40,6.51]:
    cyl('Quiet room · Meditation cushion',(x,.74,z+.14),.53,.23,'blue',32,part='furniture')
    planter(x+1.16,4.34,z)
furniture('Quiet room · Low oak tea platform',5.46,2.18,z+.185,1.6,.81,.24,'wood',.063)
cyl('Quiet room · Singing bowl',(5.45,2.18,z+.39),.19,.17,'gold',24,r2=.31,part='furniture')
for x in [4.7,5.5,6.3]:
    cyl('Quiet room · Frosted candles',(x,5.40,z+.24),.094,.45,'strip',12,part='furniture')
sofa(6.10,5.07,z)
pendant(5.48,2.56,z)
CURRENT_FLOOR=2;z=8.73;CURRENT_ROOM='observatory'
round_rug('Observatory · Astral map',.53,2.36,z,2.06,'blue')
for r in [1.34,1.86]:torus('Observatory · Inlaid orbit',(.53,2.36,z+.062),r,.016,'gold')
for a in range(0,360,30):
    t=math.radians(a);ico('Observatory · Inlaid star',(.53+1.64*math.cos(t),2.36+1.64*math.sin(t),z+.075),.035,'strip')
cyl('Observatory · Basalt instrument base',(.53,2.36,z+.10),.75,.18,'shadow',32,part='furniture')
cyl('Observatory · Bronze instrument column',(.53,2.36,z+.55),.24,.93,'gold',20,part='furniture')
for rot in [(0,0,0),(math.pi/2,0,0),(math.pi/3,math.pi/4,0)]:torus('Observatory · Orbital ring',(.53,2.36,z+1.65),.78,.031,'gold',rot)
ico('Observatory · Blue planetary globe',(.53,2.36,z+1.65),.48,'blue',sub=3,part='furniture')
for rx,ry in [(4.93,.78),(5.98,.86),(5.47,1.63)]:beam('Observatory · Telescope tripod',(rx,ry,z+.075),(5.46,1.09,z+1.27),.046,'gold')
beam('Observatory · Carbon optical tube',(5.46,.39,z+1.88),(5.46,1.57,z+1.31),.19,'metal',16)
beam('Observatory · Bronze lens ring',(5.46,.38,z+1.886),(5.46,.49,z+1.831),.205,'gold',20)
furniture('Observatory · Future desk',-4.62,2.49,z+.77,2.33,.85,.155,'woodlight',.035)
for x in [-5.56,-3.69]:furniture('Observatory · Desk trestle',x,2.49,z+.36,.125,.70,.71,'metal',.02)
chair(-4.61,3.51,z)
furniture('Observatory · Desk terminal',-4.63,2.73,z+1.10,.84,.079,.46,'metal',.04)
furniture('Observatory · Cyan display',-4.63,2.685,z+1.11,.73,.015,.36,'cyan',.02)
for x in [-5.7,6.25]:planter(x,5.47,z)
pendant(-4.62,2.49,z)
CURRENT_ROOM=None


# The two wings join the central manor at both upper levels. They share a
# ground concourse and two continuous, open-air staircase routes.
floor_walk=[.748,4.738,8.728]
court_z=.213
wing_x=22.6
inner_x=16.25
room_y=(-5.15,4.75)
stairs_x=12.62
aisle_x=14.85
flight_y=(-8.0,4.3,16.2)
bridge_y=(-3.5,-2.78)
DISPATCH=(0,-19.0,court_z)
EXTRA=[]
CURRENT_FLOOR=-1; CURRENT_ROOM=None

# A continuous grid of paths connects the forecourt, garden rooms and docks.
paving(0,-18.6,.163,62.2,4.58,28,2)
for s in [-1,1]:
    paving(s*aisle_x,3.55,.161,2.30,19.8,1,10)
    paving(s*aisle_x,-12.32,.161,2.30,11.92,1,6)
    paving(s*30.96,1.95,.162,2.35,27.2,1,13)
    paving(s*24.14,-11.12,.161,13.48,2.20,8,1)
    paving(s*21.06,13.68,.161,21.6,2.46,10,2)
    paving(s*4.34,-16.24,.16,2.30,.24,2,1)
    for yy in [-14.9,-12.0,-9.0,8.8,14.8,19.4]:
        bollard(s*16.18,yy)
    for yy in [-13.4,-8.3,-2.7,3,9.5,16.0]:
        tree(s*33.24,yy,random.uniform(.96,1.47))
    for xx in [17.4,21.7,26.3,30.8]:
        tree(s*xx,19.5,random.uniform(.95,1.3),'cypress')
for x in [-31.1,-25,-18,-10,-4.3,4.3,10,18,25,31.1]:
    for y in [-16.19,-21.05]:bollard(x,y)
for x in [-3,-1.8,-.6,.6,1.8,3]:
    box('Steward dock · Porcelain charging plinth',x,-19.85,.235,.91,.78,.06,'metal',.04,'landscape')
    box('Steward dock · Cyan charging line',x,-20.18,.271,.55,.038,.012,'cyan',.008,'landscape')
for y in [-31.9,20.5]:
    for x in range(-34,36,4):
        if y<0 and abs(x)<5:continue
        box('Boundary · Basalt planter',x,y,.42,3.74,1.05,.65,'shadow',.06,'landscape')
        for k in range(4):ico('Boundary · clipped yew',(x+(.87*k-1.28),y,.84),.49,random.choice(['green','leafdark']),(.94,.87,.78),2)

for f,z in enumerate(floor_z):
    CURRENT_FLOOR=f
    for s,label in [(-1,'West knowledge wing'),(1,'East winter wing')]:
        x=s*wing_x
        slab_m='stone' if s<0 else 'trim'
        box(label+' · Pale stone podium',x,-.2,z-.206,12.7,19.9,.41,slab_m,.07)
        box(label+' · Champagne reveal',x,-10.162,z-.11,12.7,.037,.055,'gold',.012)
        box(label+' · Interior walking surface',x,-.2,z+.037,12.56,19.78,.065,'floor',.012)
        for i,y in enumerate(room_y):
            terrace=s==1 and f==2 and i==0
            if terrace:
                facade(label+' · Terrace panoramic rail',x,-10.07,z+.065,12.64,.92,6)
                facade(label+' · Terrace panoramic rail',s*(wing_x+6.34),y,z+.065,9.9,.92,5,True)
                facade(label+' · Terrace passage rail',s*inner_x,y,z+.065,9.9,.92,5,True,opening=2)
            else:
                facade(label+' · Inner curtain wall',s*inner_x,y,z+.068,9.9,3.56,5,True,opening=2)
                facade(label+' · Outer curtain wall',s*(wing_x+6.34),y,z+.068,9.9,3.56,6,True)
                if i==0:
                    facade(label+' · Arrival curtain wall',x,-10.1,z+.068,12.7,3.56,7)
                else:
                    facade(label+' · Rear curtain wall',x,9.70,z+.068,12.7,3.56,7)
                for off in [-4.5,0,4.5]:
                    box(label+' · Warm suspended bar',x+off,y,z+3.62,.056,8.84,.056,'strip',.01,'roof' if f==2 else 'architecture')
                light(label+' · Warm studio',(x,y,z+3.45),226,(1,.93,.83),4.75,(x,y,z+.25))
                if f<2:
                    box(label+' · Slatted walnut ceiling',x,y,z+3.71,12.6,9.72,.13,'wood',.035)
            if f==0:
                for j in range(4):
                    xx=s*(15.28+j*.245)
                    box(label+' · Inner limestone entry step',xx,y,.214+j*.137,.62 if j==3 else .46,2.10,.205,'stone',.027)
        box(label+' · Acoustic dividing spine',x,-.2,z+1.82,12.64,.22,3.54,'woodlight' if s<0 else 'stone',.04)
        for j in range(35):
            xx=x-6.08+j*.358
            box(label+' · Divider bronze slot',xx,-.325,z+1.81,.036,.032,3.27,'gold',.009)

CURRENT_FLOOR=2
for s,label in [(-1,'West knowledge wing'),(1,'East winter wing')]:
    x=s*wing_x
    y=-.2 if s<0 else 4.75
    d=20.25 if s<0 else 10.28
    box(label+' · Overhanging flat roof',x,y,12.57,13.18,d,.37,'trim',.069,'roof')
    box(label+' · Inset standing-seam roof',x,y,12.80,12.75,d-.40,.12,'roof',.044,'roof')
    for j in range(25):
        box(label+' · Standing seam',x-6.0+j*.5,y,12.89,.027,d-.71,.032,'metal',.006,'roof')
    if s<0:
        for yy in [-6,0,6]:
            box(label+' · Zinc skylight frame',x,yy,12.93,7.10,3.4,.16,'metal',.05,'roof')
            for j in range(6):
                box(label+' · Tinted skylight lite',x-2.82+j*1.128,yy,13.03,1.08,3.15,.055,'blue',.022,'roof')
    else:
        # A smaller zinc lantern crowns the glasshouse.
        box(label+' · Raised greenhouse lantern',x,y,13.10,8.94,6.4,.45,'blue',.045,'roof')
        for j in range(8):
            box(label+' · Lantern frame',x-4.19+j*1.196,y,13.35,.074,6.42,.052,'gold',.018,'roof')
        for yy in [y-3.23,y+3.23]:
            box(label+' · Lantern bronze reveal',x,yy,13.16,8.92,.048,.044,'gold',.011,'roof')

def deck(name,x,y,z,w,d):
    box(name+' · Limestone tread',x,y,z-.12,w,d,.24,'stone',.045)
    box(name+' · Champagne underside',x,y,z-.244,w-.08,d-.08,.032,'gold',.014)

def deck_rail(name,x,y,z,w,side=False):
    facade(name,x,y,z+.02,w,.91,max(1,round(w/2.2)),side)
    box(name+' · Bronze handrail',x,y,z+.963,.085 if side else w,w if side else .085,.053,'gold',.012)

for f in [1,2]:
    CURRENT_FLOOR=f; z=floor_walk[f]
    by=bridge_y[f-1]
    # The front bridge runs uninterrupted between both wings, with the central
    # entrance opening onto it and both ends connected to the side galleries.
    deck('Front skybridge',0,by,z,32.43,2.24)
    deck_rail('Skybridge · Front glass',0,by-1.10,z,27.48)
    for s in [-1,1]:
        x=s*aisle_x
        deck_rail('Skybridge · Rear glass',s*12.22,by+1.1,z,4.1)
        begin,end=min(-6.28,by),max(17.02 if f==2 else 5.65,by)
        deck('Inner side gallery',x,(begin+end)/2,z-.012,1.95,end-begin)
        landing=flight_y[f]
        deck('Stair flight landing',s*13.58,landing+.90,z-.008,4.01,2.07)
        for yy in room_y:
            if yy<=end:
                deck('Inner room entry bridge',s*15.62,yy,z-.007,1.36,2.05)
        deck_rail('Side gallery · Inner glass',x-s*.95,(-5.92+by-1.1)/2,z,max(.18,by-1.10+5.92),True)
        for yy in [-6.14,6.38,15.6]:
            if begin<=yy<=end:
                box('Side gallery · Basalt support',x+s*.74,yy,(z+court_z)/2-.16,.22,.29,z-court_z-.31,'metal',.032)

for s in [-1,1]:
    x=s*stairs_x
    for f,(sy,ey,sz,ez) in enumerate(zip(flight_y,flight_y[1:],[court_z,floor_walk[1]],[floor_walk[1],floor_walk[2]])):
        CURRENT_FLOOR=f+1
        count=25
        for i in range(1,count+1):
            yy=sy+(ey-sy)*i/count
            zz=sz+(ez-sz)*i/count
            box('Courtyard stair · Cantilevered limestone',x,yy,zz-.085,2.05,(ey-sy)/count+.024,.17,'stone',.018)
            if i%4==0:
                for side in [-1,1]:
                    box('Courtyard stair · Guard post',x+side*.94,yy,zz+.48,.055,.055,.96,'metal',.01)
        for side in [-1,1]:
            t0=.065 if f>0 else 0
            t1=.935
            a=(x+side*.94,sy+(ey-sy)*t0,sz+(ez-sz)*t0+.96)
            b=(x+side*.94,sy+(ey-sy)*t1,sz+(ez-sz)*t1+.96)
            beam('Courtyard stair · Continuous bronze grip',a,b,.043,'gold')
            beam('Courtyard stair · Basalt stringer',(x+side*.73,sy,sz-.19),(x+side*.73,ey,ez-.19),.106,'shadow',12)

# Landmark catalogue. Each entry names a concrete object and selects a
# recognizable silhouette from the architectural furniture vocabulary.
catalog=[
('archive','檔案庫','library',-1,0,0,'wood',[
 ('catalogue','黃銅卡片目錄','drawers'),('tube','藍色卷宗筒','vessel'),('press','浮雕封印機','press'),('folio','展開的索引冊','book'),('cabinet','高身玻璃檔案櫃','shelf'),('case','黑色防火匣','chest'),('clock','紅銅檔案時鐘','clock'),('scanner','平板文稿掃描臺','screen')]),
('workshop','創作工坊','library',-1,0,1,'blue',[
 ('vise','工作桌的夾鉗','press'),('tools','帶孔工具牆','tools'),('models','白色原型機','sculpture'),('parts','分格零件櫃','drawers'),('lamp','鉸接設計燈','lamp'),('printer','透明原型列印機','case'),('roll','架上的設計捲紙','scroll'),('stool','高腳木凳','stool')]),
('cartography-room','地圖室','library',-1,1,0,'woodlight',[
 ('chart','海岸等高線圖','map'),('compass','羅盤桌','dial'),('atlas','攤開的地圖集','book'),('cabinets','平放圖紙的抽屜櫃','drawers'),('grid','透明經緯網','screen'),('globe','赤道上的地球儀','globe'),('survey','黃銅測量腳架','tripod'),('roll','立起的地圖捲','scroll')]),
('portrait-hall','肖像廳','gallery',-1,1,1,'trim',[
 ('pair','一對雙人肖像','frame'),('oval','橢圓肖像','oval'),('pedestal','石柱上的半身像','bust'),('seat','紫灰色長椅','bench'),('triptych','三聯畫','triptych'),('relief','銅製人像浮雕','relief'),('easel','未完成的畫架','easel'),('case','舊相機展示櫃','case')]),
('music-room','樂室','gallery',-1,2,0,'rug',[
 ('piano','黑色平台鋼琴','piano'),('stand','譜架上的樂譜','easel'),('drum','紅銅定音鼓','drum'),('speaker','一對落地音箱','speaker'),('harp','靠牆的三角豎琴','harp'),('record','唱盤與黑膠','turntable'),('curtain','藍色吸音帷幕','screen'),('bench','皮面琴凳','bench')]),
('planetarium','星象劇場','observatory',-1,2,1,'shadow',[
 ('projector','星圖投影球','globe'),('constellation','牆面的獵戶座','stars'),('meteor','玻璃箱裡的隕石','case'),('orbit','行星軌道裝置','sculpture'),('seat','深藍觀星躺椅','bench'),('console','調光控制臺','screen'),('satellite','三足衛星模型','tripod'),('clock','日月週期盤','dial')]),
('atrium','玻璃中庭','hall',1,0,0,'stone',[
 ('tree','白盆中庭橄欖','planter'),('lamp','紙罩落地燈','lamp'),('desk','接待側桌','bench'),('bell','迎賓銅鐘','vessel'),('directory','立式空間索引','screen'),('sculpture','交疊圓環雕塑','sculpture'),('seat','奶油色等候椅','chair'),('clock','入口掛鐘','clock')]),
('banquet-room','宴會廳','hall',1,0,1,'woodlight',[
 ('table','長餐桌與燭座','banquet'),('sideboard','橡木餐邊櫃','drawers'),('tray','銀色高腳托盤','vessel'),('cupboard','瓷盤陳列櫃','shelf'),('tea','熱茶服務車','cart'),('ice','冰桶與高腳架','drum'),('chair','主桌扶手椅','chair'),('lantern','細柄落地燈','lamp')]),
('tea-room','茶室','quiet-room',1,1,0,'woodlight',[
 ('tray','黑陶壺與茶盤','tea'),('bowl','琥珀色茶碗','vessel'),('bamboo','竹屏風','reeds'),('cushion','方形靛藍坐墊','cushion'),('scroll','竹軸書法卷','scroll'),('incense','灰石香爐','brazier'),('kettle','三腳煮水架','tripod'),('bonsai','盆栽小松','planter')]),
('reflection-suite','冥想套房','quiet-room',1,1,1,'blue',[
 ('mirror','細框立式反射鏡','oval'),('low-table','圓角矮桌','stool'),('cushion','編織靜坐墊','cushion'),('stone','單面拋光玄武岩','bust'),('screen','透光的紙隔屏','reeds'),('lamp','暖色閱讀燈','lamp'),('branch','白陶瓶中的枝條','vessel'),('bed','窗邊躺椅','bench')]),
('roof-terrace','觀景屋頂露台','observatory',1,2,0,'path',[
 ('scope','雙筒觀景望遠鏡','tripod'),('sundial','斜針日晷','dial'),('lounger','屋頂躺椅','bench'),('weather','旋轉氣象標','stars'),('light','青銅露台燈','lamp'),('planter','紫花大陶盆','planter'),('rail','東向山景說明牌','map'),('seat','環形觀景椅','drum')]),
('glasshouse','高空植物溫室','garden',1,2,1,'green',[
 ('fern','陶鉢裡的巨大蕨葉','planter'),('tray','高腳育苗盤','tea'),('orchid','白蘭標本架','case'),('can','長嘴澆水壺','vessel'),('climate','溫室氣候監控面板','screen'),('citrus','結橘子的盆栽','citrus'),('cart','園藝推車','cart'),('bench','斜面移植工作臺','tools')]),
]
outside=[
('arrival-court','迎賓前庭','hall',(0,-26.4),'trim',[
 ('obelisk','玄武岩迎賓方尖碑','obelisk'),('plaque','銅製莊園銘牌','map'),('bowl','圓形雨水鉢','vessel'),('beacon','藍光引路燈','lamp'),('arc','接待弧形長凳','bench'),('chimes','垂吊的風鈴','reeds'),('seat','靠入口的迎賓椅','chair'),('mark','白色方向羅盤','dial')]),
('sculpture-court','雕塑庭','gallery',(-12.75,-26.4),'rose',[
 ('ring','交叉金屬圓環','sculpture'),('head','霧面石膏頭像','bust'),('spire','深色三角碑','obelisk'),('disc','斜立的鏡面圓盤','relief'),('wire','鋼線幾何三角','harp'),('eye','橢圓岩孔','oval'),('pedestal','展覽銘牌','map'),('seat','玫瑰灰石長凳','bench')]),
('orchard','果樹園','garden',(-25.55,-26.4),'green',[
 ('citrus','盆栽橘樹','citrus'),('basket','矮凳上的果籃','tea'),('tree','孤植多枝橄欖樹','planter'),('rack','果實分級木架','shelf'),('bird','三腳餵鳥架','tripod'),('gate','木格果園入口','reeds'),('cart','採果推車','cart'),('seat','蘋果色休憩長凳','bench')]),
('water-garden','水鏡花園','garden',(12.75,-26.4),'blue',[
 ('weir','青銅細瀑牆','weir'),('lotus','蓮花浮盆','vessel'),('lantern','水邊方燈','lamp'),('stone','池面立石','obelisk'),('gauge','水位圓盤','dial'),('bench','倒影長凳','bench'),('reed','細葉蘆葦叢','reeds'),('ripple','漣漪圓環','sculpture')]),
('stone-garden','枯山水庭','quiet-room',(25.55,-26.4),'shadow',[
 ('spire','中央直立禪石','obelisk'),('stone','磨圓的坐禪石','bust'),('rake','木製整砂耙','tools'),('bench','低矮觀砂長椅','bench'),('basin','陶製洗手鉢','vessel'),('bamboo','矮竹籬','reeds'),('disc','砂面石紋圓盤','dial'),('light','方形石燈','lamp')]),
]

def landmark(label,kind,x,y,z,color):
    """Build an individually named prop with a clear silhouette."""
    def b(s,dx,dy,dz,w,d,h,m,edge=.028):
        return furniture(label+' · '+s,x+dx,y+dy,z+dz,w,d,h,m,edge)
    def c(s,dx,dy,dz,r,h,m,r2=None):
        return cyl(label+' · '+s,(x+dx,y+dy,z+dz),r,h,m,24,r2=r2,part='furniture')
    def line(s,a,e,r,m):
        return beam(label+' · '+s,(x+a[0],y+a[1],z+a[2]),(x+e[0],y+e[1],z+e[2]),r,m)
    def head(s,dx,dy,dz,r,m,shape=(1,1,1)):
        return ico(label+' · '+s,(x+dx,y+dy,z+dz),r,m,shape,2,part='furniture')
    if kind=='bench':
        b('Seat',0,0,.51,1.76,.69,.24,color,.075)
        for dx in [-.61,.61]:b('Support',dx,0,.18,.18,.55,.36,'metal')
        return .68
    if kind=='chair':
        chair(x,y,z)
        return .87
    if kind=='lamp':
        c('Weighted foot',0,0,.04,.29,.08,'shadow')
        line('Articulated pole',(0,0,.09),(.16,0,1.46),.042,'gold')
        c('Porcelain luminous shade',.17,0,1.51,.26,.30,'strip',.16)
        return 1.55
    if kind in {'clock','dial','relief','oval'}:
        c('Plinth',0,0,.055,.30,.11,'shadow')
        b('Pedestal',0,0,.47,.12,.14,.87,'gold')
        if kind=='dial':
            c('Etched circular face',0,0,.93,.46,.085,'cream')
            line('Pointer',(-.21,.02,.965),(.14,.07,1.23),.025,'metal')
            for a in range(0,360,30):
                t=math.radians(a);c('Graduation',.37*math.cos(t),.37*math.sin(t),.984,.017,.015,'metal')
            return .99
        circle=c('Circular frame',0,0,1.22,.46,.12,'gold')
        circle.rotation_euler.x=math.pi/2
        face=c('Inset plate',0,-.075,1.22,.406,.043,'cream' if kind=='clock' else 'blue' if kind=='oval' else 'stone')
        face.rotation_euler.x=math.pi/2
        if kind=='oval':
            for o in [circle,face]:o.scale.y=1.42
        if kind=='clock':
            line('Minute hand',(0,-.1,1.22),(.11,-.1,1.49),.021,'metal')
            line('Hour hand',(0,-.11,1.22),(-.21,-.11,1.25),.025,'metal')
        if kind=='relief':head('Bronze face',0,-.14,1.25,.28,'gold',(.62,.28,1))
        return 1.22
    if kind in {'drawers','shelf','tools','screen','map','frame','triptych','easel','stars'}:
        if kind in {'frame','triptych','map','screen','easel','stars'}:
            for dx in [-.52,.52]:b('Column',dx,.14,.56,.078,.10,1.08,'metal')
            if kind=='easel':
                line('Inclined support',(0,.43,.08),(0,.03,1.75),.043,'wood')
            count=3 if kind=='triptych' else 2 if kind=='frame' else 1
            w=.60 if count>1 else 1.38
            for i in range(count):
                dx=(i-(count-1)/2)*(w+.08)
                b('Picture rim',dx,0,1.29,w,.12,.95,'gold')
                b('Inset panel',dx,-.067,1.29,w-.09,.04,.85,'blue' if kind in {'stars','screen','map'} else color)
                if kind=='stars':
                    pts=[(-.42,1.51),(-.20,1.37),(0,1.31),(.22,1.27),(.46,1.47),(.37,1.01),(-.31,1.03)]
                    for xx,zz in pts:head('Luminous star',xx,-.103,zz,.036,'strip')
                    for i,j in [(0,1),(1,2),(2,3),(3,4),(3,5),(1,6)]:line('Constellation',(pts[i][0],-.10,pts[i][1]),(pts[j][0],-.10,pts[j][1]),.011,'gold')
                elif kind=='map':
                    for j in range(6):
                        line('Contour trace',(-.53,-.101,.98+j*.11),(.53,-.101,1.12+j*.077),.018,'cream' if j%2 else 'cyan')
                elif kind in {'frame','triptych'}:
                    head('Portrait silhouette',dx,-.105,1.29,.22,'trim',(.75,.20,1.30))
                else:
                    for j in range(4):b('Panel inscription',dx,-.101,1.05+j*.155,w*.59,.012,.023,'cyan' if kind=='screen' and j==3 else 'paper',.004)
            return 1.34
        b('Case',0,.09,.68,1.60,.53,1.24,'wood')
        for i in range(3):
            dz=.35+i*.34
            b('Drawer face' if kind=='drawers' else 'Shelf',0,-.23,dz,1.51,.14,.24 if kind=='drawers' else .064,color)
            if kind=='drawers':
                for dx in [-.44,.44]:b('Bronze handle',dx,-.325,dz,.19,.071,.033,'gold',.007)
            else:
                for j in range(5):
                    b('Stored object' if kind=='shelf' else 'Mounted tool',-.58+j*.27,-.32,dz+.13,.09 if kind=='tools' else .19,.085,.16+(j%2)*.08,['cream','blue','rug','gold','green'][j])
        return .92
    if kind in {'book','press','case','chest','tea','scroll','turntable','piano','banquet','cart'}:
        if kind=='chest':
            b('Fireproof body',0,0,.36,1.30,.82,.65,'shadow',.08)
            b('Reinforced seam',0,-.426,.52,1.13,.04,.04,'gold')
            b('Lock plate',0,-.46,.43,.17,.06,.22,'metal')
            return .69
        span=2.62 if kind in {'piano','banquet'} else 1.32
        depth=1.15 if kind in {'piano','banquet'} else .67
        b('Worktop',0,0,.78,span,depth,.105,'metal' if kind in {'piano','case'} else 'woodlight',.07)
        for sx in [-1,1]:
            for sy in [-1,1]:
                b('Leg',sx*(span/2-.15),sy*(depth/2-.11),.39,.09,.09,.74,'wood')
                if kind=='cart':c('Wheel',sx*.50,sy*.23,.09,.084,.13,'metal')
        if kind=='book':
            for dx,rot in [(-.24,.08),(.24,-.08)]:
                o=b('Open folio page',dx,-.04,.862,.47,.42,.055,'paper');o.rotation_euler.y=rot
                for j in range(4):b('Printed line',dx,-.19+j*.079,.898,.33,.014,.006,'wood',.002)
        if kind=='press':
            b('Base plate',0,0,.858,.58,.45,.13,'shadow')
            for dx in [-.19,.19]:b('Upright',dx,.085,1.05,.07,.09,.32,'gold')
            b('Lever',0,-.16,1.27,.084,.61,.078,'metal')
        if kind=='case':
            b('Display base',0,0,.855,.99,.56,.085,'shadow')
            head('Specimen',0,0,1.05,.23,color,(1.2,.75,.8))
            for dx in [-.48,.48]:
                for dy in [-.26,.26]:b('Case support',dx,dy,1.09,.035,.035,.42,'gold',.004)
            b('Glass cover',0,0,1.31,.98,.55,.032,'glass',.008)
        if kind in {'tea','cart'}:
            b('Lipped tray',0,0,.855,.93,.50,.076,'metal')
            c('Ceramic vessel',-.18,0,1.03,.15,.27,color,.13)
            c('Ceramic lid',-.18,0,1.19,.16,.06,'gold')
            line('Spout',(-.07,0,1.03),(.12,0,1.14),.027,'metal')
            for dx in [.23,.42]:c('Cup',dx,-.12,.92,.079,.096,'cream',.094)
        if kind=='scroll':
            for i,dy in enumerate([-.12,.07,.24]):
                o=c('Rolled document',i*.10-.12,dy,.902,.062,.68,'paper')
                o.rotation_euler.y=math.pi/2
                line('Copper tie',(.22,dy,.90),(.29,dy,.90),.069,'gold')
        if kind=='turntable':
            b('Turntable deck',0,0,.894,1.04,.57,.12,'wood')
            c('Vinyl record',-.19,0,.966,.244,.024,'shadow')
            c('Paper label',-.19,0,.983,.065,.009,'rose')
            line('Pickup arm',(.39,.16,.974),(.04,-.08,.997),.025,'metal')
        if kind=='piano':
            b('Gloss black grand',0,.09,.99,2.67,1.05,.34,'metal',.15)
            b('Ivory keyboard',0,-.503,.888,1.85,.25,.055,'cream')
            for j in range(19):b('Piano key',-.824+j*.091,-.469,.923,.027,.152,.027,'shadow',.004)
            lid=b('Raised lid',0,.14,1.39,2.67,.98,.096,'metal',.09);lid.rotation_euler.x=.39
            line('Lid stay',(.82,.16,1.10),(.82,.35,1.53),.036,'gold')
        if kind=='banquet':
            for dx in [-.92,-.47,0,.47,.92]:
                c('Fine porcelain plate',dx,0,.852,.146,.022,'cream')
                c('Tall candle',dx,.23,1.02,.027,.32,'strip')
        return 1.16 if kind in {'piano','press','case'} else .93
    if kind in {'planter','citrus'}:
        c('Pot',0,0,.28,.37,.55,'cream',.48)
        line('Trunk',(0,0,.49),(0,0,1.67),.049,'wood')
        for i in range(10):
            a=i*2.39;rr=.20+.04*(i%3)
            dx=rr*math.cos(a);dy=rr*math.sin(a)
            head('Leaf',dx,dy,.89+i*.08,.29,random.choice(['green','leaf']),(.81,.84,1.39))
            if kind=='citrus' and i%2==0:head('Fruit',dx*1.57,dy*1.57,1.05+i*.065,.069,'rose')
        return 1.27
    if kind in {'globe','sculpture','bust','obelisk','tripod','harp','reeds','weir'}:
        if kind=='weir':
            b('Spillway',0,0,.58,1.83,.28,1.14,'shadow',.06)
            b('Spillway bronze edge',0,-.15,1.135,1.85,.095,.055,'gold')
            b('Water curtain',0,-.213,.57,1.63,.023,1.12,'glass')
            return 1.15
        if kind=='obelisk':
            b('Stone pedestal',0,0,.10,.86,.77,.20,'shadow')
            c('Tapered stone',0,0,1.16,.45,1.89,'stone',.21)
            return 1.62
        if kind=='reeds':
            b('Trough',0,0,.14,1.50,.48,.28,'shadow',.04)
            for j in range(11):
                dx=-.64+j*.127
                line('Reed', (dx,0,.27),(dx+(j%3-1)*.14,0,1.29+(j%4)*.08),.027,'gold' if j%3==0 else 'green')
            return 1.22
        if kind=='tripod':
            for a in range(0,360,120):
                t=math.radians(a);line('Tripod leg',(.49*math.cos(t),.49*math.sin(t),.06),(0,0,1.18),.043,'gold')
            line('Optics',(-.28,0,1.48),(.26,0,1.27),.145,'metal')
            line('Lens collar',(-.32,0,1.499),(-.25,0,1.468),.158,'cyan')
            return 1.45
        if kind=='harp':
            for a,e in [((-.63,0,.12),(.62,0,.12)),((-.63,0,.12),(-.27,0,1.68)),((-.27,0,1.68),(.62,0,.12))]:line('Harp frame',a,e,.063,'gold')
            for i in range(10):
                dx=-.48+i*.099;line('String',(dx,0,.15),(dx,0,1.62-abs(dx+.25)*1.72),.011,'cream')
            return 1.09
        b('Sculpture plinth',0,0,.35,.66,.66,.70,'shadow',.046)
        if kind=='sculpture':sculpture(label,x,y,z+1.14)
        elif kind=='bust':
            head('Shoulders',0,0,.83,.31,'trim',(1.25,.53,.66))
            head('Stone head',0,-.018,1.16,.27,'stone',(.72,.75,1.17))
        else:
            head('Instrument globe',0,0,1.19,.42,'blue')
            torus(label+' · Orbital bezel',(x,y,z+1.19),.48,.023,'gold',(.52,.45,0))
        return 1.23
    if kind in {'vessel','drum','brazier','stool','speaker','cushion'}:
        if kind=='cushion':
            b('Woven cushion',0,0,.15,.77,.75,.28,color,.12)
            return .3
        if kind=='speaker':
            for dx in [-.38,.38]:
                b('Acoustic cabinet',dx,0,.55,.49,.42,1.07,'shadow',.065)
                for dz,r in [(.35,.14),(.73,.11)]:
                    o=c('Speaker cone',dx,-.234,dz,r,.037,'metal')
                    o.rotation_euler.x=math.pi/2
            return .74
        c('Stone plinth',0,0,.09,.34,.17,'shadow')
        if kind=='stool':
            c('Support',0,0,.27,.15,.24,'wood')
            c('Stool top',0,0,.44,.44,.13,'woodlight')
            return .51
        c('Stem',0,0,.37,.11,.51,'gold')
        c('Bowl body',0,0,.67,.27,.22,color,.40)
        c('Bowl rim',0,0,.795,.40,.064,'gold')
        if kind=='brazier':
            for j in [-1,0,1]:head('Coal',j*.17,0,.827,.08,'strip')
        return .83
    raise ValueError(kind)

def path_to_side(side,y):
    return [DISPATCH,(side*aisle_x,-19,court_z),(side*aisle_x,y,court_z)]

def wing_entry(side,f,y):
    if f==0:
        return path_to_side(side,y)+[(side*15.25,y,court_z+.11),(side*16.18,y,floor_walk[0]),(side*17.13,y,floor_walk[0])]
    height=floor_walk[f]
    path=path_to_side(side,flight_y[0])+[(side*stairs_x,flight_y[0],court_z),(side*stairs_x,flight_y[1],floor_walk[1])]
    if f==2:path.append((side*stairs_x,flight_y[2],height))
    return path+[(side*aisle_x,flight_y[f],height),(side*aisle_x,y,height),(side*17.13,y,height)]

def campus_loci(rid,cx,cy,z,side,entries,entry,theme,offset_scale=1):
    loci=[]
    coords=[(-3.6,-3.2),(-.25,-3.25),(3.52,-3.18),(4.77,-.73),(4.35,2.59),(1.57,3.23),(-1.30,3.12),(-4.0,2.88)]
    for (suffix,lname,kind),(dx,dy) in zip(entries,coords):
        dx*=offset_scale;dy*=offset_scale
        xx=cx+side*dx;yy=cy+dy
        zz=landmark(rid+' · '+suffix,kind,xx,yy,z,theme)
        approach=(cx+side*dx*.63,cy+dy*.64,z)
        path=[entry,(cx,cy,z),approach]
        loci.append((rid+'-'+suffix,lname,(xx,yy,z+zz),path))
    return loci

def add_extra(rid,name,district,f,center,camera,entry,loci):
    EXTRA.append((rid,name,f,center,camera,loci,district,entry))

for rid,name,district,side,f,i,theme,entries in catalog:
    CURRENT_FLOOR=f;CURRENT_ROOM=rid
    cx=side*wing_x;cy=room_y[i];z=floor_walk[f]
    furniture(rid+' · Central woven carpet',cx,cy,z+.013,5.07,3.07,.026,theme,.12)
    entry=wing_entry(side,f,cy)
    locs=campus_loci(rid,cx,cy,z,side,entries,entry[-1],theme)
    cp=(cx-side*6.7,cy-10.25,z+4.8) if i==0 else (cx+side*7.9,cy+8.6,z+4.6)
    add_extra(rid,name,district,f,(cx,cy,z+.31),(cp,(cx,cy,z+.74)),entry,locs)

for rid,name,district,(cx,cy),theme,entries in outside:
    CURRENT_FLOOR=-1;CURRENT_ROOM=rid
    if rid=='water-garden':
        box('Water garden · Travertine coping',cx,cy,.204,11.65,9.73,.165,'trim',.22,'landscape')
        box('Water garden · Dark reflecting basin',cx,cy,.292,10.99,8.99,.042,'water',.20,'landscape')
        # The walkway crosses the pool at garden grade.
        deck('Water garden · Crosswalk',cx,cy,.325,11.07,1.64)
        deck('Water garden · Approach walk',cx,cy,.333,1.82,9.07)
    elif rid=='stone-garden':
        box('Stone garden · Limestone perimeter',cx,cy,.205,11.65,9.73,.16,'trim',.20,'landscape')
        box('Stone garden · Raked sand',cx,cy,.294,11.14,9.20,.040,'floor',.16,'landscape')
        for rr in [.87,1.17,1.47,1.77,2.07,2.37]:
            torus('Stone garden · Rake ring',(cx-.36,cy,.322),rr,.011,'woodlight')
    elif rid=='orchard':
        box('Orchard · Sunken aromatic turf',cx,cy,.196,11.65,9.73,.15,'moss',.24,'landscape')
        for dx in [-4.65,4.65]:
            for dy in [-3.9,.1,3.85]:tree(cx+dx,cy+dy,.85)
        paving(cx,cy,.237,2.1,8.9,1,5)
    elif rid=='arrival-court':
        box('Arrival plaza · Radial limestone field',cx,cy,.199,11.65,9.73,.15,'trim',.23,'landscape')
        for rr in [1.15,1.55,2.95,4.06]:
            torus('Arrival plaza · Compass ring',(cx,cy,.279),rr,.025,'gold')
        for a in range(0,360,45):
            t=math.radians(a); line_obj=beam('Arrival plaza · Inlaid spoke',(cx+.35*math.cos(t),cy+.35*math.sin(t),.278),(cx+3.96*math.cos(t),cy+3.96*math.sin(t),.278),.019,'gold');line_obj['part']='landscape'
    else:
        box('Sculpture court · Rose-granite ground',cx,cy,.20,11.65,9.73,.15,'path',.22,'landscape')
        for dx in [-4.8,4.8]:
            box('Sculpture court · Edge planting',cx+dx,cy,.34,.63,7.12,.43,'shadow',.10,'landscape')
            for i in range(6):
                ico('Sculpture court · Trimmed grasses',(cx+dx,cy-3.02+i*1.18,.62),.28,'leafdark',(1,1,1.25),2)
    z=.325 if rid in {'water-garden','stone-garden'} else .282
    sign=1 if cx>0 else -1
    entry=[DISPATCH,(cx,-19.0,court_z),(cx,-21.5,court_z),(cx,-22.18,z)]
    if cx==0:entry=[DISPATCH,(3.80,-19.0,court_z),(3.80,-21.4,court_z),(cx,-22.18,z)]
    locs=campus_loci(rid,cx,cy,z,sign,entries,entry[-1],theme,1.0)
    if rid=='water-garden':
        # Dry branches from the crosswalk end within reach of each pool landmark.
        water_loci=[]
        for j,(lid,ln,pos,_) in enumerate(locs):
            xx,yy,_=pos
            approach_y=cy+(yy-cy)*.69 if abs(yy-cy)>1.1 else cy
            deck('Water garden · Landmark landing',xx,(cy+approach_y)/2,z+.003+j*.0008,1.24,abs(approach_y-cy)+.96)
            water_loci.append((lid,ln,pos,[entry[-1],(cx,cy,z),(xx,cy,z),(xx,approach_y,z)]))
        locs=water_loci
    add_extra(rid,name,district,-1,(cx,cy,z+.23),((cx+6,cy-9,8.1),(cx,cy,z+.6)),entry,locs)

CURRENT_FLOOR=2;CURRENT_ROOM='skybridge'
bridge_locs=[]
sky_z=floor_walk[2]
for i,(suffix,name,kind) in enumerate([
    ('beacon','西端琥珀指引燈','lamp'),('compass','長橋方向羅盤','dial'),('lens','庭園景觀鏡頭','tripod'),('bridge-map','三翼平面配置圖','map'),
    ('seat','中央日光休息椅','bench'),('glass','琥珀層壓樣本','case'),('orbit','東端金屬環標','sculpture'),('station','橋頭觀測鐘','clock')
]):
    x=-13.8+i*3.92;y=bridge_y[1]+(.53 if i%2==0 else -.57)
    zz=landmark('Skybridge · '+suffix,kind,x,y,sky_z,'blue')
    bridge_locs.append(('skybridge-'+suffix,name,(x,y,sky_z+zz),[(-14.85,bridge_y[1],sky_z),(x,bridge_y[1],sky_z)]))
sky_entry=wing_entry(-1,2,bridge_y[1])[:-1]
add_extra('skybridge','空中玻璃長橋','observatory',2,(0,bridge_y[1],sky_z+.3),
          ((-12.4,-18.2,15.4),(0,-2.8,9.35)),sky_entry,bridge_locs)

rooms=[
 ('hall','迎賓大廳',0,(0,.62,1.02),((4,-8,4.1),(0,1.8,1.8)),[('hall-ledger','管家的接待簿',(.14,3.64,2.14)),('hall-lantern','入口的燈盞',(-2.38,-3.82,1.28)),('hall-emblem','大廳的圓形徽記',(0,.62,.87))]),
 ('library','知識書房',0,(-5.79,1.67,1.10),((-6.6,-6.1,3.8),(-5.8,2.86,1.77)),[('library-book','書桌上的書',(-5.79,1.53,1.66)),('library-shelf','西側書架',(-7.20,5.47,2.36)),('library-chair','閱讀扶手椅',(-6.86,2.34,1.43))]),
 ('gallery','生命畫廊',1,(-5.25,1.95,5.04),((-6.4,-6.1,7.9),(-5.34,2.57,6.01)),[('gallery-frame','第一幅畫框',(-7.25,5.53,6.57)),('gallery-bench','畫廊長椅',(-5.23,1.86,5.43)),('gallery-balcony','回望陽台',(-4.8,-2.65,5.31))]),
 ('quiet-room','靜心室',1,(5.46,1.35,5.02),((7.2,-6.0,7.9),(5.48,2.42,5.94)),[('quiet-cushion','靜坐軟墊',(4.4,.74,5.05)),('quiet-bowl','桌上的缽',(5.46,2.18,5.27)),('quiet-window','安靜的窗邊',(7.62,-2.04,5.55))]),
 ('observatory','星象閣',2,(.53,2.36,9.11),((5.6,-7.2,12.9),(.53,2.06,10.18)),[('observatory-globe','中央的星儀',(.53,2.36,11.23)),('observatory-telescope','遠望的望遠鏡',(5.46,.42,10.84)),('observatory-desk','未來的書桌',(-4.63,2.53,9.78))]),
 ('garden','月光花園',-1,(0,-10.5,.62),((8,-19,8),(0,-10.4,.5)),[('garden-fountain','花園噴泉',(0,-9.85,1.03)),('garden-bench','花園長椅',(-8.2,-7.05,.84)),('garden-rose','玫瑰花圃',(7.46,-11.8,.96))])
]

# New loci in the original rooms keep the first three stable memory addresses.
original_new={
 'hall':[
  ('console','青色接待終端',(.64,3.50,2.18),(1.0,2.53),None),
  ('pendant','大廳的黃銅吊燈',(0,1.06,3.43),(0,1.06),None),
  ('planter','白陶入口植栽',(-2.78,4.36,1.77),(-1.91,3.58),None),
  ('sofa','奶油色迎賓沙發',(6.61,3.9,1.50),(6.62,2.75),None),
  ('table','來賓的圓形矮桌',(6.60,2.3,1.58),(5.74,2.0),None)],
 'library':[
  ('second-chair','靠窗的第二張椅子',(-4.75,2.43,1.52),(-4.27,1.70),None),
  ('brass-lamp','帶轉軸的黃銅閱讀燈',(-7.96,.31,0),(-7.23,-.23),'lamp'),
  ('atlas','低桌上的年代圖冊',(-7.66,3.52,0),(-8.54,3.12),'book'),
  ('index','珍本索引櫃',(-3.72,3.73,0),(-4.34,3.16),'drawers'),
  ('globe','書房西窗地球儀',(-8.12,4.53,0),(-8.79,4.31),'globe')],
 'gallery':[
  ('second-frame','第二幅亞麻畫布',(-5.35,5.53,6.62),(-5.35,4.87),None),
  ('third-frame','深色第三幅畫布',(-3.45,5.53,6.62),(-3.45,4.84),None),
  ('orbits','玄武岩基座的環形藝術品',(-7.16,-.25,6.38),(-6.31,-.38),None),
  ('model','透明展盒中的原型',(-3.60,.32,0),(-4.38,.36),'case'),
  ('easel','西窗留白畫架',(-8.27,3.44,0),(-8.90,3.11),'easel')],
 'quiet-room':[
  ('second-cushion','另一張青色靜坐墊',(6.51,.74,5.07),(6.52,-.07),None),
  ('candles','三支霧面白蠟燭',(5.5,5.4,5.03),(5.25,4.25),None),
  ('tea-platform','深色橡木茶臺',(5.46,2.18,4.99),(5.46,1.50),None),
  ('fern','東側的白盆葉蕨',(7.67,4.34,5.92),(7.05,3.63),None),
  ('paper-screen','手抄紙隔屏',(4.77,4.19,0),(4.85,3.54),'reeds')],
 'observatory':[
  ('star-map','地面的刻星圓圖',(-.48,1.77,8.85),(-.93,1.35),None),
  ('terminal','未來書桌的青色螢幕',(-4.63,2.68,9.84),(-4.40,1.86),None),
  ('sample','銀灰色岩石樣本',(3.87,4.69,0),(3.86,3.92),'case'),
  ('celestial-chart','西窗赤經赤緯圖',(-6.16,4.01,0),(-5.40,4.06),'map'),
  ('clock','黃銅天文時鐘',(6.59,4.60,0),(5.83,4.64),'clock')],
 'garden':[
  ('pool','倒映莊園的水鏡',(0,-11.65,.31),(4.35,-11.65),None),
  ('east-bench','東側橡木長椅',(8.2,-7.05,.74),(7.97,-6.38),None),
  ('cypress','西廊的直立絲柏',(-10.2,-3.1,1.80),(-11.8,-3.1),None),
  ('bollard','倒影池畔的暖光柱',(5.7,-9.2,.75),(5.06,-9.2),None),
  ('olive','入口花圃的橄欖樹冠',(-8.8,-12.9,2.30),(-5.04,-12.9),None)]
}
def tup(v):return [round(v[0],3),round(v[2],3),round(-v[1],3)]
def central_entry(rid,f):
    if f==-1:
        return [DISPATCH,(4.34,-19,court_z),(4.34,-10.52,court_z)]
    if f==0:
        return [DISPATCH,(-4.34,-19,court_z),(-4.34,-7.15,court_z),
                (0,-7.15,court_z),(0,-5.52,court_z),(0,-4.74,.39),
                (0,-3.70,.67),(0,-3.09,.748),(0,-2.0,.748)]
    side=1 if rid=='quiet-room' else -1
    zz=floor_walk[f];by=bridge_y[f-1]
    p=wing_entry(side,f,by)[:-1]
    return p+[(0,by,zz),(0,-1.22 if f==1 else -.92,zz)]

districts=[
 ('hall','迎賓區','hall arrival-court atrium banquet-room'),
 ('library','知識區','library archive cartography-room workshop'),
 ('gallery','藝文區','gallery portrait-hall sculpture-court music-room'),
 ('garden','花園區','garden orchard water-garden glasshouse'),
 ('observatory','觀星區','observatory skybridge planetarium roof-terrace'),
 ('quiet-room','靜心區','quiet-room tea-room stone-garden reflection-suite')]
manifest={
 'version':2,'model':'/assets/memory-palace.glb','coordinateSystem':'Three.js Y-up, metres',
 'rooms':[],'overview':{'position':[54,35,68],'target':[0,4.2,7]},
 'bounds':{'min':[-37.3,-1.08,-22.3],'max':[37.3,15.1,33.3]},
 'dispatch':tup(DISPATCH),'routes':[],
 'floors':[{'id':-1,'name':'庭園'},{'id':0,'name':'一樓'},{'id':1,'name':'二樓'},{'id':2,'name':'三樓'}]
}
old_approaches={
 'hall':[(.14,2.65),(-1.92,-3.82),(0,.62)],
 'library':[(-5.79,.63),(-6.68,4.81),(-6.41,1.78)],
 'gallery':[(-6.63,4.81),(-5.23,1.16),(-4.80,-3.30)],
 'quiet-room':[(4.40,-.06),(5.46,1.42),(7.62,-1.64)],
 'observatory':[(.53,1.29),(5.46,-.28),(-4.63,1.78)],
 'garden':[(4.34,-9.85),(-8.2,-6.38),(5.26,-11.8)]
}
def original_local_path(rid,lid,entry,a,z):
    if rid=='garden':
        ax,ay,_=a
        if lid=='garden-cypress':
            return [entry[-1],(4.34,-7.62,z),(-4.34,-7.62,z),(-5.0,-6.37,z),(-11.8,-6.37,z),a]
        if ax<0:
            return [entry[-1],(4.34,-7.62,z),(-4.34,-7.62,z),(-4.34,ay,z),a]
        return [entry[-1],(4.34,ay,z),a]
    if lid=='hall-lantern':
        return [entry[-1],(0,-3.1,z),(0,-3.82,.561),a]
    if lid=='hall-sofa':
        return [entry[-1],(0,-1.51,z),(7.75,-1.51,z),(7.75,2.75,z),a]
    if rid=='library':
        front=(entry[-1],(-5.65,-1.27,z))
        if lid in {'library-atlas','library-globe'}:
            return [*front,(-8.36,-1.17,z),(-8.36,1.53,z),(-8.82,2.50,z),a]
        if lid in {'library-index','library-shelf'}:
            return [entry[-1],(-3.84,-1.18,z),(-3.84,3.13,z),(-5.55,3.19,z),a] if lid=='library-shelf' else [entry[-1],(-3.84,-1.18,z),(-3.84,3.13,z),a]
        return [*front,(-5.66,.53,z),a]
    if rid=='gallery':
        if a[1]<-2.5:
            return [entry[-1],(0,-3.50,z),a]
        if lid=='gallery-easel':
            return [entry[-1],(-8.30,-1.20,z),(-8.30,1.28,z),(-8.81,2.51,z),a]
        return [entry[-1],(-5.22,-1.22,z),(-5.22,.89,z),a]
    if rid=='quiet-room':
        if lid in {'quiet-room-candles','quiet-room-fern','quiet-room-paper-screen'}:
            return [entry[-1],(7.34,-1.18,z),(7.34,2.93,z),(6.79,3.15,z),a]
        return [entry[-1],(4.1,-1.24,z),a]
    return [entry[-1],a]

processed=[]
CURRENT_FLOOR=0;CURRENT_ROOM='hall'
box('Arrival · Bronze entrance lantern',-2.38,-3.82,1.21,.31,.31,.43,'metal',.039)
box('Arrival · Entrance lantern glass',-2.38,-3.99,1.28,.23,.018,.27,'strip',.02)
for rid,rname,f,p,camera,loci in rooms:
    CURRENT_FLOOR=f;CURRENT_ROOM=rid
    entry=central_entry(rid,f);z=entry[-1][2]
    old=[]
    for (lid,lname,pos),xy in zip(loci,old_approaches[rid]):
        a=(*xy,.561 if lid=='hall-lantern' else z)
        old.append((lid,lname,pos,original_local_path(rid,lid,entry,a,z)))
    for suffix,lname,pos,xy,kind in original_new[rid]:
        if kind:
            xx,yy,_=pos
            pos=(xx,yy,z+landmark(rid+' · '+suffix,kind,xx,yy,z,'blue'))
        a=(*xy,z)
        lid=rid+'-'+suffix
        old.append((lid,lname,pos,original_local_path(rid,lid,entry,a,z)))
    processed.append((rid,rname,f,p,camera,old,rid,entry))
for rid,rname,f,p,(cp,ct),loci,district,entry in processed+EXTRA:
    z=entry[-1][2]
    locs=[]
    for n,(lid,lname,pos,path) in enumerate(loci,1):
        anchor=bpy.data.objects.new('Locus_'+lid,None)
        bpy.context.collection.objects.link(anchor)
        anchor.location=pos
        anchor.empty_display_size=.12
        anchor['floor']=f
        anchor['part']='locus'
        anchor['locusId']=lid
        anchor['roomId']=rid
        anchor['room_id']=rid
        locs.append({'id':lid,'name':lname,'position':tup(pos),'walk_position':tup(path[-1]),
                     'walk_path':[tup(v) for v in path],'route_index':n})
    manifest['rooms'].append({'id':rid,'name':rname,'floor':f,'district_id':district,
        'position':tup(p),'camera':{'position':tup(cp),'target':tup(ct)},
        'walk_height':z,'entry_path':[tup(v) for v in entry],'loci':locs})
room_lookup={r['id']:r for r in manifest['rooms']}
steward_names=['迎賓','索引','畫廊','園藝','觀星','靜心']
manifest['stewards']=[]
for i,(district,name,rids) in enumerate(districts):
    rids=rids.split()
    locs=[locus for rid in rids for locus in room_lookup[rid]['loci']]
    for n,locus in enumerate(locs,1):locus['district_route_index']=n
    manifest['routes'].append({'id':district,'name':name,'room_ids':rids,'locus_ids':[l['id'] for l in locs]})
    dock_x=-3+1.2*i
    home=tup((dock_x,-19.85,.265))
    manifest['stewards'].append({'id':district,'district_id':district,'name':steward_names[i],
        'home':home,'home_path':[home,tup((dock_x,-19.10,court_z)),tup(DISPATCH)]})
assert len(room_lookup)==24 and len({l['id'] for r in manifest['rooms'] for l in r['loci']})==192
(OUT/'scene-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
from luxury_details import add_luxury_details
from luxury_materials import enhance_materials
from lighting_design import add_lighting_design
add_luxury_details(globals())
add_lighting_design(globals(),manifest,OUT)
enhance_materials(globals())
CURRENT_FLOOR=-1;CURRENT_ROOM=None

world=bpy.data.worlds.new('Daylight · Overcast sky');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.86,.91,1,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.63
light('Daylight · Soft key',(-13,-14,28),7400,(1,.94,.85),21,(0,0,4))
light('Daylight · Lateral fill',(19,-2,16),4100,(.87,.94,1),22,(0,0,4))
light('Daylight · Back fill',(-2,17,28),7400,(1,.96,.89),20,(0,0,7))
light('Ground · Entrance ambient',(0,-14,8),730,(1,.91,.80),7,(0,-4,1))
light('Garden · Pool edge',(0,-10,1.8),85,(.87,.95,1),3,(0,-12,.3))
for side in [-1,1]:
    light('Campus · Wing fill',(side*28,-15,21),5900,(.94,.97,1),19,(side*23,0,5))
    light('Campus · Front garden fill',(side*19,-28,17),2900,(1,.95,.87),17,(side*17,-24,0))
light('Campus · Sky wash',(0,-20,32),4000,(1,.96,.91),24,(0,-20,0))
# A backdrop is kept in the Blender portrait only.
box('Studio · Porcelain sweep',0,0,-1.19,200,200,.21,mat('Studio porcelain',(.84,.75,.63),.82,glow=.35),.06,'backdrop')
bpy.ops.object.camera_add(location=(44,-73,49));camera=bpy.context.object;camera.name='Estate · Architectural portrait'
camera.rotation_euler=(Vector((0,-5.9,4.3))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=101.6
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=128
scene.cycles.adaptive_threshold=.018
if os.environ.get('PALACE_METAL') == '1':
    cycles = bpy.context.preferences.addons['cycles'].preferences
    cycles.compute_device_type = 'METAL'
    cycles.get_devices()
    for device in cycles.devices:
        device.use = device.type == 'METAL'
    if not any(device.use for device in cycles.devices):
        raise RuntimeError('PALACE_METAL=1 requires a usable Metal device')
    scene.cycles.device = 'GPU'
    scene.cycles.denoising_use_gpu = True
scene.cycles.use_denoising=True
scene.cycles.transparent_max_bounces=12
scene.render.resolution_x=2400;scene.render.resolution_y=1800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'palace-preview.png')
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium Low Contrast'
scene.view_settings.exposure=.30
scene.render.film_transparent=False

collection_names={-1:'00 · Estate and landscape',0:'01 · Arrival and library',1:'02 · Gallery and meditation',2:'03 · Observatory and roofs'}
collections={f:bpy.data.collections.new(name) for f,name in collection_names.items()}
collections['studio']=bpy.data.collections.new('04 · Portrait camera and lights')
for c in collections.values():scene.collection.children.link(c)
for o in list(scene.objects):
    part=o.get('part')
    if part in {'backdrop','light'} or o.type=='CAMERA':
        c=collections['studio']
    else:
        c=collections.get(o.get('floor',-1),collections[-1])
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o)
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.shading.color_type='MATERIAL'
scene.render.filepath='//palace-preview.png'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'memory-palace.blend'))
# The source file keeps every editable prop. The web model batches opaque
# surfaces with matching visibility and materials to cut draw calls.
groups={}
depsgraph=bpy.context.evaluated_depsgraph_get()
for o in list(scene.objects):
    part=o.get('part')
    if part=='locus':
        o.select_set(True)
    if o.type!='MESH' or part=='backdrop':
        continue
    material=o.data.materials[0]
    if material==M['glass']:
        # Keep panes independent so Three.js can sort transparency by depth.
        o.select_set(True)
        continue
    key=(o['floor'],part,o.get('room_id'),material)
    groups.setdefault(key,[]).append(o)

batches=[]
for (floor,part,room_id,material),objects in groups.items():
    if len(objects)==1:
        objects[0].select_set(True)
        continue
    vertices=[]
    faces=[]
    normals=[]
    smoothing=[]
    uvs=[]
    for source in objects:
        evaluated=source.evaluated_get(depsgraph)
        original=evaluated.data
        offset=len(vertices)
        transform=evaluated.matrix_world
        normal_transform=transform.to_3x3().inverted_safe().transposed()
        vertices.extend(transform@v.co for v in original.vertices)
        faces.extend(tuple(offset+idx for idx in p.vertices) for p in original.polygons)
        normals.extend((normal_transform@n.vector).normalized() for n in original.corner_normals)
        smoothing.extend(p.use_smooth for p in original.polygons)
        if material.get('palace_textured'):
            uvs.extend(tuple(item.uv) for item in original.uv_layers.active.data)
    label=f'Web batch · {floor} · {room_id or "estate"} · {part} · {material.name}'
    combined=bpy.data.meshes.new(label)
    combined.from_pydata(vertices,[],faces)
    combined.update()
    if uvs:
        uv_layer=combined.uv_layers.new(name='Palace Surface')
        uv_layer.data.foreach_set('uv',[value for uv in uvs for value in uv])
    for polygon,smooth in zip(combined.polygons,smoothing):
        polygon.use_smooth=smooth
    combined.normals_split_custom_set(normals)
    combined.materials.append(material)
    batch=bpy.data.objects.new(label,combined)
    scene.collection.objects.link(batch)
    batch['floor']=floor
    batch['part']=part
    if room_id:
        batch['room_id']=room_id
    batch.select_set(True)
    batches.append(batch)
# The source and Cycles portraits retain refractive solid glazing. The daily
# browser model uses alpha glazing to avoid hundreds of refraction passes.
glass_shader.inputs['Transmission Weight'].default_value=0
glass_shader.inputs['Alpha'].default_value=.19
glass_shader.inputs['Metallic'].default_value=.18
bpy.ops.export_scene.gltf(filepath=str(OUT/'memory-palace.glb'),export_format='GLB',use_selection=True,export_extras=True,export_apply=True,export_yup=True)
glass_shader.inputs['Transmission Weight'].default_value=1
glass_shader.inputs['Alpha'].default_value=1
glass_shader.inputs['Metallic'].default_value=0
for batch in batches:
    bpy.data.objects.remove(batch,do_unlink=True)
if os.environ.get('PALACE_SKIP_RENDER') != '1':
    bpy.ops.render.render(write_still=True)
print('PALACE_COMPLETE',len([o for o in scene.objects if o.type=='MESH']),'mesh objects')
