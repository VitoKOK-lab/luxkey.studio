#!/usr/bin/env python3
"""Launch the private local palace, reusing a healthy instance."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:8765'

def running():
    try:
        with urllib.request.urlopen(URL + '/api/health', timeout=1) as response:
            data = json.load(response)
        return data.get('ok') is True and data.get('mode') == 'local'
    except Exception:
        return False

def main():
    parser = argparse.ArgumentParser(description='開啟本機憶境莊園')
    parser.add_argument('--no-browser', action='store_true', help='僅啟動服務，不開啟瀏覽器')
    args = parser.parse_args()
    if not (ROOT / 'node_modules/three/build/three.module.js').exists():
        print('請先在專案資料夾執行 npm ci，安裝本機 3D 顯示元件。')
        return 1
    if not running():
        (ROOT / 'logs').mkdir(exist_ok=True)
        with (ROOT / 'logs/server.log').open('a') as log:
            proc = subprocess.Popen([sys.executable, str(ROOT / 'server.py')], cwd=ROOT,
                stdout=log, stderr=log, stdin=subprocess.DEVNULL, start_new_session=True)
        for _ in range(60):
            if running():
                break
            if proc.poll() is not None:
                print('啟動失敗，請查看 logs/server.log；8765 埠可能被其他程式使用。')
                return 1
            time.sleep(.1)
        else:
            print('服務尚未就緒，請查看 logs/server.log。')
            return 1
    if not args.no_browser:
        webbrowser.open(URL)
    print('憶境莊園已開啟：' + URL)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
