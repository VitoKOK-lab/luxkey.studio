"""Validated, local cosmetic estate design storage and sharing."""
from __future__ import annotations

import json
import re

from palace_store import ROOT, PalaceStore, ValidationError

SCHEMA_VERSION = 1
ARCHITECTURE_ID = 'glass-estate-v2'
DEFAULT_RENDER_STYLE = 'original'
DEFAULT_LIGHTING_LEVEL = 1.0
DEFAULT_DESIGN = {
    'schema_version': SCHEMA_VERSION,
    'architecture_id': ARCHITECTURE_ID,
    'name': '憶境莊園',
    'theme': 'lagoon',
    'render_style': DEFAULT_RENDER_STYLE,
    'lighting_level': DEFAULT_LIGHTING_LEVEL,
    'decorations': [],
}
THEMES = [
    {'id': 'lagoon', 'name': '湖光青綠'},
    {'id': 'moon', 'name': '月夜銀藍'},
    {'id': 'sunrise', 'name': '晨曦暖金'},
]
RENDER_STYLES = [
    {'id': 'original', 'name': '柔和日光', 'description': '原有的象牙石、淺木與柔和日光'},
    {'id': 'scifi', 'name': '科幻', 'description': '珍珠白板材、石墨金屬與冰青燈條'},
    {'id': 'mono', 'name': '黑白', 'description': '銀灰金屬、石墨木作與鮮明黑白層次'},
    {'id': 'cyberpunk', 'name': '賽博龐克', 'description': '深藍石墨表面，搭配青色與桃紅霓虹'},
    {'id': 'film', 'name': '復古電影', 'description': '深胡桃木、暖黃銅與細微膠片顆粒'},
    {'id': 'cartoon', 'name': '美式卡通', 'description': '鮮明的藍橙配色、霧面材質與細緻描邊'},
]
ITEMS = [
    {'id': 'plush-bear', 'name': '絨毛熊'},
    {'id': 'moon-lamp', 'name': '月光燈'},
    {'id': 'plant', 'name': '綠植'},
    {'id': 'crystal', 'name': '水晶'},
]
THEME_IDS = {item['id'] for item in THEMES}
RENDER_STYLE_IDS = {style['id'] for style in RENDER_STYLES}
ITEM_IDS = {item['id'] for item in ITEMS}
SLOTS = {'left', 'right'}
URL_RE = re.compile(r'(?:https?://|www\.)', re.IGNORECASE)
COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def rooms_catalog():
    """Return only stable room identifiers and display names from the scene manifest."""
    try:
        manifest = json.loads((ROOT / 'assets' / 'scene-manifest.json').read_text(encoding='utf-8'))
        rooms = [{'id': room['id'], 'name': room['name']} for room in manifest['rooms']]
        if not rooms or any(not isinstance(x['id'], str) or not isinstance(x['name'], str) for x in rooms):
            raise ValueError('invalid room catalog')
        if len({room['id'] for room in rooms}) != len(rooms):
            raise ValueError('duplicate room ids')
        return rooms
    except (OSError, ValueError, KeyError, TypeError):
        raise RuntimeError('無法讀取莊園房間目錄。')


def catalog():
    return {'architecture_id': ARCHITECTURE_ID, 'themes': THEMES, 'items': ITEMS,
            'render_styles': RENDER_STYLES, 'rooms': rooms_catalog(), 'schema_version': SCHEMA_VERSION}


def validate_design(value):
    if not isinstance(value, dict):
        raise ValidationError('設計必須是 JSON 物件。')
    required = {'schema_version', 'architecture_id', 'name', 'theme', 'decorations'}
    if not required <= value.keys() or value.keys() - required - {'render_style', 'lighting_level'}:
        raise ValidationError('設計欄位不正確。')
    if type(value['schema_version']) is not int or value['schema_version'] != SCHEMA_VERSION:
        raise ValidationError('設計版本不支援。')
    if value['architecture_id'] != ARCHITECTURE_ID:
        raise ValidationError('莊園建築版本不支援。')
    name = value['name']
    if not isinstance(name, str):
        raise ValidationError('莊園名稱必須是文字。')
    name = name.strip()
    try:
        name.encode('utf-8')
    except UnicodeEncodeError as error:
        raise ValidationError('莊園名稱包含無效字元。') from error
    if not name or len(name) > 60 or URL_RE.search(name):
        raise ValidationError('莊園名稱需為 1 到 60 個字，且不能包含網址。')
    theme = value['theme']
    if not isinstance(theme, str) or theme not in THEME_IDS:
        raise ValidationError('莊園主題不在支援清單中。')
    render_style = value.get('render_style', DEFAULT_RENDER_STYLE)
    if not isinstance(render_style, str) or render_style not in RENDER_STYLE_IDS:
        raise ValidationError('場景風格不在支援清單中。')
    lighting_level = value.get('lighting_level', DEFAULT_LIGHTING_LEVEL)
    if type(lighting_level) not in (int, float) or not 0.7 <= lighting_level <= 1.5:
        raise ValidationError('燈光亮度需為 70% 至 150%。')
    decorations = value['decorations']
    if not isinstance(decorations, list) or len(decorations) > 48:
        raise ValidationError('裝飾需為陣列，最多 48 件。')
    valid_rooms = {room['id'] for room in rooms_catalog()}
    clean, seen = [], set()
    for decoration in decorations:
        if not isinstance(decoration, dict) or set(decoration) != {'room_id', 'slot', 'item', 'color'}:
            raise ValidationError('裝飾欄位不正確。')
        room_id, slot, item, color = (decoration[k] for k in ('room_id', 'slot', 'item', 'color'))
        if not isinstance(room_id, str) or room_id not in valid_rooms:
            raise ValidationError('裝飾房間不存在。')
        if not isinstance(slot, str) or slot not in SLOTS:
            raise ValidationError('裝飾位置不支援。')
        if not isinstance(item, str) or item not in ITEM_IDS:
            raise ValidationError('裝飾品項不支援。')
        if not isinstance(color, str) or not COLOR_RE.fullmatch(color):
            raise ValidationError('裝飾顏色必須是 #RRGGBB。')
        key = (room_id, slot)
        if key in seen:
            raise ValidationError('同一房間的位置不能重複放置裝飾。')
        seen.add(key)
        clean.append({'room_id': room_id, 'slot': slot, 'item': item, 'color': color.upper()})
    return {'schema_version': SCHEMA_VERSION, 'architecture_id': ARCHITECTURE_ID,
            'name': name, 'theme': theme, 'render_style': render_style,
            'lighting_level': lighting_level, 'decorations': clean}


class DesignStore:
    """Store one cosmetic design in the vault's SQLite settings table."""
    KEY = 'estate_design_v1'

    def __init__(self, store: PalaceStore):
        self.store = store

    @staticmethod
    def _ensure_table(conn):
        conn.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')

    def get(self):
        with self.store.connect() as conn:
            self._ensure_table(conn)
            row = conn.execute('SELECT value FROM settings WHERE key=?', (self.KEY,)).fetchone()
        if row:
            try:
                return validate_design(json.loads(row['value']))
            except (ValueError, TypeError):
                return dict(DEFAULT_DESIGN)
        template = ROOT / 'template-design.json'
        if template.is_file():
            try:
                return validate_design(json.loads(template.read_text(encoding='utf-8')))
            except (OSError, ValueError, TypeError):
                pass
        return dict(DEFAULT_DESIGN)

    def save(self, value):
        design = validate_design(value)
        with self.store.connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            self._ensure_table(conn)
            conn.execute('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                         (self.KEY, json.dumps(design, ensure_ascii=False, separators=(',', ':'))))
        return design

    def export(self):
        return self.get()
