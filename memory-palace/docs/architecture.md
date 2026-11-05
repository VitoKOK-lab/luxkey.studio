# 模組與資料架構

憶境莊園把固定建築、個人佈置、記憶日記和可分享程式分開處理。這讓每個人可以替自己的房間配置家具和擺件，同時保留共用的路線與地標地址。

## 共用建築與個人佈置

共用建築使用 `glass-estate-v2` 場景；房間與地標 ID 是穩定地址。個人可以調整房間佈置，不會因此更換記憶位置。

佈置資料使用版本化 JSON，第一版結構如下：

```json
{
  "schema_version": 1,
  "architecture_id": "glass-estate-v2",
  "name": "我的莊園",
  "theme": "lagoon",
  "decorations": [
    { "room_id": "library", "slot": "left", "item": "plant", "color": "#B9DFD7" }
  ]
}
```

`architecture_id` 固定為 `glass-estate-v2`，`theme` 可選 `lagoon`、`moon` 或 `sunrise`。每個房間有 `left` 和 `right` 兩個擺位，全莊園共 48 個；每個位置最多放一件。`item` 可選絨毛熊（`plush-bear`）、月光燈（`moon-lamp`）、綠植（`plant`）或水晶（`crystal`），`color` 使用 `#RRGGBB`。佈置設定存於同一個本機 SQLite vault 的設定表，範圍是該 vault，不會改動共用場景、其他資料庫的佈置或 192 個記憶地標。

介面提供設計 JSON 匯入和匯出；伺服器端路徑為 `GET/POST /api/design` 和 `GET /api/design/export`。記憶資料另有獨立匯出，佈置 JSON 不含私人記憶或對話。

## 模組邊界

- **場景模組**提供房間、地標和路線；記憶以固定 ID 定位。
- **佈置模組**讀取版本化設計 JSON，在瀏覽器 3D 場景中套用個人家具與擺件，不改寫 `.blend` 場景來源。
- **記憶與收件匣模組**把原文、摘要、想像助記、對話和附件保存在本機資料庫，並保留各自用途。
- **Agent 模組**預設等待使用者提供的本機 Agent 命令，以 `memory-palace.agent.v1` JSON 標準輸入／輸出協定處理對話。尚未設定時，輸入留在 `awaiting_api` 收件匣。OpenAI 相容 API 和 Anthropic 是可選 HTTP 傳輸方式，不是預設推論服務。
- **模板封裝模組**準備可分享的程式與場景模板，不把私人日記或 API 金鑰放入分享包。

Agent 收到本次訊息、擷取內容、有限對話歷史、相關記憶和莊園目錄；若使用者從空地標開始對話，也會收到明確 `placement` 房間與地標 ID。莊園自行驗證來源引句、地標與輸出，再保存記憶。詳見 [Agent 協定](agent-protocol.md)。

## 場景漫遊與交談入口

3D 場景提供四種模式：總覽、真人第一視角、跟隨管家的第三視角、管家視角。真人視角以 160 cm 眼高，支援 WASD／方向鍵與滑鼠或觸控環顧；場景碰撞涵蓋 24 個房間、樓梯、門、橋和 Blender 場景家具。個人追加的裝飾是視覺擺件，不會增加角色碰撞。管家走位沿著 route paths。空地標可開啟帶明確房間／地標目標的對話；已有記憶的位置不會被覆寫，無法立即安放時保留待安放項目。

## 模板分享與儲存

GitHub 適合放可複製的程式模板和場景素材。執行 `python3 scripts/package_template.py` 可建立 `dist/MemoryPalace-template.zip`；加入 `--include-design` 可將目前佈置做為新安裝的外觀預設值。模板快照採允許清單封裝程式及場景資產，不包含私人 SQLite 資料庫、對話、截圖、個人記憶或 API 金鑰。封裝命令可在本機產生 ZIP，已發布至 GitHub，並另有 Cloudflare Workers 雲端版。

私人日記目前存在本機 SQLite。GitHub Pages 可展示靜態內容，但不能執行本機 Python 服務或替日記保管 API 金鑰，因此適合做模板／展示頁，不是目前日記的儲存位置。程式模板與私人資料可各自選擇本機或 GitHub 儲存，使用時需維持兩者分離。

## 手機與多人使用路線

本機 Python 服務僅綁定 Mac loopback。另行部署的 Cloudflare Workers 版本以 HTTPS 提供手機／電腦登入，D1 以 user_id 隔離記憶、修訂、對話工作、附件及佈置。每個雲端帳號從空白開始，不讀取 Mac vault。

登入採用 PBKDF2 密碼雜湊、隨機 session、HttpOnly／Secure／SameSite cookie、來源檢查與登入／寫入速率限制。登出撤銷當前 session。尚無密碼重設、離線合併、裝置間即時推播或本機與雲端雙向同步。雲端使用 Claude API 進行引導對話、擷取與回想，原文先入庫，再驗證模型輸出的來源引句與地標；未設定或失敗時保留供手動重試。部署細節見 [Cloudflare 說明](../cloudflare/README.md)。
