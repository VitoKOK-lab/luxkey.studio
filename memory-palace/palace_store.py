"""Durable, local memory vault shared by the web app, CLI and MCP bridge."""
from __future__ import annotations
import json
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / 'data' / 'memories.sqlite3'
ROOMS = {
    'hall': '迎賓大廳', 'library': '知識書房', 'gallery': '人生長廊',
    'garden': '四季花園', 'observatory': '星光閣', 'quiet-room': '靜心室',
}
LOCI = {
    'hall': ('hall-ledger', 'hall-lantern', 'hall-emblem'),
    'library': ('library-book', 'library-shelf', 'library-chair'),
    'gallery': ('gallery-frame', 'gallery-bench', 'gallery-balcony'),
    'garden': ('garden-fountain', 'garden-bench', 'garden-rose'),
    'observatory': ('observatory-globe', 'observatory-telescope', 'observatory-desk'),
    'quiet-room': ('quiet-cushion', 'quiet-bowl', 'quiet-window'),
}
def scene_catalog():
    try:
        manifest = json.loads((ROOT / 'assets' / 'scene-manifest.json').read_text(encoding='utf-8'))
        catalog = []
        for room in manifest['rooms']:
            loci = [{'id': locus['id'], 'label': locus.get('label', locus.get('name', locus['id'])),
                     'order': index}
                    for index, locus in enumerate(room['loci'], start=1)]
            catalog.append({'id': room['id'], 'name': room['name'],
                            'district_id': room.get('district_id', room.get('districtId', '')),
                            'loci': loci})
        if not catalog or any(not room['loci'] for room in catalog):
            raise ValueError('Empty catalog')
        return catalog
    except (OSError, ValueError, KeyError, TypeError):
        return [
            {'id': room, 'name': name, 'district_id': '',
             'loci': [{'id': locus, 'label': locus, 'order': index}
                      for index, locus in enumerate(LOCI[room], start=1)]}
            for room, name in ROOMS.items()
        ]


CATALOG = scene_catalog()
ROOMS = {room['id']: room['name'] for room in CATALOG}
LOCI = {room['id']: tuple(locus['id'] for locus in room['loci']) for room in CATALOG}
MUTABLE = {'title', 'body', 'room_id', 'locus_id', 'cue', 'tags', 'source', 'status'}

class ValidationError(ValueError):
    pass

class NotFoundError(LookupError):
    pass

def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def text_field(value, name, maximum, required=False):
    if not isinstance(value, str):
        raise ValidationError(f'{name}必須是文字。')
    value = value.strip()
    try:
        value.encode('utf-8')
    except UnicodeEncodeError as error:
        raise ValidationError(f'{name}包含無效字元。') from error
    if required and not value:
        raise ValidationError(f'請填寫{name}。')
    if len(value) > maximum:
        raise ValidationError(f'{name}最多 {maximum} 個字。')
    return value

def validate(payload, existing=None):
    if not isinstance(payload, dict):
        raise ValidationError('請提供 JSON 物件。')
    unknown = set(payload) - MUTABLE
    if unknown:
        raise ValidationError('包含不支援的欄位：' + ', '.join(sorted(unknown)))
    data = dict(existing or {})
    data.update(payload)
    data['title'] = text_field(data.get('title', ''), '記憶標題', 160, True)
    data['body'] = text_field(data.get('body', ''), '記憶內容', 20000, True)
    data['room_id'] = data.get('room_id', 'hall')
    if not isinstance(data['room_id'], str) or data['room_id'] not in ROOMS:
        raise ValidationError('這個房間不存在。')
    room_loci = LOCI[data['room_id']]
    room_changed = existing and existing['room_id'] != data['room_id']
    if room_changed and 'locus_id' not in payload:
        data['locus_id'] = room_loci[0]
    if data.get('locus_id') in (None, ''):
        data['locus_id'] = room_loci[0]
    # Existing custom anchors can still be edited until the memory is moved.
    placing = existing is None or room_changed or 'locus_id' in payload
    if placing and data['locus_id'] not in room_loci:
        raise ValidationError('請選擇這個房間裡的記憶錨點。')
    data['cue'] = text_field(data.get('cue', ''), '聯想線索', 1000)
    data['source'] = text_field(data.get('source', '手動記錄'), '來源', 512)
    tags = data.get('tags', [])
    if not isinstance(tags, list) or len(tags) > 20:
        raise ValidationError('標籤需要是陣列，最多 20 個。')
    data['tags'] = list(dict.fromkeys(text_field(t, '標籤', 40, True) for t in tags))
    if data.get('status', 'active') not in ('active', 'archived'):
        raise ValidationError('狀態必須是 active 或 archived。')
    data['status'] = data.get('status', 'active')
    return data

class PalaceStore:
    def __init__(self, path=None):
        self.path = Path(path or os.environ.get('MEMORY_PALACE_DB', DEFAULT_DB)).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.parent == ROOT / 'data':
            self.path.parent.chmod(0o700)
        with self.connect() as conn:
            conn.execute('PRAGMA journal_mode=WAL')
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
                    room_id TEXT NOT NULL, locus_id TEXT NOT NULL, cue TEXT NOT NULL,
                    tags TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL, next_review TEXT NOT NULL,
                    review_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active', interval_days INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS revisions (
                    revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    memory_id TEXT NOT NULL REFERENCES memories(id),
                    action TEXT NOT NULL, recorded_at TEXT NOT NULL, snapshot TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS memory_room ON memories(room_id, status);
                CREATE INDEX IF NOT EXISTS memory_review ON memories(status, next_review);
            ''')
            conn.execute('BEGIN IMMEDIATE')
            columns = {column['name'] for column in conn.execute('PRAGMA table_info(memories)')}
            if 'ai_metadata' not in columns:
                conn.execute('ALTER TABLE memories ADD COLUMN ai_metadata TEXT')
        self.path.chmod(0o600)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, timeout=10)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute('PRAGMA foreign_keys=ON')
            with conn:
                yield conn
        finally:
            conn.close()

    @staticmethod
    def unpack(row):
        if row is None:
            raise NotFoundError('找不到這段記憶。')
        result = dict(row)
        result['tags'] = json.loads(result['tags'])
        metadata = result.pop('ai_metadata', None)
        if metadata:
            result.update(json.loads(metadata))
        room = result['room_id']
        for index, locus in enumerate(LOCI.get(room, ()), start=1):
            if result['locus_id'] == f'{room}-{index}':
                result['locus_id'] = locus
                break
        return result

    def _get(self, conn, memory_id):
        return self.unpack(conn.execute('SELECT * FROM memories WHERE id=?', (memory_id,)).fetchone())

    def get(self, memory_id):
        with self.connect() as conn:
            return self._get(conn, memory_id)

    @staticmethod
    def _record(conn, memory, action):
        conn.execute('INSERT INTO revisions(memory_id,action,recorded_at,snapshot) VALUES (?,?,?,?)',
                     (memory['id'], action, now_iso(), json.dumps(memory, ensure_ascii=False)))

    def _add(self, conn, payload, metadata=None):
        data = validate(payload)
        instant = now_iso()
        data.update(id=uuid.uuid4().hex, created_at=instant, updated_at=instant,
                    next_review=instant, review_count=0, interval_days=0)
        fields = list(data)
        values = [json.dumps(data[key], ensure_ascii=False) if key == 'tags' else data[key] for key in fields]
        if metadata:
            fields.append('ai_metadata')
            values.append(json.dumps(metadata, ensure_ascii=False))
            data.update(metadata)
        conn.execute(f'INSERT INTO memories ({",".join(fields)}) VALUES ({",".join("?" for _ in fields)})', values)
        self._record(conn, data, 'created')
        return data

    def add(self, payload):
        with self.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            return self._add(conn, payload)

    def active_loci(self, conn):
        slots = set()
        for row in conn.execute("SELECT room_id, locus_id FROM memories WHERE status='active'"):
            room, locus = row['room_id'], row['locus_id']
            for index, candidate in enumerate(LOCI.get(room, ()), start=1):
                if locus == f'{room}-{index}':
                    locus = candidate
                    break
            slots.add((room, locus))
        return slots

    def update(self, memory_id, payload):
        with self.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            previous = self._get(conn, memory_id)
            data = validate(payload, previous)
            was_active = previous['status'] == 'active'
            changed_slot = (data['room_id'], data['locus_id']) != (previous['room_id'], previous['locus_id'])
            if data.get('provenance') and data['status'] == 'active' and (changed_slot or not was_active):
                if (data['room_id'], data['locus_id']) in self.active_loci(conn):
                    raise ValidationError('這個錨點已有回想記憶。請選擇空位再還原。')
            data['updated_at'] = now_iso()
            fields = sorted(MUTABLE | {'updated_at'})
            values = [json.dumps(data[k], ensure_ascii=False) if k == 'tags' else data[k] for k in fields]
            conn.execute(f'UPDATE memories SET {",".join(k+"=?" for k in fields)} WHERE id=?', values + [memory_id])
            action = 'updated'
            if previous['status'] != data['status']:
                action = 'archived' if data['status'] == 'archived' else 'restored'
            self._record(conn, data, action)
        return data

    def list(self, search='', room='', status='active', due=False, limit=None):
        if status not in ('active', 'archived', 'all'):
            raise ValidationError('狀態篩選不正確。')
        if not isinstance(room, str) or (room and room not in ROOMS):
            raise ValidationError('這個房間不存在。')
        search = text_field(search, '搜尋文字', 500)
        clauses, args = [], []
        if status != 'all':
            clauses.append('status=?'); args.append(status)
        if room:
            clauses.append('room_id=?'); args.append(room)
        if due:
            clauses.append('next_review<=?'); args.append(now_iso())
        for term in search.split():
            term = term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            clauses.append("(title || ' ' || body || ' ' || cue || ' ' || tags || ' ' || source) LIKE ? ESCAPE '\\'")
            args.append('%' + term + '%')
        sql = 'SELECT * FROM memories' + (' WHERE ' + ' AND '.join(clauses) if clauses else '')
        sql += ' ORDER BY next_review ASC, created_at DESC'
        if limit is not None:
            if type(limit) is not int or not 1 <= limit <= 10000:
                raise ValidationError('筆數上限必須是 1 到 10000 之間的整數。')
            sql += ' LIMIT ?'
            args.append(limit)
        with self.connect() as conn:
            return [self.unpack(row) for row in conn.execute(sql, args)]

    def review(self, memory_id, rating):
        if rating not in ('again', 'good', 'easy'):
            raise ValidationError('回想評價必須是 again、good 或 easy。')
        with self.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            memory = self._get(conn, memory_id)
            if memory['status'] != 'active':
                raise ValidationError('請先將這段記憶從封存中還原。')
            old = memory['interval_days']
            days = 0 if rating == 'again' else (max(1, min(365, old * 2 + 1)) if rating == 'good' else max(3, min(365, old * 3 + 3)))
            next_review = datetime.now(timezone.utc) + (timedelta(minutes=10) if rating == 'again' else timedelta(days=days))
            memory.update(review_count=memory['review_count'] + 1, updated_at=now_iso(),
                          next_review=next_review.isoformat(timespec='seconds'), interval_days=days)
            conn.execute('UPDATE memories SET review_count=?, updated_at=?, next_review=?, interval_days=? WHERE id=?',
                         (memory['review_count'], memory['updated_at'], memory['next_review'], days, memory_id))
            self._record(conn, memory, 'review:' + rating)
        return memory

    def stats(self):
        with self.connect() as conn:
            conn.execute('BEGIN')
            counts = dict(conn.execute('SELECT status, COUNT(*) FROM memories GROUP BY status'))
            rooms = {key: 0 for key in ROOMS}
            rooms.update(dict(conn.execute("SELECT room_id, COUNT(*) FROM memories WHERE status='active' GROUP BY room_id")))
            due = conn.execute("SELECT COUNT(*) FROM memories WHERE status='active' AND next_review<=?", (now_iso(),)).fetchone()[0]
        return {'total': sum(counts.values()), 'active': counts.get('active', 0), 'archived': counts.get('archived', 0), 'due': due, 'rooms': rooms}

    def export(self):
        with self.connect() as conn:
            conn.execute('BEGIN')
            memories = [self.unpack(r) for r in conn.execute('SELECT * FROM memories ORDER BY created_at')]
            revisions = []
            for row in conn.execute('SELECT * FROM revisions ORDER BY revision_id'):
                item = dict(row); item['snapshot'] = json.loads(item['snapshot']); revisions.append(item)
        return {'version': 1, 'exported_at': now_iso(), 'memories': memories, 'revisions': revisions}

    def butler(self, query=''):
        query = text_field(query, '管家問題', 500)
        memories = self.list(search=query, limit=8) if query else self.list(due=True, limit=8)
        stats = self.stats()
        all_memories = self.list()
        titles = {}
        for memory in all_memories:
            key = re.sub(r'\s+', '', memory['title']).casefold()
            titles.setdefault(key, []).append({'id': memory['id'], 'title': memory['title']})
        duplicates = [group for group in titles.values() if len(group) > 1]
        suggested = 'hall'
        for room, words in (
            ('library', ('學習', '知識', '讀書', '程式', '技術', '方法')),
            ('gallery', ('回憶', '旅行', '家人', '朋友', '人生', '照片')),
            ('garden', ('靈感', '生活', '感恩', '自然', '花園')),
            ('observatory', ('夢想', '目標', '計畫', '未來', '願望')),
            ('quiet-room', ('心情', '情緒', '冥想', '平靜', '感受')),
        ):
            if any(word in query for word in words):
                suggested = room; break
        if query:
            message = f'為你找到 {len(memories)} 段包含這些關鍵字的記憶。點選記憶即可回到對應的房間。' if memories else '還沒有找到包含這些關鍵字的記憶。試試更短的詞，或把今天的片段安放進來。'
        elif stats['active'] == 0:
            message = '歡迎回家。先放下一段今天值得記住的事，再選一件物品作為聯想線索。'
        elif stats['due']:
            message = f'今天有 {stats["due"]} 段記憶等待回訪。先在心裡回想，再打開記錄，告訴我你記得有多清楚。'
        else:
            message = '今天的回訪已經完成。你可以在花園裡坐一會兒，也可以留下一段新的記憶。'
        if duplicates:
            message += f' 另有 {len(duplicates)} 組同名記憶可整理。我會保留所有原始記錄。'
        return {'mode': 'local', 'message': message, 'memories': memories, 'duplicates': duplicates,
                'suggested_room': suggested, 'stats': stats}
