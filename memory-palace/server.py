#!/usr/bin/env python3
"""Loopback-only HTTP server for the Memory Palace. Python standard library only."""
import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from ai_butler import AIButler, DEFAULT_CONVERSATION, MAX_CHAT_BODY
from palace_store import PalaceStore, ValidationError, NotFoundError, ROOT
from design_store import DesignStore, catalog as design_catalog

MAX_BODY = 262144

class PalaceHandler(BaseHTTPRequestHandler):
    server_version = 'MemoryPalace/0.1'

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        # Three.js decodes embedded GLB textures by fetching local blob URLs.
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'")
        super().end_headers()

    def json(self, value, code=200, download=False, filename='memory-palace-export.json'):
        data = json.dumps(value, ensure_ascii=False).encode('utf-8', 'backslashreplace')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        if download:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(data)

    def guard(self):
        port = self.server.server_port
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        if self.headers.get('Host') not in hosts:
            self.json({'error': '只允許從本機開啟莊園。'}, 403); return False
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://{host}' for host in hosts}:
            self.json({'error': '其他網站無法讀取莊園記憶。'}, 403); return False
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.json({'error': '禁止跨站存取記憶。'}, 403); return False
        return True

    def body(self, maximum=MAX_BODY):
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            raise ValidationError('請求內容必須是 application/json。')
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise ValidationError('請求長度不正確。')
        if not 0 < length <= maximum:
            raise ValidationError('請求為空或超過大小限制。')
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeError, RecursionError):
            raise ValidationError('JSON 格式不正確。')
        if not isinstance(data, dict):
            raise ValidationError('請提供 JSON 物件。')
        return data

    def safely(self, fn):
        if not self.guard():
            return
        try:
            fn()
        except ValidationError as error:
            self.json({'error': str(error)}, 400)
        except NotFoundError as error:
            self.json({'error': str(error)}, 404)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.log_error('request failed; no private content logged')
            self.json({'error': '莊園暫時無法處理這個請求，請稍後重試。'}, 500)

    def do_GET(self):
        self.safely(self.get)

    def get(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        value = lambda name, default='': query.get(name, [default])[0]
        store = self.server.store
        if url.path == '/api/health':
            return self.json({'ok': True, 'mode': 'local'})
        if url.path == '/api/memories':
            return self.json({'memories': store.list(search=value('search'), room=value('room'), status=value('status', 'active'), due=value('due') == 'true')})
        if url.path == '/api/stats':
            return self.json(store.stats())
        if url.path == '/api/design':
            return self.json({'design': self.server.design.get(), 'catalog': design_catalog()})
        if url.path == '/api/design/export':
            return self.json(self.server.design.export(), download=True, filename='memory-palace-design.json')
        if url.path == '/api/ai/status':
            return self.json(self.server.ai.status())
        if url.path == '/api/chat/history':
            return self.json(self.server.ai.history(value('conversation_id', DEFAULT_CONVERSATION)))
        if url.path == '/api/inbox':
            return self.json(self.server.ai.inbox())
        if url.path.startswith('/api/jobs/') and url.path.count('/') == 3:
            return self.json(self.server.ai.job(url.path.rsplit('/', 1)[1]))
        if url.path == '/api/butler':
            return self.json(store.butler(value('query')))
        if url.path == '/api/export':
            return self.json(store.export(), download=True)
        if url.path.startswith('/api/memories/') and url.path.count('/') == 3:
            return self.json({'memory': store.get(url.path.rsplit('/', 1)[1])})
        if url.path.startswith('/api/'):
            return self.json({'error': '這個 API 路徑不存在。'}, 404)
        path = unquote(url.path)
        if path == '/':
            base, relative = ROOT / 'app', 'index.html'
        elif path.startswith('/assets/'):
            base, relative = ROOT / 'assets', path[8:]
            if Path(relative).suffix not in ('.glb', '.gltf', '.png', '.jpg', '.webp', '.json', '.blend'):
                return self.json({'error': '找不到這個檔案。'}, 404)
        elif path.startswith('/vendor/three/'):
            base, relative = ROOT / 'node_modules' / 'three', path[len('/vendor/three/'):]
            if Path(relative).suffix not in ('.js', '.mjs'):
                return self.json({'error': '找不到這個檔案。'}, 404)
        elif path.startswith('/vendor/'):
            return self.json({'error': '找不到這個檔案。'}, 404)
        else:
            base, relative = ROOT / 'app', path.lstrip('/')
        if '\x00' in relative or '..' in Path(relative).parts:
            return self.json({'error': '找不到這個檔案。'}, 404)
        base = base.resolve()
        file = (base / relative).resolve()
        if not file.is_relative_to(base) or not file.is_file():
            return self.json({'error': '找不到這個檔案。'}, 404)
        data = file.read_bytes()
        mime = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json'}.get(file.suffix, mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        self.safely(self.post)

    def post(self):
        path = urlparse(self.path).path
        if path == '/api/chat':
            return self.json({'job_id': self.server.ai.submit(self.body(MAX_CHAT_BODY))}, 202)
        if path == '/api/memories':
            return self.json({'memory': self.server.store.add(self.body())}, 201)
        if path == '/api/design':
            data = self.body()
            if set(data) != {'design'}:
                raise ValidationError('設計儲存請求只能包含 design 欄位。')
            return self.json({'design': self.server.design.save(data['design'])})
        parts = path.strip('/').split('/')
        if len(parts) == 4 and parts[:2] == ['api', 'jobs'] and parts[3] == 'retry':
            return self.json({'job_id': self.server.ai.retry(parts[2])}, 202)
        if len(parts) == 4 and parts[:2] == ['api', 'memories'] and parts[3] == 'review':
            data = self.body()
            if set(data) != {'rating'}:
                raise ValidationError('回訪請求只能包含 rating 欄位。')
            return self.json({'memory': self.server.store.review(parts[2], data['rating'])})
        self.json({'error': '這個 API 路徑不存在。'}, 404)

    def do_PATCH(self):
        self.safely(self.patch)

    def patch(self):
        parts = urlparse(self.path).path.strip('/').split('/')
        if len(parts) == 3 and parts[:2] == ['api', 'memories']:
            return self.json({'memory': self.server.store.update(parts[2], self.body())})
        self.json({'error': '這個 API 路徑不存在。'}, 404)

    def log_message(self, format, *args):
        # Avoid writing memory searches or other user content into request logs.
        pass

class PalaceServer(ThreadingHTTPServer):
    def server_close(self):
        if hasattr(self, 'ai'):
            self.ai.close()
        super().server_close()


def create_server(port=8765, db=None, infer=None, provider_status=None):
    server = PalaceServer(('127.0.0.1', port), PalaceHandler)
    try:
        server.store = PalaceStore(db)
        server.design = DesignStore(server.store)
        server.ai = AIButler(server.store, infer, provider_status)
        server.ai.start()
    except Exception:
        server.server_close()
        raise
    return server

def main():
    parser = argparse.ArgumentParser(description='進入你的記憶莊園')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--db', help='自訂 SQLite 資料庫路徑')
    args = parser.parse_args()
    server = create_server(args.port, args.db)
    print(f'記憶莊園已開啟：http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
