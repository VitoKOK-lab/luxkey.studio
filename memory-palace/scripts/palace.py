#!/usr/bin/env python3
"""Local command-line access; no server or cloud connection needed."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from palace_store import PalaceStore, ROOMS, ValidationError, NotFoundError


def main():
    parser = argparse.ArgumentParser(description='本機記憶莊園資料工具')
    parser.add_argument('--db', help='SQLite 路徑，預設使用莊園內的 data/memories.sqlite3')
    sub = parser.add_subparsers(dest='command', required=True)
    add = sub.add_parser('add', help='儲存一段記憶')
    add.add_argument('--title', required=True)
    add.add_argument('--body', required=True)
    add.add_argument('--room', choices=ROOMS, default='hall')
    add.add_argument('--locus', default='')
    add.add_argument('--cue', default='')
    add.add_argument('--tag', action='append', default=[])
    add.add_argument('--source', default='CLI')
    search = sub.add_parser('search', help='以文字搜尋記憶')
    search.add_argument('query', nargs='?', default='')
    search.add_argument('--room', choices=ROOMS, default='')
    search.add_argument('--include-archived', action='store_true')
    sub.add_parser('due', help='目前待回訪的記憶')
    sub.add_parser('stats', help='查看資料數量')
    sub.add_parser('export', help='輸出完整 JSON 備份（含修訂記錄）')
    review = sub.add_parser('review')
    review.add_argument('id'); review.add_argument('rating', choices=['again', 'good', 'easy'])
    for name in ('archive', 'restore'):
        command = sub.add_parser(name); command.add_argument('id')
    args = parser.parse_args()
    store = PalaceStore(args.db)
    try:
        if args.command == 'add':
            result = store.add({'title': args.title, 'body': args.body, 'room_id': args.room,
                                'locus_id': args.locus, 'cue': args.cue, 'tags': args.tag, 'source': args.source})
        elif args.command == 'search':
            result = store.list(search=args.query, room=args.room, status='all' if args.include_archived else 'active')
        elif args.command == 'due':
            result = store.list(due=True)
        elif args.command == 'stats':
            result = store.stats()
        elif args.command == 'export':
            result = store.export()
        elif args.command == 'review':
            result = store.review(args.id, args.rating)
        else:
            result = store.update(args.id, {'status': 'archived' if args.command == 'archive' else 'active'})
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValidationError, NotFoundError) as error:
        print(str(error), file=sys.stderr); return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
