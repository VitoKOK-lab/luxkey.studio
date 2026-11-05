import http.client
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from palace_store import PalaceStore, ValidationError
from server import create_server

ROOT = Path(__file__).resolve().parents[1]


class TempDatabaseTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.db = self.folder / 'vault.sqlite3'


class VaultTests(TempDatabaseTest):
    def test_persistence_search_and_revision_history(self):
        store = PalaceStore(self.db)
        memory = store.add({'title': '學習札記', 'body': 'SQL 的 100% 與底線 a_b', 'room_id': 'library',
                            'cue': '玻璃燈', 'tags': ['筆記', '筆記']})
        memory_id = memory['id']
        store.add({'title': '其他', 'body': 'SQL aXb', 'room_id': 'garden'})
        reopened = PalaceStore(self.db)
        self.assertEqual(reopened.get(memory_id), memory)
        self.assertEqual(memory['tags'], ['筆記'])
        for query in ('SQL 玻璃燈', '筆記', '100%', 'a_b', '%'):
            self.assertEqual([item['id'] for item in reopened.list(search=query)], [memory_id], query)

        moved = reopened.update(memory_id, {'room_id': 'gallery'})
        self.assertEqual(moved['locus_id'], 'gallery-frame')
        self.assertEqual(reopened.list(room='library'), [])
        history = reopened.export()['revisions']
        revisions = [entry for entry in history if entry['memory_id'] == memory_id]
        self.assertEqual([entry['action'] for entry in revisions], ['created', 'updated'])
        self.assertEqual([entry['snapshot']['room_id'] for entry in revisions], ['library', 'gallery'])

    def test_review_archive_and_restore(self):
        store = PalaceStore(self.db)
        memory = store.add({'title': '待回訪', 'body': '測試內容'})
        memory_id = memory['id']
        self.assertEqual(store.stats()['due'], 1)
        reviewed = store.review(memory_id, 'good')
        self.assertEqual(reviewed['review_count'], 1)
        self.assertEqual(reviewed['interval_days'], 1)
        self.assertGreater(reviewed['next_review'], memory['next_review'])
        self.assertEqual(store.list(due=True), [])

        store.update(memory_id, {'status': 'archived'})
        self.assertEqual(store.stats()['archived'], 1)
        self.assertEqual(store.list(), [])
        self.assertEqual(store.list(status='archived')[0]['id'], memory_id)
        with self.assertRaises(ValidationError):
            store.review(memory_id, 'easy')
        restored = store.update(memory_id, {'status': 'active'})
        self.assertEqual(restored['next_review'], reviewed['next_review'])
        self.assertEqual(store.stats()['active'], 1)
        self.assertEqual([item['action'] for item in store.export()['revisions']],
                         ['created', 'review:good', 'archived', 'restored'])

    def test_validation_preserves_data(self):
        store = PalaceStore(self.db)
        memory = store.add({'title': '原始標題', 'body': '原始內容'})
        for payload in ({'title': ' '}, {'body': None}, {'room_id': []},
                        {'room_id': 'none'}, {'locus_id': '../hall'}, {'locus_id': False},
                        {'room_id': 'hall', 'locus_id': 'library-shelf'},
                        {'tags': '筆記'}, {'tags': [42]}, {'updated_at': 'tomorrow'},
                        {'body': '\ud800'}, {'status': 'deleted'}):
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    store.update(memory['id'], payload)
        self.assertEqual(store.get(memory['id']), memory)
        self.assertEqual(len(store.export()['revisions']), 1)

    def test_legacy_numbered_anchor_resolves_to_scene_locus(self):
        store = PalaceStore(self.db)
        memory = store.add({'title': '舊記憶', 'body': '舊座標', 'room_id': 'quiet-room'})
        with store.connect() as conn:
            conn.execute('UPDATE memories SET locus_id=? WHERE id=?', ('quiet-room-2', memory['id']))
        self.assertEqual(store.get(memory['id'])['locus_id'], 'quiet-bowl')
        self.assertEqual(store.update(memory['id'], {'cue': '香氣'})['locus_id'], 'quiet-bowl')
        moved = store.update(memory['id'], {'room_id': 'hall', 'locus_id': 'hall-emblem'})
        self.assertEqual(moved['locus_id'], 'hall-emblem')

    def test_butler_uses_local_memories(self):
        store = PalaceStore(self.db)
        self.assertEqual(store.butler()['memories'], [])
        memory = store.add({'title': '讀書計畫', 'body': '閱讀一本書'})
        store.add({'title': '讀書 計畫', 'body': '閱讀第二本書'})
        reply = store.butler('讀書')
        self.assertEqual(reply['mode'], 'local')
        self.assertEqual(reply['suggested_room'], 'library')
        self.assertEqual(len(reply['memories']), 2)
        self.assertEqual(len(reply['duplicates']), 1)
        self.assertIn(memory['id'], {item['id'] for item in reply['duplicates'][0]})


class HTTPTests(TempDatabaseTest):
    def setUp(self):
        super().setUp()
        server = create_server(0, self.db)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01})
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(thread.join)
        self.addCleanup(server.shutdown)
        self.port = server.server_port

    def request(self, method, path, payload=None, headers=None):
        headers = dict(headers or {})
        if payload is not None:
            headers['Content-Type'] = 'application/json'
            payload = json.dumps(payload)
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            conn.request(method, path, body=payload, headers=headers)
            response = conn.getresponse()
            body = response.read()
            if response.headers['Content-Type'].startswith('application/json'):
                body = json.loads(body)
            return response.status, body, response.headers
        finally:
            conn.close()

    def test_host_origin_and_cross_site_guards(self):
        path = '/api/memories'
        for headers in ({'Host': f'evil.example:{self.port}'}, {'Origin': 'https://evil.example'},
                        {'Origin': 'null'}, {'Sec-Fetch-Site': 'cross-site'}):
            with self.subTest(headers=headers):
                self.assertEqual(self.request('GET', path, headers=headers)[0], 403)
                self.assertEqual(self.request('POST', path, {'title': '測試', 'body': '測試'}, headers)[0], 403)
        status, body, _ = self.request('GET', path, headers={'Origin': f'http://localhost:{self.port}'})
        self.assertEqual((status, body), (200, {'memories': []}))

    def test_http_api_workflow(self):
        status, body, _ = self.request('POST', '/api/memories', {'title': '記憶', 'body': '內容'})
        self.assertEqual(status, 201)
        path = '/api/memories/' + body['memory']['id']
        self.assertEqual(self.request('PATCH', path, {'room_id': ['library']})[0], 400)
        self.assertEqual(self.request('PATCH', path, {'room_id': 'library'})[0], 200)
        self.assertEqual(self.request('POST', path + '/review', {'rating': 'easy'})[0], 200)
        status, body, headers = self.request('GET', '/api/export')
        self.assertEqual(status, 200)
        self.assertEqual(body['memories'][0]['room_id'], 'library')
        self.assertEqual(len(body['revisions']), 3)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn('attachment', headers['Content-Disposition'])

    def test_static_path_boundary_and_three_route(self):
        (self.folder / 'app').mkdir()
        (self.folder / 'app' / 'index.html').write_text('<!doctype html>', encoding='utf-8')
        (self.folder / 'assets').mkdir()
        three = self.folder / 'node_modules' / 'three'
        three.mkdir(parents=True)
        (three / 'three.module.js').write_text('export {}', encoding='utf-8')
        (three / 'package.json').write_text('{}', encoding='utf-8')
        (self.folder / 'private.js').write_text('private', encoding='utf-8')
        (self.folder / 'private.json').write_text('{}', encoding='utf-8')
        (self.folder / 'app' / 'private.js').symlink_to(self.folder / 'private.js')
        with patch('server.ROOT', self.folder):
            status, _, headers = self.request('GET', '/')
            self.assertEqual(status, 200)
            directives = [entry.split() for entry in headers['Content-Security-Policy'].split(';') if entry.strip()]
            connect_sources = [set(sources) for name, *sources in directives if name == 'connect-src']
            self.assertEqual(connect_sources, [{"'self'", 'blob:'}])
            status, body, headers = self.request('GET', '/vendor/three/three.module.js')
            self.assertEqual((status, body), (200, b'export {}'))
            self.assertEqual(headers['Content-Type'], 'text/javascript')
            for path in ('/vendor/three/package.json', '/vendor/three/%2e%2e/%2e%2e/private.js',
                         '/assets/%2e%2e/private.json', '/%2e%2e/private.js', '/private.js',
                         '/%00private.js'):
                self.assertEqual(self.request('GET', path)[0], 404, path)


class MCPTests(TempDatabaseTest):
    def test_stdio_lifecycle_and_tool_round_trip(self):
        def message(request_id, method, **params):
            request = {'jsonrpc': '2.0', 'method': method, 'params': params}
            if request_id is not None:
                request['id'] = request_id
            return json.dumps(request)

        def call(request_id, name, **arguments):
            return message(request_id, 'tools/call', name=name, arguments=arguments)

        existing = PalaceStore(self.db).add({'title': '既有記憶', 'body': '玻璃燈'})
        messages = [
            '{invalid}',
            message(1, 'tools/list'),
            message(2, 'initialize', protocolVersion='2025-06-18', capabilities={},
                    clientInfo={'name': 'test', 'version': '1'}),
            message(None, 'notifications/initialized'),
            message(3, 'tools/list'),
            call(4, 'memory_add', title='新增記憶', body='桂花香', room_id='garden'),
            call(5, 'memory_search', query='桂花'),
            call(6, 'memory_list_due'),
            call(7, 'memory_review', id=existing['id'], rating='good'),
            call(8, 'memory_archive', id=existing['id']),
            call(9, 'memory_restore', id=existing['id']),
            call(10, 'memory_search', limit=True),
            call(11, 'memory_search', room_id=[]),
        ]
        run = subprocess.run([sys.executable, str(ROOT / 'scripts/mcp_server.py')],
                             input='\n'.join(messages) + '\n', capture_output=True, text=True,
                             env={**os.environ, 'MEMORY_PALACE_DB': str(self.db)}, timeout=10, check=True)
        self.assertEqual(run.stderr, '')
        responses = {response['id']: response for response in map(json.loads, run.stdout.splitlines())}
        self.assertEqual(len(responses), len(messages) - 1)
        self.assertEqual(responses[None]['error']['code'], -32700)
        self.assertEqual(responses[1]['error']['code'], -32002)
        self.assertEqual(responses[2]['result']['protocolVersion'], '2025-06-18')
        tools = {entry['name'] for entry in responses[3]['result']['tools']}
        self.assertEqual(tools, {'memory_add', 'memory_search', 'memory_list_due', 'memory_review',
                                 'memory_archive', 'memory_restore'})

        def result(request_id):
            return json.loads(responses[request_id]['result']['content'][0]['text'])

        created = result(4)['memory']
        self.assertEqual(created['source'], 'MCP')
        self.assertEqual(result(5)['memories'], [created])
        self.assertEqual(len(result(6)['memories']), 2)
        self.assertEqual(result(7)['memory']['review_count'], 1)
        self.assertEqual(result(8)['memory']['status'], 'archived')
        self.assertEqual(result(9)['memory']['status'], 'active')
        self.assertTrue(responses[10]['result']['isError'])
        self.assertTrue(responses[11]['result']['isError'])
        self.assertEqual(PalaceStore(self.db).get(created['id']), created)


if __name__ == '__main__':
    unittest.main()
