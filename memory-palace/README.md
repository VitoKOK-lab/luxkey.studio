# 憶境莊園

憶境莊園是先存在這部 Mac 的記憶空間：24 個房間、192 個固定地標，分成六區，由六位會沿路行走的機械動物管家負責帶路。建築與管家都有可在 Blender 編輯的 `.blend` 場景，以及供瀏覽器載入的 GLB 模型。

目前可以用對話、貼上的內容、文字檔或截圖交付記憶。原文和附件會先保存在本機；尚未連接你指定的 AI Agent 時，項目會留在「等待 AI Agent」收件匣。Agent 尚未設定，因此目前沒有即時 AI 推論。預設連接方式是你指定的本機 Agent 命令；OpenAI 相容 API 或 Anthropic 可作為選用傳輸方式。莊園不會借用其他已登入的帳戶，也不會自動擷取整個帳戶。

## 開啟

在 Finder 雙擊 `開啟憶境莊園.command`，或在專案資料夾執行：

```sh
python3 scripts/launch.py
```

正式本機服務網址是 <http://127.0.0.1:8765>。啟動器會重用已開啟的服務；關閉瀏覽器不會停止服務。也可以在終端直接執行 `python3 server.py`，再用 `Ctrl+C` 停止。

新環境需要 Python 3.10+、Node.js，並在專案資料夾執行 `npm ci` 安裝瀏覽器使用的 Three.js。日常使用不需要 Blender；編輯或重建模型才需要 Blender。QA 瀏覽器檢查使用的 8766 是暫時埠，不是正式服務網址。

## 對話與擷取

- 可以直接對 NOA 對話，或附加貼上的對話、文字／Markdown 檔及 PNG、JPEG、WebP 截圖。
- 目前主要語音輸入使用瀏覽器語音辨識；需授予麥克風權限，且瀏覽器和平台必須支援。硬體麥克風語音輸入尚未實測。語音朗讀（TTS）是可選功能。
- 尚未設定 Agent 時，輸入和附件會持久保存在本機收件匣的 `awaiting_api` 狀態，之後連接你指定的 Agent 才能整理。
- macOS Vision OCR helper 可在本機辨識截圖文字；它是 OCR，不代表已有 AI 推論。預設只把辨識文字交給 Agent；只有明確啟用影像能力，才會傳送原圖。
- 不會自動讀取整個帳戶、其他聊天、郵件或生活資料來源。只處理使用者主動交付的內容。

## 設定你之後提供的 AI Agent

設定檔範本是 `config/ai.env.example`。複製為 Git 忽略的本機檔 `config/ai.env`，填入你信任且支援莊園協定的 Agent 命令。協定會透過標準輸入／輸出交換 JSON；每次提交或重試時才啟動你指定的程式。Agent 以目前使用者權限執行；推論方式、使用帳號或是否傳送資料由該程式決定。完整欄位、限制和範例見 [Agent 協定](docs/agent-protocol.md)。

```sh
cp config/ai.env.example config/ai.env
```

HTTP API 是選用傳輸方式；需要時可改用 OpenAI 相容 API 或 Anthropic，並把相關金鑰只放在本機設定或環境變數。未設定 Agent 或 API 前不會執行模型推論。Agent 回覆後，莊園會核對來源、安放記憶並安排地標行走。

## 固定路線與記憶內容

房間和地標 ID 是穩定記憶地址，變更視覺設計時應予保留。路線順序、地標區別、熟悉路線與主動回想是核心使用方式；六位管家各自負責一區，會實際沿路行走到記憶位置。24 房、192 地標是產品配置，不代表已知的最佳記憶容量。

每筆記憶要區分三種內容：**來源原文**保留當時交付的內容，**摘要**濃縮整理後的事實，**想像助記**則是明確標示的聯想畫面，不可當成真實經歷。回訪時先看地標提示並嘗試回想，再核對來源。設計說明見 [位置記憶法](docs/method-of-loci.md)。

場景有四種視角：莊園總覽、自己走動的第一視角、跟看管家的第三視角，以及管家眼睛視角。第一視角以 160 cm 眼高行走，可用 WASD／方向鍵移動、滑鼠或拖曳環顧，並支援觸控環顧。人物會受場景碰撞限制，可走樓梯並通過門和橋，從六區往來 24 個房間；這是 3D 場景行走，仍建議先用自己舒適的速度熟悉控制。房間導覽也可直接帶你進入房間。

六位管家可以同時出發。同一位管家有多趟行程時，會按派遣順序執行，回到原位後再開始下一趟。行程面板的六個按鈕會顯示各管家的狀態和待辦數，按一下即可跟隨該管家。跟隨期間也可從視角列切換管家。

點選場景裡的管家可開啟對話。NOA 和 FERN 是機械狗，MUSE 和 SOLA 是機械貓，INDEX 和 VEGA 是機械貓頭鷹。第三視角會平滑跟隨管家的位移，並維持原來的觀看方向。拖曳可轉動鏡頭。進入跟隨、切換管家或回到總覽時，畫面直接切換。

「管家的眼睛」使用模型站姿的眼睛位置。自動水平轉向上限為每秒 25°，手動水平轉向上限為 45°，同時轉向上限為 50°。開啟系統的「減少動態效果」時，管家仍會沿路移動，關節保持靜止，眼睛視角保留當下的朝向，仍可拖曳環顧。

點選空地標後可按「和管家聊聊，放在這裡」，並把該房間和地標作為明確安放目標。連接 Agent 後，可用一次一問的對話交付內容。若位置已被使用，系統會保留內容待安放，不會覆寫既有記憶。可隨時切回莊園總覽，或從管家的視線沿路回訪。

## 資料與備份

- 私人資料庫位於 `data/memories.sqlite3`，不納入 Git 或網站建置。
- 介面的 JSON 匯出包含記憶及修訂記錄；不包含完整對話收件匣或截圖。
- 完整 SQLite 備份包含對話、收件匣及截圖：`python3 scripts/backup.py`。備份輸出在 `data/backups/`，並進行完整性檢查。
- 備份仍在同一部電腦。若要防範設備遺失，請另存到你選擇的位置。SQLite 未額外加密，可配合 macOS 磁碟加密。
- `.blend` 與 GLB 場景不包含私人記憶資料。

## 個人佈置與可分享模板

頂端「風格」會更換 3D 莊園的材質配色與燈光，保留木紋、石紋與玻璃的透明度。柔和日光沿用原有的象牙石、淺木與「佈置」的整體色調。科幻用珍珠白板材、石墨金屬與冰青燈條，賽博龐克用深藍石墨表面與青色、桃紅霓虹。黑白用銀灰金屬與石墨木作，復古電影用深胡桃木、暖黃銅與細微膠片顆粒，美式卡通用鮮明的藍橙配色、霧面材質與細緻描邊。畫面已移除全幅霧狀覆層。

在同一視窗的「莊園照明」拖曳「燈光亮度」，可以在 70% 到 150% 之間即時調整室內燈具與花園引路燈，每格 5%。「恢復預設」會預覽 100%。「取消」會還原開啟視窗時的外觀，「套用並儲存」會記住調整後的風格與亮度。

即時場景已降低曝光、環境補光與疊加的室內泛光，保留閱讀燈與引路燈的用途。機械管家的陶瓷外殼使用較柔和的反光，彩色陶瓷不再自行發光；深色關節、金屬邊框與腳下接觸陰影協助辨識輪廓。

「靜心模式」提供潮汐、漣漪與靜光三種緩慢流動的水景，可選 3、5 或 10 分鐘。開始後可暫停與繼續；上方的流動畫面按鈕可以單獨停止動畫，計時仍繼續。系統設定減少動態效果時使用靜態水景。返回莊園或按 Escape 會結束這次靜心，不寫入私人記憶。桌面與手機版預覽見 `assets/meditation-preview.jpg` 和 `assets/meditation-mobile-preview.jpg`。

頂端「佈置」可設定莊園名稱、整體色調，並在每個房間左右兩個擺位放入家具或擺件：絨毛熊、月光燈、綠植或水晶，共 48 個擺位。這些裝飾是個人外觀設定，與 192 個記憶地標分開，不會佔用或搬動記憶地址。佈置存在此 vault 的 SQLite 設定中，也可從介面匯出或匯入 JSON。

本機外觀設定與佈置 JSON 都以 `render_style` 記錄風格，以 `lighting_level` 記錄亮度。既有版本 1 的檔案可直接匯入，缺少個別欄位時會使用柔和日光（`original`）或 100%（`1.0`）。

```sh
python3 scripts/package_template.py
```

命令會建立 `dist/MemoryPalace-template.zip`，封裝允許清單內的程式與場景檔，不含私人資料庫或 API 金鑰。若想把目前外觀作為模板預設值，可加 `--include-design`；ZIP 可自行保存或放到 GitHub 分享。本專案已保存於 GitHub 的 `VitoKOK-lab/luxkey.studio/memory-palace`；GitHub 儲存不等於應用已部署到公開網站。

更多資料邊界與未來多人路線見[模組與資料架構](docs/architecture.md)。Cloudflare 線上版已提供帳號登入與每帳號雲端保存；手機和電腦以同一帳號登入即可讀取。Mac 本機版仍獨立保存，不會自動上傳既有資料。

## Cloudflare 線上版

[開啟憶境莊園](https://luxkey-memory-palace.vitokok.workers.dev/) → 建立帳號。帳號使用 3～40 個英數字、底線或連字號，密碼 12～128 字元；目前未提供密碼重設，請妥善保存。

線上記憶、對話收件匣及佈置存在 Cloudflare D1，依帳號隔離。既有 Mac 私人記憶不會自動遷移。雲端版可透過 Claude 引導對話、整理並安放記憶，所有登入使用者共用管理員的 API 額度，設有每日次數限制；尚未提供離線同步或裝置間即時推播。部署方式見 [Cloudflare 說明](cloudflare/README.md)。

## 建築與算圖圖庫

迎賓大廳與 NOA 現在有獨立的精修樣板。進入「我自己 · 第一視角」並選擇迎賓大廳，可以近看石材拼縫、櫃檯收邊與陰影；選擇 NOA 的第三視角，可以查看分片外殼、鏡頭與關節。樣板保留原有房間、地標與路線，其餘空間維持原版。可編輯原檔及新 Cycles 算圖集中在[圖庫的細節樣板](http://127.0.0.1:8765/renders.html#quality)。

在本機服務開啟後，可瀏覽建築全景、24 個空間的 Cycles 算圖、四件擺件的棚拍圖和三種機械動物的合照。圖庫與可行走場景共用 Blender 建築來源，採用象牙白、淺橡木、鼠尾草綠、香檳金與柔和日光。[開啟算圖圖庫](http://127.0.0.1:8765/renders.html)

圖庫上方的「圖集色調」可以獨立預覽圖片色調。點開原圖連結即可瀏覽或下載原始 Blender 算圖。

可編輯場景包含窗框、門把、家具收邊、燈具與花園細節。洞石、大理石、木材、布料和拉絲青銅共用 24 張 PBR 貼圖。擺件各有可換色的 GLB 模型，絨毛熊的縫線、月光燈的軌道、綠植葉片與水晶切面均可在 Blender 中個別編輯。[資產規格與重建方式](docs/luxury-assets.md)

## Agent 橋接

可用你指定的本機 Agent 命令處理莊園對話；設定方式見 [Agent 協定](docs/agent-protocol.md)。CLI 與 MCP 另可供支援的客戶端連接本機資料庫，見 [Agent 橋接](docs/agent-bridge.md)。未自動修改全域 Agent 設定；本機 Agent 尚未橋接至雲端版。外部客戶端是否實際連接，取決於各自設定。

## 場景與程式

- `assets/memory-palace.blend`：Blender 可編輯場景。
- `assets/memory-palace.glb`：瀏覽器場景模型。
- `assets/accessories/` 包含四件可編輯擺件、獨立 GLB 與棚拍圖。
- `assets/stewards/` 包含三種機械動物的可編輯 Blender 場景、獨立 GLB 與 Cycles 合照。
- `assets/quality/` 包含迎賓大廳與 NOA 的精修 Blender 原檔、即時模型及瀏覽器預覽。
- `assets/textures/` 包含八組建築材質的 PBR 貼圖。
- `assets/renders/` 包含建築、室內及花園算圖與圖庫索引。
- `assets/scene-manifest.json`：房間、地標、路線與管家配置。
- `assets/lighting-manifest.json` 記錄各空間的燈具、光源與照明範圍。
- `blender/build_palace.py`：場景重建程式。
- `app/`：本機瀏覽器介面。
- `palace_store.py`、`ai_butler.py`、`server.py`：本機儲存、對話收件匣與服務。
- `ai_provider.py`、`docs/agent-protocol.md`、`scripts/ocr.swift`：Agent／選用 HTTP 傳輸協定與 macOS Vision OCR。

重建模型會覆寫生成的場景檔；若曾在 Blender 手工修改，請先另存副本。

```sh
PALACE_SKIP_RENDER=1 blender --background --python-exit-code 1 --python blender/build_palace.py
blender --background --python-exit-code 1 --python blender/build_accessories.py
blender --background --python-exit-code 1 --python blender/build_robot_animals.py
blender --background --python-exit-code 1 --python blender/render_estate.py
python3 -m unittest discover -s tests -v
node --check app/main.js
node --check app/scene.js
node --check app/stewards.js
node --check app/animal-rig.js
node --test tests/*.test.js
```

## 管家的日常活動

莊園開啟時，六位管家會沿各自區域的路線散步、玩球或打掃。點「集合到前庭」可呼喚集合；在真人第一視角時，按鈕為「集合過來」，會選擇你附近可到達的安全步道。到齊後停留，點「自由活動」再次散開。對話也支援獨立口令「集合」「自由活動」，語音辨識後送出相同口令亦可。

有記憶行程的管家完成後再來；集合期間仍能交付記憶工作，完成後會回來。打掃與玩耍是場景活動，不會更動記憶，也不消耗 Claude API 額度。活動只在頁面執行時模擬，沒有離線背景工作或跨裝置同步動作。
