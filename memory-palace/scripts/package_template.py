#!/usr/bin/env python3
"""Create a clean, source allowlisted Memory Palace template ZIP."""
from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
OUTPUT = ROOT / 'dist' / 'MemoryPalace-template.zip'
ROOT_FILES = {
    'README.md', 'AGENTS.md', '.gitignore', 'server.py', 'palace_store.py',
    'design_store.py', 'ai_butler.py', 'ai_provider.py', 'package.json',
    'package-lock.json', 'LICENSE', 'NOTICE', '開啟憶境莊園.command',
}
SCRIPT_FILES = {
    'backup.py', 'launch.py', 'mcp_server.py', 'ocr.swift', 'package_template.py', 'palace.py',
}
ASSET_FILES = {
    'scene-manifest.json', 'memory-palace.blend', 'memory-palace.glb',
    'lighting-manifest.json', 'lighting-preview.jpg',
    'palace-preview.png', 'app-preview.jpg', 'first-person-preview.jpg', 'render-style-preview.jpg',
    'style-comparison.jpg', 'concurrent-stewards-preview.jpg',
    'meditation-preview.jpg', 'meditation-mobile-preview.jpg',
    'accessories/accessories.blend', 'accessories/accessory-preview.png',
    'accessories/plush-bear.glb', 'accessories/moon-lamp.glb',
    'accessories/plant.glb', 'accessories/crystal.glb', 'renders/index.json',
    'stewards/robot-dog.glb', 'stewards/robot-cat.glb', 'stewards/robot-owl.glb',
    'stewards/robot-animals.blend', 'stewards/robot-animals-preview.png',
    'stewards/live-preview.jpg',
    'quality/hall-quality.blend', 'quality/hall-quality.glb',
    'quality/robot-noa.blend', 'quality/robot-noa.glb',
    'quality/hall-live.jpg', 'quality/noa-live.jpg',
    'renders/quality-hall.png', 'renders/quality-noa.png',
}
TEXTURE_SURFACES = ('boucle', 'bronze', 'calacatta', 'limestone', 'oak',
                    'travertine', 'velvet', 'walnut')
RENDER_IDS = (
    'exterior', 'hall', 'library', 'gallery', 'quiet-room', 'observatory',
    'garden', 'archive', 'workshop', 'cartography-room', 'portrait-hall',
    'music-room', 'planetarium', 'atrium', 'banquet-room', 'tea-room',
    'reflection-suite', 'roof-terrace', 'glasshouse', 'arrival-court',
    'sculpture-court', 'orchard', 'water-garden', 'stone-garden', 'skybridge',
)
ASSET_FILES.update(f'textures/{surface}-{channel}.png'
                   for surface in TEXTURE_SURFACES for channel in ('color', 'normal', 'roughness'))
ASSET_FILES.update(f'renders/{render_id}.png' for render_id in RENDER_IDS)
CODE_SUFFIXES = {'.py', '.js', '.mjs', '.html', '.css', '.md', '.json', '.swift'}


def allowed_paths(root: Path):
    """Enumerate approved source paths; private/runtime trees are never traversed."""
    root = Path(root).resolve()
    candidates = set()
    candidates.update(path for path in ROOT_FILES if (root / path).is_file())
    candidates.update(f'scripts/{name}' for name in SCRIPT_FILES
                      if (root / 'scripts' / name).is_file())
    for folder in ('app', 'blender', 'docs', 'tests'):
        base = root / folder
        if base.is_dir():
            candidates.update(path.relative_to(root).as_posix() for path in base.rglob('*')
                              if path.is_file() and path.suffix.lower() in CODE_SUFFIXES)
    candidates.update(f'assets/{name}' for name in ASSET_FILES if (root / 'assets' / name).is_file())
    three = root / 'node_modules' / 'three'
    if three.is_dir():
        for path in three.rglob('*'):
            if path.is_file() and (path.name in {'package.json', 'LICENSE', 'LICENSE.md', 'README.md'}
                                   or path.relative_to(three).parts[0] == 'build' and path.suffix in {'.js', '.mjs'}
                                   or path.relative_to(three).parts[:2] == ('examples', 'jsm')
                                   and path.suffix == '.js'):
                candidates.add(path.relative_to(root).as_posix())
    if (root / 'config' / 'ai.env.example').is_file():
        candidates.add('config/ai.env.example')
    result = []
    for relative in sorted(candidates):
        path = root / relative
        parts = Path(relative).parts
        if any(part in {'.git', 'data', 'runtime', 'logs', '__pycache__'} for part in parts):
            continue
        # Reject symlinked folders as well as files. An approved relative path
        # could otherwise resolve into a private tree inside the project root.
        if not path.is_file() or path.resolve() != path:
            continue
        if path.name in {'.env', 'ai.env'} or path.name.startswith('.env.'):
            continue
        result.append(relative)
    return result


def package_template(destination=OUTPUT, root=ROOT, include_design=False, design=None):
    root, destination = Path(root).resolve(), Path(destination).resolve()
    entries = allowed_paths(root)
    if include_design:
        if design is None:
            raise ValueError('include_design requires a validated cosmetic design snapshot')
        # Keep a self-contained, cosmetic-only design seed at the archive root.
        from design_store import validate_design
        seed = json.dumps(validate_design(design), ensure_ascii=False, indent=2).encode('utf-8')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        for relative in entries:
            archive.write(root / relative, relative)
        if include_design:
            archive.writestr('template-design.json', seed)
    return destination


def main():
    parser = argparse.ArgumentParser(description='打包乾淨的憶境莊園範本')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--include-design', action='store_true',
                        help='將本機資料庫中的外觀設計作為新安裝預設值')
    parser.add_argument('--db', type=Path, help='讀取外觀設計的 SQLite vault 路徑')
    args = parser.parse_args()
    design = None
    if args.include_design:
        from design_store import DesignStore
        from palace_store import PalaceStore
        design = DesignStore(PalaceStore(args.db)).export()
    target = package_template(args.output, include_design=args.include_design, design=design)
    print(target)


if __name__ == '__main__':
    main()
