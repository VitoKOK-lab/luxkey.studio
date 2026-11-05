#!/bin/zsh
cd -- "${0:A:h}"
python3 scripts/launch.py
if [ $? -ne 0 ]; then
  read '?按 Enter 關閉視窗。'
fi
