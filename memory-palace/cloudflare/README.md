# Cloudflare 部署

線上入口：https://luxkey-memory-palace.vitokok.workers.dev/

本目錄提供 Workers 後端、帳號登入與 D1 儲存。本機 Python 版保持獨立；不會自動匯入任何私人資料。GitHub 根目錄原有網站不受此子專案影響。

## 更新部署

在 memory-palace 目錄執行（須已登入自己的 Wrangler 帳號）：

```sh
npm ci
python3 scripts/build_cloudflare.py
wrangler d1 migrations apply luxkey-memory-palace --remote
wrangler deploy
```

複製專案給別人時，請先更換 wrangler.jsonc 的 account_id、database_id 與專案名稱，建立對方自己的 D1。這些 ID 不是登入憑證；OAuth token、.dev.vars、.wrangler 內容不得提交。

建置採公開素材允許清單，輸出 dist/cloudflare/public；不包含 data、附件、憑證或本機設定。大型主模型無損拆成 glTF 和小於 25 MiB 的 buffers，記憶地標 ID 不變。原始 Blender／GLB 保持不變。

## 資料與登入

每個帳號的記憶、修訂、佈置、對話工作及截圖分塊都依 user_id 隔離。靜態共用場景公開，私人頁面與 API 須登入；請保留 run_worker_first 與 Worker 路由檢查。密碼採 PBKDF2-SHA256 100,000 次及個別 salt；資料庫只保存 session token 雜湊。Cookie 有效七天，Secure、HttpOnly、SameSite=Lax；登出撤銷當前 session。

目前使用帳號／密碼，尚無重設密碼與信箱驗證。雲端已支援 Anthropic Claude Messages API，提供引導式對話、記憶擷取、地標安放與回想。未設定、失敗或額度不足時保留原文供重試。本機命令 Agent 仍需獨立授權橋接。

同帳號不同裝置可讀寫同一資料庫，但尚無離線同步或即時推播。裝置讀取時取得最新資料；Mac vault 保持獨立。自訂網域尚未綁定，目前使用 workers.dev。

## 驗證

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -v
wrangler deploy --dry-run
```

部署後應以合成資料驗證註冊、登入、跨 session 保存、帳號隔離、登出撤銷與 3D 載入；不可將本機私人資料當成測試資料。

## Claude API

在本專案目錄執行 `wrangler secret put ANTHROPIC_API_KEY`，於隱藏提示輸入 Anthropic Key。不要放進網頁、Git、.env 範例或聊天。部署時保留既有 secret。

wrangler.jsonc 的非密鑰設定：

- `PALACE_CLAUDE_MODEL`：預設 `claude-sonnet-4-6`，可改為帳號可用且支援 structured outputs 的 Claude 模型。
- `PALACE_AI_ALLOWED_USERS`：本次依擁有者要求設為 `*`，所有已登入使用者共用此 Key 額度；可改成逗號分隔的莊園帳號。省略則不開放。
- `PALACE_AI_DAILY_LIMIT`：每帳號每天 30 次。
- `PALACE_AI_GLOBAL_DAILY_LIMIT`：整站每天 300 次。日界線為 UTC；這是次數上限，不是金額保證。費用依 Anthropic 實際用量計算。

每個帳號同時僅一筆 AI 處理；同一 request_id 不重複觸發。失敗嘗試仍計入限額，以避免失敗重試大量扣費。60 秒無回覆則保留原文、顯示可重試；重新整理或中斷後，逾期工作可恢復為失敗狀態供手動重試。

只傳當次使用者提交的文字／截圖、有限同帳號對話背景、相關記憶與共用地標，不傳其他帳號或 Mac vault。Claude 圖片最大 5 MiB；8 MiB 內原圖仍可保存，但超過推論限制需縮小後再提交。圖片辨識內容先請使用者核對，不能單憑模型轉錄當成已驗證事實。模型無權刪除或改寫既有記憶；來源引句、房間、空位和召回 ID 皆由伺服器檢查。

文字／附件原文、整理摘要、助記想像分開保存。不能核對來源、地標已滿或指定位置被占用的候選保留待釐清；不覆蓋舊記憶。尚未提供即時逐字串流回覆。
