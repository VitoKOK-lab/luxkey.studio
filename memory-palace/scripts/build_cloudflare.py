#!/usr/bin/env python3
"""Build the public Cloudflare asset tree without reading private runtime data.

The local app and Blender/GLB originals are never modified. The estate GLB is
repacked losslessly as glTF plus small external buffers for Workers Assets.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
from pathlib import Path
import shutil
import struct
import tempfile

from package_template import ASSET_FILES

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist' / 'cloudflare' / 'public'
MAX_ASSET_BYTES = 25 * 1024 * 1024
BUFFER_BYTES = 20 * 1024 * 1024
APP_FILES = {
    'animal-rig.js', 'chat.js', 'cloud-session.js', 'decor.css', 'decor.js',
    'follow-camera.js', 'furnishings.js', 'index.html', 'main.js',
    'material-styles.js', 'meditation-water.js', 'meditation.css', 'meditation.js',
    'navigation.css', 'navigation.js', 'quality-model.js', 'render-style.js',
    'renders.css', 'renders.html', 'renders.js', 'room-lighting.js', 'scene.js',
    'steward-appearance.js', 'stewards.js', 'style-controls.css',
    'style-controls.js', 'style.css',
}
LOGIN_FILES = {
    'cloudflare/login.html': 'login.html',
    'cloudflare/login.js': 'auth/login.js',
    'cloudflare/login.css': 'auth/login.css',
}
CLOUD_COPY_TEXT = {
    '貼上文字或截圖 · 語音由瀏覽器辨識': '對話、截圖與相關記憶會交由 Claude 處理',
    '本機私人空間': '雲端私人空間',
    '記憶儲存在這部電腦': '記憶儲存在你的雲端私人空間',
    '原文會先保存在本機': '原文會先保存在你的雲端私人空間',
    '本機記憶': '雲端記憶',
    '本機收件匣': '雲端收件匣',
    '本機服務': '雲端服務',
    '本機資料檢查': '雲端資料檢查',
}


def safe_source(root: Path, relative: str) -> Path:
    path = root / relative
    if not path.is_file() or path.resolve() != path:
        raise ValueError(f'Missing required regular source file (symlinks rejected): {relative}')
    return path


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError('Truncated GLB')
    magic, version, length = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or length != len(data):
        raise ValueError('Expected a complete glTF 2 GLB')
    offset, chunks = 12, {}
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError('Truncated GLB chunk header')
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if offset + size > len(data) or kind in chunks:
            raise ValueError('Invalid or duplicate GLB chunk')
        chunks[kind] = data[offset:offset + size]
        offset += size
    if set(chunks) != {0x4E4F534A, 0x004E4942}:
        raise ValueError('Expected one JSON and one binary chunk')
    return json.loads(chunks[0x4E4F534A]), chunks[0x004E4942]


def repack_glb(source: Path, output: Path, chunk_bytes: int = BUFFER_BYTES) -> dict:
    original, binary = read_glb(source)
    if len(original.get('buffers', [])) != 1 or original['buffers'][0].get('uri'):
        raise ValueError('Expected one embedded source buffer')
    if original['buffers'][0]['byteLength'] > len(binary):
        raise ValueError('Source binary buffer is truncated')
    converted = deepcopy(original)
    chunks: list[bytearray] = [bytearray()]
    for view in converted.get('bufferViews', []):
        if view.get('buffer', 0) != 0:
            raise ValueError('Unexpected external source buffer')
        start, size = view.get('byteOffset', 0), view['byteLength']
        if start < 0 or size < 0 or start + size > original['buffers'][0]['byteLength']:
            raise ValueError('Source bufferView falls outside the binary buffer')
        if size > chunk_bytes:
            raise ValueError(f'A single bufferView exceeds the {chunk_bytes}-byte chunk limit')
        padding = (-len(chunks[-1])) % 4
        if len(chunks[-1]) + padding + size > chunk_bytes:
            chunks.append(bytearray())
            padding = 0
        chunks[-1].extend(b'\0' * padding)
        view['buffer'] = len(chunks) - 1
        view['byteOffset'] = len(chunks[-1])
        chunks[-1].extend(binary[start:start + size])
    output.parent.mkdir(parents=True, exist_ok=True)
    converted['buffers'] = []
    for index, chunk in enumerate(chunks):
        filename = f'{output.stem}-{index + 1}.bin'
        (output.parent / filename).write_bytes(chunk)
        converted['buffers'].append({'uri': filename, 'byteLength': len(chunk)})
    output.write_text(json.dumps(converted, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    validate_repacked(original, binary, converted, output.parent)
    return {'bufferViews': len(original.get('bufferViews', [])),
            'accessors': len(original.get('accessors', [])),
            'images': len(original.get('images', [])), 'buffers': len(chunks)}


def validate_repacked(original: dict, binary: bytes, converted: dict, base: Path) -> None:
    """Verify every geometry/image view and every other glTF property survived."""
    restored = deepcopy(converted)
    restored['buffers'] = deepcopy(original['buffers'])
    buffers = [(base / entry['uri']).read_bytes() for entry in converted['buffers']]
    if len(original.get('bufferViews', [])) != len(converted.get('bufferViews', [])):
        raise ValueError('Repacking changed the bufferView count')
    for index, (before, after) in enumerate(zip(original.get('bufferViews', []), converted.get('bufferViews', []))):
        start, size = before.get('byteOffset', 0), before['byteLength']
        new_start = after.get('byteOffset', 0)
        if new_start % 4 or buffers[after['buffer']][new_start:new_start + size] != binary[start:start + size]:
            raise ValueError(f'Repacked bufferView {index} differs from its source')
        restored['bufferViews'][index] = deepcopy(before)
    if restored != original:
        raise ValueError('Repacking changed non-buffer glTF data')


def cloud_copy(text: str, html: bool = False) -> str:
    for before, after in CLOUD_COPY_TEXT.items():
        text = text.replace(before, after)
    if html:
        text = text.replace('</head>', '<script type="module" src="/cloud-session.js"></script></head>')
    return text


def validate_public_tree(public: Path) -> dict:
    files = [path for path in public.rglob('*') if path.is_file()]
    for path in files:
        relative = path.relative_to(public)
        if path.resolve() != path or any(part in {'data', 'runtime', 'logs', '.git', '__pycache__', 'config'} for part in relative.parts):
            raise ValueError(f'Non-public file in build: {relative}')
        if path.suffix.lower() in {'.py', '.sqlite', '.sqlite3', '.db', '.env', '.log', '.swift'} or path.name in {'AGENTS.md', '.env', 'ai.env'} or path.name.startswith('.env.'):
            raise ValueError(f'Non-public file in build: {relative}')
        if path.stat().st_size > MAX_ASSET_BYTES:
            raise ValueError(f'Asset exceeds Cloudflare limit: {relative}')
    return {'files': len(files), 'bytes': sum(path.stat().st_size for path in files),
            'largest_bytes': max((path.stat().st_size for path in files), default=0)}


def build(root: Path = ROOT, destination: Path = OUTPUT) -> dict:
    root, destination = root.resolve(), destination.resolve()
    # Keep rebuild cleanup confined to its purpose-built output directory.
    if destination != root / 'dist' / 'cloudflare' / 'public':
        raise ValueError('Output must be <project>/dist/cloudflare/public')
    sources = [(safe_source(root, f'app/{name}'), name) for name in sorted(APP_FILES)]
    sources.extend((safe_source(root, source), target) for source, target in LOGIN_FILES.items())
    for name in sorted(ASSET_FILES - {'memory-palace.glb'}):
        path = safe_source(root, f'assets/{name}')
        if path.stat().st_size > MAX_ASSET_BYTES:
            raise ValueError(f'Allowlisted asset exceeds Cloudflare limit: {name}')
        sources.append((path, f'assets/{name}'))
    three = root / 'node_modules' / 'three'
    for required in ('build/three.module.js', 'build/three.core.js', 'examples/jsm/loaders/GLTFLoader.js'):
        safe_source(root, f'node_modules/three/{required}')
    for folder in ('build', 'examples/jsm'):
        for path in sorted((three / folder).rglob('*')):
            if path.is_file() and path.suffix in {'.js', '.mjs'}:
                safe_source(root, path.relative_to(root).as_posix())
                sources.append((path, f'vendor/three/{path.relative_to(three).as_posix()}'))
    sources.append((safe_source(root, 'node_modules/three/LICENSE'), 'vendor/three/LICENSE'))
    source_model = safe_source(root, 'assets/memory-palace.glb')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Validate a complete staging build before replacing the last good build.
    with tempfile.TemporaryDirectory(prefix='cloudflare-build-', dir=destination.parent) as temporary:
        staged = Path(temporary) / 'public'
        staged.mkdir()
        for source, relative in sources:
            target = staged / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.parent == root / 'app' and source.suffix in {'.js', '.html'}:
                target.write_text(cloud_copy(source.read_text(encoding='utf-8'), source.suffix == '.html'), encoding='utf-8')
            else:
                shutil.copyfile(source, target)
        model = repack_glb(source_model, staged / 'assets' / 'memory-palace.gltf')
        manifest_path = staged / 'assets' / 'scene-manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['model'] = '/assets/memory-palace.gltf'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        summary = validate_public_tree(staged)
        if destination.exists():
            shutil.rmtree(destination)
        staged.rename(destination)
    return {'output': str(destination), **summary, 'model': model}


def main() -> None:
    parser = argparse.ArgumentParser(description='Build public Cloudflare assets without personal data')
    parser.parse_args()
    print(json.dumps(build(), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
