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

目前使用帳號／密碼，尚無重設密碼與信箱驗證。AI Agent 尚未接入，輸入保存為 awaiting_api；不得顯示成已完成智能整理。本機命令 Agent 不能直接在 Workers 執行，後續需獨立的授權橋接。

同帳號不同裝置可讀寫同一資料庫，但尚無離線同步或即時推播。裝置讀取時取得最新資料；Mac vault 保持獨立。自訂網域尚未綁定，目前使用 workers.dev。

## 驗證

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -v
wrangler deploy --dry-run
```

部署後應以合成資料驗證註冊、登入、跨 session 保存、帳號隔離、登出撤銷與 3D 載入；不可將本機私人資料當成測試資料。
