import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from design_store import DEFAULT_DESIGN, DesignStore
from palace_store import PalaceStore, ValidationError
from scripts.package_template import package_template
from server import PalaceHandler


class DesignStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)

    def design(self, **changes):
        return {**DEFAULT_DESIGN, **changes}

    def test_round_trip_and_vault_isolation(self):
        first = DesignStore(PalaceStore(self.folder / 'first.sqlite3'))
        second = DesignStore(PalaceStore(self.folder / 'second.sqlite3'))
        self.assertEqual(first.get(), DEFAULT_DESIGN)
        saved = first.save(self.design(
            name='我的湖畔莊園', theme='moon', render_style='scifi', lighting_level=1.35,
            decorations=[{'room_id': 'hall', 'slot': 'left', 'item': 'plush-bear', 'color': '#abc123'}],
        ))
        self.assertEqual(first.get(), {**saved, 'decorations': [{**saved['decorations'][0], 'color': '#ABC123'}]})
        self.assertEqual(first.get()['lighting_level'], 1.35)
        self.assertEqual(second.get(), DEFAULT_DESIGN)

    def test_legacy_stored_and_imported_design_uses_default_appearance(self):
        store = DesignStore(PalaceStore(self.folder / 'legacy.sqlite3'))
        legacy = self.design(name='原有佈置', theme='sunrise')
        del legacy['render_style']
        del legacy['lighting_level']
        with store.store.connect() as conn:
            store._ensure_table(conn)
            conn.execute('INSERT INTO settings(key,value) VALUES (?,?)', (store.KEY, json.dumps(legacy)))
        expected = {**legacy, 'render_style': 'original', 'lighting_level': 1.0}
        self.assertEqual(store.get(), expected)
        self.assertEqual(store.save(legacy), expected)
        self.assertEqual(store.save({**legacy, 'render_style': 'cyberpunk'}),
                         {**expected, 'render_style': 'cyberpunk'})

    def test_lighting_level_limits(self):
        store = DesignStore(PalaceStore(self.folder / 'lighting.sqlite3'))
        for level in (0.7, 1, 1.5):
            with self.subTest(level=level):
                self.assertEqual(store.save(self.design(lighting_level=level))['lighting_level'], level)
        for level in (0.69, 1.51, None, True, '1.0', [], float('nan'), float('inf'), float('-inf')):
            with self.subTest(level=level), self.assertRaises(ValidationError):
                store.save(self.design(lighting_level=level))
        self.assertEqual(store.get()['lighting_level'], 1.5)

    def test_rejects_private_unknown_and_invalid_values(self):
        store = DesignStore(PalaceStore(self.folder / 'vault.sqlite3'))
        for payload in (
            self.design(api_key='secret'),
            self.design(name='https://example.com'),
            self.design(render_style='unrecognized'),
            self.design(render_style=None),
            self.design(render_style=['mono']),
            self.design(decorations='not-an-array'),
            self.design(decorations=[{'room_id': 'hall', 'slot': 'left', 'item': 'plant',
                                      'color': '#123456', 'url': 'https://example.com'}]),
            self.design(decorations=[{'room_id': 'hall', 'slot': 'left', 'item': 'plant', 'color': []}]),
            self.design(decorations=[
                {'room_id': 'hall', 'slot': 'left', 'item': 'plant', 'color': '#123456'},
                {'room_id': 'hall', 'slot': 'left', 'item': 'crystal', 'color': '#654321'},
            ]),
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                store.save(payload)
        self.assertEqual(store.get(), DEFAULT_DESIGN)


class DesignHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        store = PalaceStore(Path(self.temporary.name) / 'vault.sqlite3')
        self.server = SimpleNamespace(store=store, design=DesignStore(store))

    def handler(self, path, body=None):
        handler = object.__new__(PalaceHandler)
        handler.path = path
        handler.server = self.server
        handler.json = Mock()
        handler.body = Mock(return_value=body)
        return handler

    def test_endpoints_return_and_export_cosmetics_only(self):
        get_handler = self.handler('/api/design')
        get_handler.get()
        initial = get_handler.json.call_args.args[0]
        self.assertEqual(initial['design'], DEFAULT_DESIGN)
        self.assertEqual(initial['catalog']['architecture_id'], 'glass-estate-v2')
        self.assertEqual([style['id'] for style in initial['catalog']['render_styles']],
                         ['original', 'scifi', 'mono', 'cyberpunk', 'film', 'cartoon'])
        design = {**DEFAULT_DESIGN, 'theme': 'sunrise', 'render_style': 'cartoon', 'lighting_level': 1.25}
        post_handler = self.handler('/api/design', {'design': design})
        post_handler.post()
        self.assertEqual(post_handler.json.call_args.args[0], {'design': design})
        self.assertEqual(post_handler.json.call_args.kwargs.get('code', 200), 200)
        get_handler.get()
        self.assertEqual(get_handler.json.call_args.args[0]['design'], design)
        bad = self.handler('/api/design', {'design': design, 'account': {'id': 'x'}})
        with self.assertRaises(ValidationError):
            bad.post()
        self.server.store.add({'title': '私人記憶', 'body': '不可匯出'})
        export_handler = self.handler('/api/design/export')
        export_handler.path = '/api/design/export'
        export_handler.get()
        exported = export_handler.json.call_args.args[0]
        self.assertEqual(exported, design)
        self.assertEqual(export_handler.json.call_args.kwargs,
                         {'download': True, 'filename': 'memory-palace-design.json'})


class TemplatePackageTests(unittest.TestCase):
    def test_allowlist_excludes_private_and_runtime_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'app').mkdir()
            (root / 'assets').mkdir()
            (root / 'config').mkdir()
            (root / 'scripts').mkdir()
            (root / 'data').mkdir()
            (root / 'runtime').mkdir()
            (root / 'logs').mkdir()
            (root / 'node_modules' / 'three' / 'build').mkdir(parents=True)
            (root / 'node_modules' / 'three' / 'examples' / 'jsm' / 'controls').mkdir(parents=True)
            for relative in (
                'server.py', 'app/index.html', 'assets/scene-manifest.json',
                'scripts/launch.py', 'scripts/package_template.py',
                'node_modules/three/build/three.module.js',
                'node_modules/three/examples/jsm/controls/OrbitControls.js',
                'node_modules/three/examples/jsm/libs/unneeded.png',
                'config/ai.env.example', 'config/ai.env', '.env', 'data/memories.sqlite3',
                'runtime/palace-ocr', 'logs/server.log', '.git/config',
            ):
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('fixture', encoding='utf-8')
            outside = root.parent / 'outside-private.py'
            outside.write_text('private', encoding='utf-8')
            self.addCleanup(lambda: outside.unlink(missing_ok=True))
            (root / 'scripts' / 'escape.py').symlink_to(outside)
            target_zip = root / 'out.zip'
            package_template(target_zip, root)
            with zipfile.ZipFile(target_zip) as archive:
                names = set(archive.namelist())
            self.assertEqual(names, {
                'server.py', 'app/index.html', 'assets/scene-manifest.json',
                'scripts/launch.py', 'scripts/package_template.py',
                'node_modules/three/build/three.module.js',
                'node_modules/three/examples/jsm/controls/OrbitControls.js',
                'config/ai.env.example',
            })

    def test_shares_generated_visual_assets_by_name(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expected = {
                'assets/first-person-preview.jpg',
                'assets/accessories/accessories.blend', 'assets/accessories/accessory-preview.png',
                'assets/accessories/crystal.glb', 'assets/accessories/moon-lamp.glb',
                'assets/accessories/plant.glb', 'assets/accessories/plush-bear.glb',
                'assets/textures/calacatta-color.png', 'assets/textures/oak-normal.png',
                'assets/textures/walnut-roughness.png', 'assets/renders/index.json',
                'assets/renders/exterior.png', 'assets/renders/reflection-suite.png',
                'assets/renders/skybridge.png',
                'assets/stewards/robot-dog.glb', 'assets/stewards/robot-cat.glb',
                'assets/stewards/robot-owl.glb', 'assets/stewards/robot-animals.blend',
                'assets/stewards/robot-animals-preview.png',
                'assets/quality/hall-quality.blend', 'assets/quality/hall-quality.glb',
                'assets/quality/robot-noa.blend', 'assets/quality/robot-noa.glb',
                'assets/quality/hall-live.jpg', 'assets/quality/noa-live.jpg',
                'assets/renders/quality-hall.png', 'assets/renders/quality-noa.png',
            }
            excluded = {
                'assets/accessories/accessories.blend1', 'assets/accessories/scratch.glb',
                'assets/textures/private.png', 'assets/renders/draft.png',
                'assets/stewards/private.png', 'assets/stewards/robot-animals.blend1',
                'assets/quality/private-screenshot.png', 'assets/quality/hall-quality.blend1',
                'assets/renders/skybridge.png.tmp', 'assets/renders/runtime/index.json',
                'data/textures/boucle-color.png',
            }
            for relative in expected | excluded:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(relative, encoding='utf-8')
            (root / 'assets' / 'renders' / 'quiet-room.png').symlink_to(
                root / 'data' / 'textures' / 'boucle-color.png',
            )
            target_zip = package_template(root / 'out.zip', root)
            with zipfile.ZipFile(target_zip) as archive:
                self.assertEqual(set(archive.namelist()), expected)

    def test_asset_folder_cannot_alias_private_tree(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'data').mkdir()
            (root / 'data' / 'hall.png').write_bytes(b'private screenshot')
            (root / 'assets').mkdir()
            (root / 'assets' / 'renders').symlink_to(root / 'data', target_is_directory=True)
            target_zip = package_template(root / 'out.zip', root)
            with zipfile.ZipFile(target_zip) as archive:
                self.assertEqual(archive.namelist(), [])
