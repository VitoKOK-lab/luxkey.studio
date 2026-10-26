#!/usr/bin/env python3
"""把 assets/*.glb 打包成 assets/models.json、assets/chars/*.glb 打包成 assets/chars/models.json。
用法：python3 scripts_bundle.py
（claude.ai artifact 不接受 .glb 直接發布，所以用 base64 JSON；本機或自架可直接改 loader.load）"""
import os, base64, json
here = os.path.dirname(os.path.abspath(__file__))
for folder in ['assets', 'assets/chars']:
    d = os.path.join(here, folder)
    if not os.path.isdir(d): continue
    bundle = {f[:-4]: base64.b64encode(open(os.path.join(d, f), 'rb').read()).decode() for f in sorted(os.listdir(d)) if f.endswith('.glb')}
    json.dump(bundle, open(os.path.join(d, 'models.json'), 'w'))
    print(f'{folder}/models.json  {len(bundle)} models  {os.path.getsize(os.path.join(d, "models.json")) // 1024} KB')
