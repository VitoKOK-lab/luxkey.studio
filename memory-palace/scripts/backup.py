#!/usr/bin/env python3
"""Consistent SQLite backup, including WAL data; never deletes old backups."""
import argparse
from datetime import datetime
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]

def backup(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if not source.is_file():
        raise ValueError('資料庫尚未建立；先開啟一次莊園。')
    if destination.exists() or destination == source:
        raise ValueError('備份目的地已存在，請使用新檔名。')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
        with sqlite3.connect(destination) as saved:
            original.backup(saved)
            if saved.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('備份完整性檢查未通過。')
    return destination

def main():
    parser = argparse.ArgumentParser(description='建立憶境莊園資料庫備份')
    parser.add_argument('--db', type=Path, default=ROOT / 'data/memories.sqlite3')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    destination = args.output or ROOT / 'data/backups' / (datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.sqlite3')
    print(backup(args.db, destination))

if __name__ == '__main__':
    main()
