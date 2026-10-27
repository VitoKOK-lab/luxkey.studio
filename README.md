# A.C.E. 王牌莊園 — 3D AI Agent 公司模擬

## 3D 莊園版本

主島現在使用真正的 Three.js 幾何：三層玻璃莊園（樓高 4.4m、總高 13.2m）、挑空中庭、懸挑露台、玻璃會議廳、11.6 × 6m 無邊際泳池與雙車位車庫。原有員工、接案模擬、其他浮島、動物與 UFO 保留。

- 左側建築剖面按鈕切換室內／完整外觀；聚焦部門、導覽或跟隨角色會自動隱藏上層樓板與帷幕。上層是可見的建築與休憩空間；員工目前在地面層工作，尚未加入樓層間行走。
- 「世界環線」查看包圍主島、住宅島、娛樂島、牧場島與草原島的連續鐵路；北上琥珀快線與南下冰藍慢線各 12 節，車體放大 35%，雙軌反向運行，速度分別為 9.2／5.8 m/s。兩列車沿連續路線經過東側光門、外宇宙星晶站再返回；「北 ↑」「南 ↓」聚焦各列車，「前往外宇宙」聚焦遠端場景。外宇宙目前是同一個 3D 場景中的遠端目的地，尚未連到其他玩家或伺服器。軌道與空船航線採矩形直線布局，小圓角銜接轉彎，位於群島外圍；「空船航線」聚焦飛行中的船。
- 莊園近景自動收起軌道、車站、空船、鳥群、熱氣球與 UFO，避免遮住主樓；世界總覽會恢復顯示，選取空船或車站也能單獨查看。
- 員工返程遇到新任務時仍走原島吊橋；行走高度沿橋面取樣，回到辦公室重設地面高度。坐姿動畫已校正向下位移；員工與居民的站立／行走會依動畫後腳底位置貼地，接觸陰影跟隨各島地面。
- 主樓正面設有 10.8m 寬大螢幕；點擊實體螢幕或側邊「大螢幕」按鈕可放大。內容顯示現有模擬營運數據與會議狀態，尚未接入新聞或客戶簡報。
- 列車承擔動物遊客上下車；空船仍是觀光動畫，兩者尚未承擔員工通勤或購買功能；暫停模擬也會停止它們。減少動態效果偏好會停止觀光動畫。
- Mini Forest、Train Kit、Watercraft Kit 與配送車為真正的 Kenney CC0 模型，來源與授權見 [assets/kenney/SOURCES.md](assets/kenney/SOURCES.md)。空船由 Watercraft 船體加程序化氣囊構成。未把概念插畫當成 3D 場景。
- GitHub Pages 上的 AI 仍是示範／離線模式；未加入 API key、Cloudflare 後端或跨裝置存檔。

### 遊園、私人島與視角

- 所有程序化浮島使用方正邊界；主樓前新增遊園島，包含節目廣場、六匹馬的環場越障表演、六攤市集。
- 312 位動物遊客分布在列車與園區。雙向列車在中央站停靠 45 秒，下車、看節目、逛市集、看表演，再排隊上車；若還有人登車，會等待完成。兩條月台、坡道與外軌跨線步橋具有實體幾何。中段為開放觀光車廂，保留 Kenney 車頭／車尾。
- 「動物遊園」開啟園區視角；點節目廣場螢幕可放大目前的 Canvas 動畫節目。工作台已有完成文字時會加入內容展映。尚未接入真實影片串流、外部觀眾數據或支付。
- 上方「切換視角」可選員工、北上／南下列車乘客、UFO 俯瞰與網球選手。拖曳可環顧，按 Esc 或底部退出按鈕返回原視角。網球場有固定陪打者，員工到場後接替陪打位置。
- 上方「枯山水・私人島」直接前往遠端私人島；「開始冥想」切換到座位視線、收起介面，並暫停模擬。離開時恢復原速度。這是本機場景體驗，不是需要帳號權限的私人伺服器。
- 泳池有四位 3D 泳客，會划水、踢腿、轉身；泳池入口在側欄。三條龍沿群島外圍巡飛，第一人稱／冥想時收起。
- 一般視角閒置 12 秒後慢速自動環繞；任何滑鼠、觸控或鍵盤操作立即停止。第一人稱、跟隨角色、開啟對話框與冥想時不自轉。「切換視角」內可關閉；減少動態效果偏好下預設關閉。
- 太陽與月亮圖像已移除，仍保留日夜光線、天空漸層與星光。

新增驗證：`node tests/experiences-smoke.cjs`，環境變數用法同下方瀏覽器測試。涵蓋實際視角按鈕、離開／冥想、手機操作、閒置環繞與中斷、動物完整遊園和上下車、泳客邊界與暫停、網球對打。

從 checkout 根目錄執行 `python3 -m http.server 8899 --bind 127.0.0.1`。不需要建置或 npm 安裝。新增程式：`js/estate.js`、`js/transport.js`。

### 驗證

JavaScript 語法：`for f in js/*.js; do node --check "$f" || exit 1; done`。

瀏覽器測試：啟動上述伺服器，使用已安裝 Playwright 的工具環境執行 `node tests/estate-smoke.cjs`。可用 `PLAYWRIGHT_MODULE` 指定 Playwright 套件路徑、`CHROMIUM_PATH` 指定 Chromium、`TEST_URL` 指定測試位址。測試涵蓋模型載入、所有座位／休息點／出口間的路線、繞池步行、屋頂切換、交通工具移動與暫停、雙向列車繞行外宇宙、橋上連續改派與地面高度、三層結構與玻璃材質、放大泳池、世界環線閉合與五島包圍測試，以及 390px 手機操作。截圖輸出在 `/tmp/estate-desktop.png` 、`/tmp/estate-world.png` 和 `/tmp/estate-mobile.png`。效能計數來自測試環境，不代表真實手機幀率。


LUXKEY A.C.E. 的 3D 數位分身：一間漂浮在空中的天空島美式 loft 辦公室，8 位 AI 夥伴依「LINE 詢問 → 腳本確認 → AI 製作 → 交片上架」的流程工作，AI 王牌製作人 Ace 巡樓、開會、處理事件，並用 Claude 真的產出報價、腳本、製作指令與上架文案。

線上版（claude.ai artifact）：https://claude.ai/artifact/SdWv6JPtA5HNxKSkQdmbHo

## 技術名詞對照

| 你看到的 | 名稱 | 用了什麼 |
|---|---|---|
| 瀏覽器裡的 3D | **Three.js（WebGL）** | `three@0.147` UMD 版 + `GLTFLoader` |
| 家具、食物、人物 | **glTF / GLB 低多邊形模型** | Kenney Furniture Kit、Food Kit、Mini Characters（CC0） |
| 人物會走、會坐 | **骨架動畫（skeletal animation）** | 模型內建 idle / walk / sit / emote，`AnimationMixer` 播放 |
| 桌上螢幕、畫作、天空漸層 | **Canvas 貼圖** | 2D canvas 即時繪製再貼到 3D 面 |
| 浮島、雲、樹、鳥、日月星 | **程序化低多邊形（flat shading）+ Sprite** | `sky.js`，日月跟著模擬時鐘走 |
| 群島、吊橋、住家、7-11／GYM／電影院／網球場、熱氣球 | **程序化低多邊形 + Canvas 招牌貼圖** | `islands.js`，夜晚窗戶與招牌自動點燈 |
| 動物、居民、UFO 公車、員工通勤 | **程序化動物 + Kenney 角色（同一個 bundle）** | `life.js`，掛在 `H.lifeTick`（每模擬分鐘）與 `H.updateWorld` |
| 反光、陰影、日夜 | **PBR 材質 + PMREM 環境貼圖、PCF 軟陰影、ACES 色調映射** | `fx.js` |
| 人物自己找路 | **A\* 尋路 + 導航格** | 地板切 0.5m 格子，家具用 `block()` 標障礙 |
| 牆、桌、接待台 | **程序化生成** | 用幾何體拼，沒有模型檔 |
| Ask Ace / AI 產出 | **Claude sample capability** | artifact 專屬；自架要改接 Anthropic API |

## 檔案結構

```
neon-hq/
├─ index.html          頁面、CSS、腳本載入順序
├─ js/
│  ├─ core.js          品牌、部門、人員名冊、服務價目、任務字串、全域狀態  ← 改公司從這裡開始
│  ├─ world.js         場景：地板、磚牆、窗、畫、接待台、攝影棚、會議桌、導航格
│  ├─ sky.js           天空島：浮島岩體、瀑布、雲海、小浮島、日月星空、鳥群
│  ├─ islands.js       群島：住宅島（每人一棟家）、娛樂島、牧場島、草原島、吊橋、熱氣球
│  ├─ life.js          動物、居民、UFO 牧場⇄草原載牛、員工下班回家／沒案子去娛樂島
│  ├─ agents.js        人物（程序化備援）、移動、狀態、對話泡泡
│  ├─ chars.js         載入 Kenney 角色 GLB，接動畫，取代程序化人物
│  ├─ assets.js        載入家具 GLB、配色、擺放位置  ← 加家具在這裡
│  ├─ sim.js           模擬：詢問、報價、腳本、製作、交付、事件、會議、巡樓
│  ├─ panels.js        營運分析面板、牆面螢幕、小地圖、區域標籤
│  ├─ fx.js            環境反射、接觸陰影、吊燈、桌機螢幕、音效、導覽
│  ├─ workbench.js     AI 工作台：每個角色的產出提示、王牌流程、日報
│  ├─ neon.js          Ask Ace 對話與工具（Claude 或離線回答）
│  └─ ui.js            鏡頭、KPI、資訊卡、彈窗、鍵盤、渲染迴圈、開機
├─ assets/
│  ├─ *.glb            家具與食物原檔（Kenney CC0）
│  ├─ models.json      上面的 GLB 打包成 base64（發布用）
│  ├─ Textures/colormap.png   食物貼圖
│  └─ chars/           角色 GLB + models.json + Textures/colormap.png
└─ scripts_bundle.py   重新打包 models.json
```

## 本機執行

```bash
cd neon-hq && python3 -m http.server 8899
```

開 http://localhost:8899/index.html 。不能用 `file://` 直接開（貼圖與 JSON 會被瀏覽器擋）。

## 複製成另一間公司

1. 複製整個 `neon-hq/` 資料夾。
2. 改 `js/core.js`：`H.BRAND`（公司名、AI 名字、月目標）、`H.DEPTS`（四個部門與區域範圍）、`H.ROSTER`（人員、角色、數據）、`H.SERVICES`、`H.CLIENTS`、`H.TASKS`。
3. 改 `js/sim.js` 的流程邏輯（每個部門「做什麼會產生什麼」）。
4. 改 `index.html` 最上面的 `:root` 顏色與字型（CIS）。
5. 改 `js/world.js` 的桌位座標 `H.desks` 與區域家具；改 `js/assets.js` 的擺放清單。
6. 要接真資料：在 `sim.js` 的 `minute()` 裡把隨機事件換成讀 API／JSON。

## 加新模型

1. 到 https://kenney.nl/assets 下載任何 3D 包（CC0 可商用），或 Quaternius、Poly Pizza。
2. 把 `.glb` 放進 `assets/`（人物放 `assets/chars/`）。有外部貼圖的要把 `Textures/` 一起放。
3. 跑 `python3 scripts_bundle.py` 重新打包 `models.json`。
4. 在 `js/assets.js` 加一行：
   ```js
   add('模型檔名', x, z, 旋轉弧度, 縮放, 高度y, {材質名:'#顏色'}, [x0, z0, x1, z1 /* 擋路範圍 */]);
   ```
   Kenney 家具包是 1/2 比例（縮放 2），食物包約 2.5 倍（縮放 0.4–0.9），角色 0.78 高（縮放 2.3）。
5. 配色用材質名稱覆寫：Kenney 的材質叫 `wood`、`carpet`、`carpetBlue`、`metal`、`metalDark`、`lamp` 等，用 `node` 讀 GLB 的 JSON 區塊可以列出來。

## 發布到 claude.ai artifact

artifact 不接受 `.glb`，所以模型走 `models.json`（base64）。發布時附上：`js/*.js`、`assets/models.json`、`assets/Textures/colormap.png`、`assets/chars/models.json`、`assets/chars/Textures/colormap.png`。外部腳本只能來自 cdnjs / jsDelivr / unpkg，貼圖與資料要跟頁面一起發布。

## 部署到自己網域

純靜態檔案，丟到 Cloudflare Pages、GitHub Pages 或任何主機即可。`js/chars.js` 與 `assets.js` 可改回直接 `loader.load('assets/x.glb')`，不必打包。Ask Ace 的 Claude 功能要改成呼叫 Anthropic API（後端代理，不要把 key 放前端）。

## 操作

拖曳旋轉、右鍵拖曳平移、滾輪縮放、雙擊聚焦；點夥伴看資訊卡，雙擊或 F 鍵鏡頭跟隨；右鍵夥伴開選單；WASD 平移、Q/E 旋轉、R 重設、空白鍵暫停；羅盤按鈕導覽、喇叭按鈕音效。

## 授權

程式碼：專案內部使用。模型：Kenney（CC0），見 `assets/LICENSE-kenney.txt`、`assets/chars/LICENSE-kenney-mini.txt`。

## 車內視角與人物定位

點左側「北↑／南↓」直接坐進第 5 節觀景車廂，從座位透過玻璃窗看風景；拖曳可環顧。上車時若模擬暫停，會切回 1 倍速，離開後恢復原設定。停站倒數與車廂方向顯示於上方。

所有第一人稱視角上方均標示人物姓名或載具，並提供「切換／退出」。住宅門口使用包含島嶼變換的世界座標，避免回家路徑穿過虛空；4 位穿太空裝的太空人則刻意在島外漂浮，可點左側「太空」查看。

定位與車內視角回歸測試：啟動本機伺服器後執行 `node tests/view-grounding-smoke.cjs`（需 Playwright；可用 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 指定已安裝工具）。測試涵蓋住宅座標、員工往返地面／吊橋、實際上車按鈕、車內鏡頭跟隨、手機上方控制與太空人暫停。

## 豪宅社區與遊樂園

住宅島的 10 棟住宅皆為雙層玻璃別墅，含私人泳池、露台與室內家具。園區草地使用翠綠色；312 位動物遊客分為小豬、兔子、狐狸、大象、貓熊、鹿、企鵝與橘貓，以不同輪廓和斑紋辨識。

六攤美食市集各有老闆與 36 份陳列食物，老闆會端盤招呼客人。娛樂島旁新增 12 車廂摩天輪；雲霄飛車沿園區群島外圍高低起伏，3 組列車各有 6 節。左側「摩天輪／飛車」可聚焦，暫停會停止遊樂設施及老闆動作。

驗證：`node tests/world-upgrade-smoke.cjs`，另以 `tests/view-grounding-smoke.cjs` 驗證住宅往返路線、`tests/experiences-smoke.cjs` 驗證動物上下車與遊園流程。

## 網球俱樂部品質樣板

左側「球場」聚焦娛樂島網球俱樂部：細顆粒球場與步道、透空菱形圍網（西側保留員工入口）、三層看台與 12 位 Kenney 坐姿觀眾、球拍線、毛巾、水瓶及球籃。電子看板顯示實際練習擊球次數，不代表比賽比分。

四座投射燈隨園區日夜切換，球場使用一張 512px 局部陰影貼圖；近看自動隱藏棚頂，遠景隱藏觀眾與細小道具。暫停時選手視角看向對手。`tests/tennis-club-smoke.cjs` 檢查觀眾載入、日夜燈光、選手視角、對打與暫停以及手機聚焦按鈕。

## 精簡上方工具列

上方只保留「切換視角／暫停或繼續／更多」。園區聚焦、音效、重設與全螢幕放在「更多」；營運與 AI 操作、部門、時間與速度、KPI 收進可展開區塊。原有按鈕與事件保留，點外側或 Esc 關閉工具面板，手機版使用同一列精簡入口。
