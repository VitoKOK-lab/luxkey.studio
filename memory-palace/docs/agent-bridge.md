# 記憶莊園的代理人橋接

網頁、CLI 和 MCP 共用同一份 SQLite 資料庫，預設位置是 `data/memories.sqlite3`。CLI 與 MCP 可獨立運作。若另外指定資料庫，請為三個入口使用相同的 `--db` 路徑，或設定 `MEMORY_PALACE_DB`。

MCP 橋接已備妥。以下指令可在日後要連接時執行。連接後，客戶端可讀取工具回傳的記憶，並依自身設定把工具結果提供給模型。

## Codex CLI

```sh
codex mcp add memory-palace -- python3 /Users/vito/Documents/MemoryPalace/scripts/mcp_server.py
codex mcp list
```

[Codex MCP 設定文件](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

## Claude Code

下列指令將橋接加入目前專案在這台機器上的設定。

```sh
cd /Users/vito/Documents/MemoryPalace
claude mcp add --transport stdio --scope local memory-palace -- python3 /Users/vito/Documents/MemoryPalace/scripts/mcp_server.py
claude mcp get memory-palace
```

[Claude Code MCP 設定文件](https://code.claude.com/docs/en/mcp)

## 工具

| 工具 | 用途 |
| --- | --- |
| `memory_add` | 加入記憶，並可指定房間、錨點、線索與標籤 |
| `memory_search` | 以關鍵字查找，可依房間或封存狀態篩選 |
| `memory_list_due` | 查看目前已到期的記憶 |
| `memory_review` | 記錄回訪評價並安排下次回訪 |
| `memory_archive` | 封存記憶並保留修訂記錄 |
| `memory_restore` | 從封存還原記憶 |

若要直接在終端搜尋、查看待回訪清單或匯出含修訂記錄的備份，可執行以下指令。

```sh
cd /Users/vito/Documents/MemoryPalace
python3 scripts/palace.py search '關鍵字'
python3 scripts/palace.py due
python3 scripts/palace.py export > memory-palace-export.json
```
