"""Render the editable estate and every room with Cycles.

Blender --background --python blender/render_estate.py [-- --only hall,library]
"""
import argparse
import bpy
import json
import os
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'renders'
parser = argparse.ArgumentParser()
parser.add_argument('--only', default='')
parser.add_argument('--draft', action='store_true')
parser.add_argument('--output-dir', type=Path, default=OUT)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT = args.output_dir.resolve()
OUT.mkdir(parents=True, exist_ok=True)
only = set(filter(None, args.only.split(',')))
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets' / 'memory-palace.blend'))
manifest = json.loads((ROOT / 'assets' / 'scene-manifest.json').read_text())
scene = bpy.context.scene
for obj in list(bpy.data.objects):
    if obj.type == 'CAMERA' and obj.name.startswith('Interior portrait · '):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data.users == 0: bpy.data.cameras.remove(data)
scene.render.engine = 'CYCLES'
scene.cycles.use_denoising = True
scene.cycles.transparent_max_bounces = 16
scene.cycles.max_bounces = 10
scene.cycles.adaptive_threshold = .018
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.resolution_percentage = 100
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

def camera(name, position, target, lens=25):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()
    data.lens = lens
    data.clip_start = .045
    data.clip_end = 400
    return obj

central = {
    'hall': ((2.4,-2.1,2.348),(-1.6,3.4,1.75)),
    'library': ((-3.35,-.9,2.348),(-7.4,3.4,1.55)),
    'gallery': ((-7.1,-2.13,6.338),(-6.35,3.2,5.95)),
    'quiet-room': ((3.2,-1.15,6.338),(6.6,3.2,5.65)),
    'observatory': ((-3.5,-.9,10.328),(1.8,3.75,9.9)),
    'garden': ((8,-17.2,2.2),(-1,-7.9,1.1)),
    'skybridge': ((-9,-2.78,10.328),(8,-2.78,9.7)),
    'cartography-room': ((-18.9,-7.9,6.338),(-24.2,-2.95,5.738)),
    'atrium': ((24.9,-9.13,2.348),(21.1,-6.45,1.65)),
    'music-room': ((-24.75,-9.25,10.328),(-20.7,-6.62,9.78)),
    'planetarium': ((-25.5,1.0,10.328),(-20.2,3.2,9.85)),
    'banquet-room': ((25.4,.88,2.348),(21.0,2.6,1.70)),
    'reflection-suite': ((18.9,2.0,6.338),(24.2,6.95,5.738)),
    'glasshouse': ((24.9,.77,10.328),(21.1,3.45,9.63)),
    'orchard': ((-26.25,-31.05,2.22),(-25.35,-23.1,1.22)),
    'arrival-court': ((-1.7,-31.3,2.55),(.65,-25.7,1.15)),
}

entries = []
portrait = scene.camera
entries.append({'id':'exterior','name':'玻璃莊園 · 建築全景','floor':None,'camera':portrait,'featured':True})
for room in manifest['rooms']:
    rid = room['id']
    if rid in central:
        position, target = central[rid]
    else:
        x, _, web_z = room['position']
        y, height = -web_z, room['walk_height']
        if room['floor'] == -1:
            position=(x+5.2,y-6.2,height+1.8)
            target=(x-.4,y+.1,height+.8)
        else:
            side = 1 if x>0 else -1
            position=(side*18.9,y-3.15,height+1.6)
            target=(side*24.2,y+2.2,height+1.0)
    cam=camera('Interior portrait · '+room['name'],position,target,26 if room['floor']>=0 else 30)
    entries.append({'id':rid,'name':room['name'],'floor':room['floor'],'camera':cam,
                    'featured':rid in ('hall','library','quiet-room','observatory')})

# Save reusable architectural viewpoints into the editable source.
scene.camera = portrait
bpy.context.preferences.filepaths.save_version = 0
if not args.draft:
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets' / 'memory-palace.blend'))

# Only the camera changes between portraits. Reuse the synchronized geometry.
scene.render.use_persistent_data = True
print('CYCLES_DEVICE', scene.cycles.device, 'GPU_DENOISE', scene.cycles.denoising_use_gpu, flush=True)

index_path = OUT / 'index.json'
previous = json.loads(index_path.read_text()) if index_path.exists() else {'renders':[]}
completed = {entry['id']:entry for entry in previous['renders']}
for entry in entries:
    if only and entry['id'] not in only: continue
    scene.camera = entry['camera']
    if args.draft:
        scene.render.resolution_x=960;scene.render.resolution_y=720;scene.cycles.samples=24
    elif entry['id']=='exterior':
        scene.render.resolution_x=2400;scene.render.resolution_y=1800;scene.cycles.samples=128
    elif entry['featured']:
        scene.render.resolution_x=1920;scene.render.resolution_y=1440;scene.cycles.samples=96
    else:
        scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.cycles.samples=64
    target=OUT/(entry['id']+'.png')
    scene.render.filepath=str(target)
    print('RENDER_START',entry['id'],flush=True)
    bpy.ops.render.render(write_still=True)
    completed[entry['id']]={'id':entry['id'],'name':entry['name'],'floor':entry['floor'],
        'image':'/assets/renders/'+target.name,'width':scene.render.resolution_x,
        'height':scene.render.resolution_y,'engine':'Blender Cycles','samples':scene.cycles.samples,
        'draft':args.draft}
    index_path.write_text(json.dumps({'title':'憶境莊園 · 材質與光',
        'renders':[completed[e['id']] for e in entries if e['id'] in completed]},ensure_ascii=False,indent=2)+'\n')
    if entry['id']=='exterior' and not args.draft:
        (ROOT/'assets'/'palace-preview.png').write_bytes(target.read_bytes())
    print('RENDER_COMPLETE',entry['id'],flush=True)
print('PORTRAITS_COMPLETE',len(completed),flush=True)
