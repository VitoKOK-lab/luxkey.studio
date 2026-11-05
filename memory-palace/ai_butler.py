"""Persist user-initiated conversations and ground AI extractions in their sources."""
from __future__ import annotations

import base64
import binascii
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import threading
import unicodedata
import uuid

from palace_store import CATALOG, LOCI, NotFoundError, ValidationError, now_iso, text_field, validate

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_CHAT_BODY = 12 * 1024 * 1024
DEFAULT_CONVERSATION = 'palace'
IDENTIFIER = re.compile(r'[A-Za-z0-9_-]{1,100}')
IMAGE_URL = re.compile(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)')
STEWARD_IDS = {'hall', 'library', 'gallery', 'garden', 'observatory', 'quiet-room'}
COMMON_TERMS = {'the', 'that', 'what', 'please', 'tell', 'find', 'show', 'know',
                '請問', '請幫', '幫我', '我的', '一下', '有沒', '有沒有', '關於', '想知', '知道', '是什', '什麼'}


class AwaitingAPI(RuntimeError):
    pass


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def raw_text(value, label, maximum):
    text_field(value, label, maximum)
    if len(value) > maximum:
        raise ValidationError(f'{label}最多 {maximum} 個字。')
    return value


def checked_image(value):
    if not isinstance(value, str) or len(value) > MAX_IMAGE_BYTES * 4 // 3 + 48:
        raise ValidationError('圖片最多 8 MiB。')
    match = IMAGE_URL.fullmatch(value)
    if not match:
        raise ValidationError('請附上 PNG、JPEG 或 WebP 圖片。')
    try:
        image = base64.b64decode(match[2], validate=True)
    except binascii.Error as error:
        raise ValidationError('圖片編碼不正確。') from error
    if len(image) > MAX_IMAGE_BYTES:
        raise ValidationError('圖片最多 8 MiB。')
    image_type = match[1]
    valid = (image_type == 'png' and image.startswith(b'\x89PNG\r\n\x1a\n')
             or image_type == 'jpeg' and image.startswith(b'\xff\xd8\xff')
             or image_type == 'webp' and image[:4] == b'RIFF' and image[8:12] == b'WEBP')
    if not valid:
        raise ValidationError('圖片內容與標示的格式不符。')
    return value


def checked_request(payload):
    request_id = payload.get('request_id')
    conversation_id = payload.get('conversation_id') or DEFAULT_CONVERSATION
    for value, label in ((request_id, '請求識別碼'), (conversation_id, '對話識別碼')):
        if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
            raise ValidationError(f'{label}格式不正確。')
    message = raw_text(payload.get('message', ''), '訊息', 100000)
    capture = payload.get('capture', {})
    if not isinstance(capture, dict) or capture.keys() - {'text', 'source', 'image_data_url'}:
        raise ValidationError('擷取內容格式不正確。')
    capture = dict(capture)
    if 'text' in capture:
        capture['text'] = raw_text(capture['text'], '擷取文字', 100000)
    if 'source' in capture:
        capture['source'] = text_field(capture['source'], '擷取來源', 512)
    if 'image_data_url' in capture:
        capture['image_data_url'] = checked_image(capture['image_data_url'])
    if not (message.strip() or capture.get('text', '').strip() or capture.get('image_data_url')):
        raise ValidationError('請輸入訊息、貼上文字或附上圖片。')
    data = {'message': message, 'capture': capture}
    if 'placement' in payload:
        placement = payload['placement']
        if not isinstance(placement, dict) or placement.keys() != {'room_id', 'locus_id'}:
            raise ValidationError('指定的錨點格式不正確。')
        room, locus = placement['room_id'], placement['locus_id']
        if not isinstance(room, str) or room not in LOCI or locus not in LOCI[room]:
            raise ValidationError('指定的錨點不存在。')
        data['placement'] = {'room_id': room, 'locus_id': locus}
    return request_id, conversation_id, data


def source_key(quote):
    normalized = ' '.join(unicodedata.normalize('NFC', quote).split())
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def relevant_terms(text):
    lower = text.casefold()
    terms = set(re.findall(r'[a-z0-9_]{2,}', lower))
    for phrase in re.findall(r'[\u3400-\u9fff]+', lower):
        terms.update(phrase[index:index + 2] for index in range(len(phrase) - 1))
    return terms - COMMON_TERMS


class AIButler:
    def __init__(self, store, infer=None, status=None):
        self.store = store
        self.infer = infer
        self.provider_status = status
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.worker = None
        with store.connect() as conn:
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS ai_jobs (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL UNIQUE,
                    request_id TEXT NOT NULL UNIQUE,
                    conversation_id TEXT NOT NULL,
                    input TEXT NOT NULL,
                    status TEXT NOT NULL,
                    result TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ai_conversation ON ai_jobs(conversation_id, sequence);
                CREATE INDEX IF NOT EXISTS ai_status ON ai_jobs(status, sequence);
                CREATE TABLE IF NOT EXISTS ai_memory_sources (
                    fingerprint TEXT PRIMARY KEY,
                    memory_id TEXT NOT NULL REFERENCES memories(id)
                );
                CREATE TABLE IF NOT EXISTS ai_inbox (
                    id TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL UNIQUE,
                    job_id TEXT NOT NULL REFERENCES ai_jobs(id),
                    candidate TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
            ''')

    def start(self):
        if self.worker is None:
            self.worker = threading.Thread(target=self._work, name='memory-palace-ai', daemon=True)
            self.worker.start()

    def close(self):
        self.stop.set()
        self.wake.set()

    def status(self):
        if self.provider_status is not None:
            return self.provider_status()
        try:
            import ai_provider
        except ImportError:
            return {'configured': False, 'available': False, 'provider': 'unconfigured', 'model': None,
                    'message': '等待連接你的 AI Agent', 'connection_verified': False,
                    'capabilities': {'text': True, 'images': False}}
        return ai_provider.status()

    def _infer(self, payload):
        if self.infer is not None:
            return self.infer(payload)
        try:
            import ai_provider
        except ImportError as error:
            raise AwaitingAPI from error
        try:
            return ai_provider.infer(payload)
        except ai_provider.ProviderNotConfigured as error:
            raise AwaitingAPI from error
        except ai_provider.ProviderError as error:
            raise ValidationError(str(error)) from error

    def submit(self, payload):
        request_id, conversation_id, job_input = checked_request(payload)
        encoded = encode(job_input)
        now = now_iso()
        with self.store.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            previous = conn.execute('SELECT id, conversation_id, input FROM ai_jobs WHERE request_id=?',
                                    (request_id,)).fetchone()
            if previous:
                if previous['conversation_id'] != conversation_id or previous['input'] != encoded:
                    raise ValidationError('這個請求識別碼已用於不同的訊息。')
                return previous['id']
            job_id = uuid.uuid4().hex
            conn.execute('''
                INSERT INTO ai_jobs(id,request_id,conversation_id,input,status,created_at,updated_at)
                VALUES (?,?,?,?,'queued',?,?)
            ''', (job_id, request_id, conversation_id, encoded, now, now))
        self.wake.set()
        return job_id

    def retry(self, job_id):
        with self.store.connect() as conn:
            changed = conn.execute('''
                UPDATE ai_jobs SET status='queued',error=NULL,updated_at=? WHERE id=? AND status IN ('failed','awaiting_api')
            ''', (now_iso(), job_id)).rowcount
            if not changed:
                self._job_row(conn, job_id)
                raise ValidationError('只有等待 AI 連接或處理失敗的訊息可以重試。')
        self.wake.set()
        return job_id

    @staticmethod
    def _job_row(conn, job_id):
        row = conn.execute('SELECT id, conversation_id, status, result, error FROM ai_jobs WHERE id=?', (job_id,)).fetchone()
        if row is None:
            raise NotFoundError('找不到這筆對話工作。')
        return row

    def job(self, job_id):
        with self.store.connect() as conn:
            row = self._job_row(conn, job_id)
        data = {'job_id': row['id'], 'conversation_id': row['conversation_id'], 'status': row['status']}
        if row['result']:
            data['result'] = json.loads(row['result'])
        if row['error']:
            data['error'] = row['error']
        return data

    def history(self, conversation_id=DEFAULT_CONVERSATION):
        with self.store.connect() as conn:
            rows = conn.execute('''
                SELECT id, status, error, result, created_at, updated_at,
                       json_remove(input,'$.capture.image_data_url') AS safe_input,
                       json_type(input,'$.capture.image_data_url') IS NOT NULL AS has_image
                FROM ai_jobs WHERE conversation_id=? ORDER BY sequence DESC LIMIT 60
            ''', (conversation_id,)).fetchall()
        messages = []
        for row in reversed(rows):
            data = json.loads(row['safe_input'])
            capture = data['capture']
            if row['has_image']:
                capture['has_image'] = True
            messages.append({'role': 'user', 'content': data['message'], 'capture': capture,
                             'job_id': row['id'], 'status': row['status'], 'created_at': row['created_at']})
            if 'placement' in data:
                messages[-1]['placement'] = data['placement']
            if row['result']:
                result = json.loads(row['result'])
                messages.append({'role': 'assistant', 'content': result['reply'], 'result': result,
                                 'job_id': row['id'], 'created_at': row['updated_at']})
            if row['error']:
                messages[-1]['error'] = row['error']
        return {'conversation_id': conversation_id, 'messages': messages}

    def inbox(self):
        with self.store.connect() as conn:
            rows = conn.execute('SELECT candidate FROM ai_inbox ORDER BY created_at DESC, rowid DESC')
            pending = [json.loads(row['candidate']) for row in rows]
            rows = conn.execute('''
                SELECT id, created_at, status, error,
                       json_remove(input,'$.capture.image_data_url') AS safe_input,
                       json_type(input,'$.capture.image_data_url') IS NOT NULL AS has_image
                FROM ai_jobs WHERE status IN ('awaiting_api','failed') ORDER BY sequence DESC LIMIT 100
            ''').fetchall()
        awaiting_api = []
        failed = []
        for row in rows:
            data = json.loads(row['safe_input'])
            if row['has_image']:
                data['capture']['has_image'] = True
            entry = {**data, 'id': row['id'], 'job_id': row['id'], 'created_at': row['created_at'],
                     'reason': row['error'] or '原始內容已保留，等待連接 AI Agent。'}
            (awaiting_api if row['status'] == 'awaiting_api' else failed).append(entry)
        return {'pending': pending, 'awaiting_api': awaiting_api, 'failed': failed}

    def _claim(self):
        with self.store.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            conn.execute("UPDATE ai_jobs SET status='queued' WHERE status='running'")
            job = conn.execute("SELECT * FROM ai_jobs WHERE status='queued' ORDER BY sequence LIMIT 1").fetchone()
            if job:
                conn.execute("UPDATE ai_jobs SET status='running',updated_at=? WHERE id=?",
                             (now_iso(), job['id']))
            return job

    def _work(self):
        path = str(self.store.path) + '.ai.lock'
        with os.fdopen(os.open(path, os.O_CREAT | os.O_RDWR, 0o600), 'rb') as lock:
            while not self.stop.is_set():
                self.wake.clear()
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    self.wake.wait(2)
                    continue
                job = None
                try:
                    job = self._claim()
                    if job:
                        self._process(job)
                except sqlite3.Error:
                    job = None
                finally:
                    fcntl.flock(lock, fcntl.LOCK_UN)
                if not job:
                    self.wake.wait(2)

    def _context(self, job, data):
        with self.store.connect() as conn:
            turns = conn.execute('''
                SELECT id, json_extract(input,'$.message') AS message,
                       json_extract(input,'$.capture.text') AS capture,
                       json_extract(input,'$.capture.source') AS source,
                       json_extract(result,'$.reply') AS reply
                FROM ai_jobs WHERE conversation_id=? AND sequence<? AND status='completed'
                ORDER BY sequence DESC LIMIT 10
            ''', (job['conversation_id'], job['sequence'])).fetchall()
            active = self.store.active_loci(conn)
            memories = conn.execute('''
                SELECT id, title, substr(body,1,1200) AS body, room_id, locus_id, cue
                FROM memories WHERE status='active' ORDER BY updated_at DESC LIMIT 500
            ''').fetchall()
        messages = []
        sources = []
        for turn in reversed(turns):
            user_text = turn['message']
            captured = turn['capture']
            if captured:
                user_text += '\n[擷取文字]\n' + captured[-3500:]
            messages.append({'role': 'user', 'content': user_text[-4000:]})
            messages.append({'role': 'assistant', 'content': (turn['reply'] or '')[:2000]})
            sources.extend(((turn['id'], 'message', turn['message'], 'AI 對話'),
                            (turn['id'], 'capture_text', captured, turn['source'] or '貼上文字')))
        terms = relevant_terms(data['message'][-1500:] + ' ' + (data['capture'].get('text') or '')[:1000])
        scored = [(len(terms & relevant_terms(item['title'] + ' ' + item['body'])), item)
                  for item in memories]
        ranked = sorted((item for item in scored if item[0]), key=lambda item: -item[0])
        relevant = [dict(row) for _, row in ranked[:18]]
        catalog = [
            {**room, 'loci': [{**locus, 'available': (room['id'], locus['id']) not in active}
                             for locus in room['loci']]}
            for room in CATALOG
        ]
        payload = {**data, 'messages': messages, 'relevant_memories': relevant, 'catalog': catalog}
        return payload, sources

    def _process(self, job):
        try:
            data = json.loads(job['input'])
            payload, recent_sources = self._context(job, data)
            output = self._infer(payload)
            if not isinstance(output, dict):
                raise ValidationError('AI 回傳的內容格式不正確。')
            self._complete(job, data, output, recent_sources, payload['relevant_memories'])
        except AwaitingAPI:
            with self.store.connect() as conn:
                conn.execute("UPDATE ai_jobs SET status='awaiting_api',updated_at=? WHERE id=?",
                             (now_iso(), job['id']))
        except Exception as error:
            detail = str(error) if isinstance(error, ValidationError) else 'AI 處理未完成。原始內容仍在莊園，可重試。'
            with self.store.connect() as conn:
                conn.execute("UPDATE ai_jobs SET status='failed',error=?,updated_at=? WHERE id=?",
                             (detail, now_iso(), job['id']))

    def _complete(self, job, data, output, recent_sources, relevant):
        reply = text_field(output.get('reply', ''), 'AI 回覆', 16000, True)
        intent = output.get('intent')
        if intent not in ('remember', 'recall', 'chat'):
            raise ValidationError('AI 回傳的操作類型不正確。')
        steward = output.get('steward_id')
        if not isinstance(steward, str) or steward not in STEWARD_IDS:
            steward = 'hall'
        candidates = output.get('memories', [])
        recall_ids = output.get('recall_ids', [])
        if not isinstance(candidates, list) or len(candidates) > 30 or not isinstance(recall_ids, list):
            raise ValidationError('AI 回傳的記憶清單格式不正確。')
        clarification = text_field(output.get('clarification') or '', '釐清內容', 4000)
        capture = data['capture']
        image_text = ''
        if capture.get('image_data_url'):
            image_text = raw_text(output.get('_verified_image_text', ''), '圖片辨識文字', 100000)
        sources = [(job['id'], 'capture_text', capture.get('text'), capture.get('source') or '貼上文字'),
                   (job['id'], 'message', data['message'], 'AI 對話'),
                   (job['id'], 'image_text', image_text, capture.get('source') or '圖片文字'),
                   *reversed(recent_sources)]
        relevant_ids = {memory['id'] for memory in relevant}
        result = {'reply': reply, 'intent': intent, 'memories': [], 'retrieved': [], 'pending': [],
                  'duplicates': [], 'steward_id': steward, 'conversation_id': job['conversation_id'],
                  'job_id': job['id'], 'clarification': clarification}
        if image_text:
            result['observed_image_text'] = image_text
        rejected = 0
        with self.store.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            active = self.store.active_loci(conn)
            if intent == 'remember' and not clarification:
                preferred = data.get('placement')
                for candidate in candidates:
                    try:
                        outcome = self._place(conn, job, candidate, sources, active, preferred)
                    except ValidationError:
                        rejected += 1
                    else:
                        key, value = outcome
                        if all(item['id'] != value['id'] for item in result[key]):
                            result[key].append(value)
                        if key != 'duplicates':
                            preferred = None
            for memory_id in dict.fromkeys(value for value in recall_ids[:30] if isinstance(value, str)):
                if memory_id in relevant_ids:
                    memory = self.store._get(conn, memory_id)
                    if memory['status'] == 'active':
                        result['retrieved'].append(memory)
            if clarification:
                result['reply'] = clarification
            elif rejected:
                result['reply'] += f'\n有 {rejected} 段缺少可核對的原文或安放資料，已保留原始內容供你補充。'
            if result['pending']:
                result['reply'] += f'\n有 {len(result["pending"])} 段已保留在待安放區。'
            if result['duplicates']:
                result['reply'] += f'\n有 {len(result["duplicates"])} 段原文已收錄，沿用既有記憶。'
            conn.execute("UPDATE ai_jobs SET status='completed',result=?,error=NULL,updated_at=? WHERE id=?",
                         (encode(result), now_iso(), job['id']))

    def _place(self, conn, job, candidate, sources, active, preferred):
        if not isinstance(candidate, dict):
            raise ValidationError('擷取的記憶格式不正確。')
        quote = raw_text(candidate.get('source_quote', ''), '來源原文', 20000)
        source = next((item for item in sources if quote.strip() and item[2] and quote in item[2]), None)
        if not source:
            raise ValidationError('找不到可核對的來源原文。')
        fingerprint = source_key(quote)
        existing = conn.execute('SELECT memory_id FROM ai_memory_sources WHERE fingerprint=?',
                                (fingerprint,)).fetchone()
        if existing:
            return 'duplicates', self.store._get(conn, existing['memory_id'])
        room = preferred['room_id'] if preferred else candidate.get('room_id')
        if not isinstance(room, str) or room not in LOCI:
            raise ValidationError('擷取的記憶缺少有效房間。')
        title = text_field(candidate.get('title', ''), '記憶標題', 160, True)
        mnemonic = text_field(candidate.get('mnemonic', ''), '回想畫面', 2000, True)
        summary = text_field(candidate.get('summary', ''), '重點摘要', 1200)
        cue = text_field(candidate.get('cue', ''), '聯想線索', 1000, True)
        provenance = {'job_id': job['id'], 'source_job_id': source[0], 'kind': source[1], 'source': source[3]}
        body = quote
        model_body = text_field(candidate.get('body', ''), '擷取內容', 20000)
        if model_body and model_body in quote:
            body = model_body
        proposed = candidate.get('locus_id')
        if preferred:
            placement = preferred['locus_id']
            if (candidate.get('room_id'), proposed) != (room, placement) and '{locus}' not in mnemonic:
                mnemonic = f'在{{locus}}前，想像這個畫面。{mnemonic}'
            pending_reason = '你指定的錨點已有記憶。' if (room, placement) in active else None
        else:
            placement = next((locus for locus in LOCI[room] if (room, locus) not in active), None)
            pending_reason = None
            if not placement:
                pending_reason = '房間的回想路線已滿。'
            elif proposed and proposed != placement and '{locus}' not in mnemonic:
                pending_reason = '預定錨點已變動，回想畫面仍待重新安放。'
        metadata = {'source_quote': quote, 'provenance': provenance, 'summary': summary, 'mnemonic': mnemonic}
        payload = validate({'title': title, 'body': body, 'cue': cue, 'room_id': room,
                            'locus_id': placement if preferred else '',
                            'tags': candidate.get('tags', []), 'source': source[3]})
        if pending_reason:
            previous = conn.execute('SELECT candidate FROM ai_inbox WHERE fingerprint=?', (fingerprint,)).fetchone()
            if previous:
                return 'pending', json.loads(previous['candidate'])
            pending = {**payload, **metadata, 'id': uuid.uuid4().hex, 'job_id': job['id'], 'reason': pending_reason}
            conn.execute('INSERT INTO ai_inbox VALUES (?,?,?,?,?)',
                         (pending['id'], fingerprint, job['id'], encode(pending), now_iso()))
            return 'pending', pending
        locus_label = next(locus['label'] for entry in CATALOG if entry['id'] == room
                           for locus in entry['loci'] if locus['id'] == placement)
        metadata['mnemonic'] = mnemonic.replace('{locus}', locus_label)
        payload['locus_id'] = placement
        memory = self.store._add(conn, payload, metadata)
        conn.execute('INSERT INTO ai_memory_sources VALUES (?,?)', (fingerprint, memory['id']))
        conn.execute('DELETE FROM ai_inbox WHERE fingerprint=?', (fingerprint,))
        active.add((room, placement))
        return 'memories', memory
