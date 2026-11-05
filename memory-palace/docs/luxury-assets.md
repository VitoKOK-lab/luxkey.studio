# 憶境莊園的 Blender 資產

莊園建築、各室家具、四件擺件與三種機械動物均由 Blender 網格、材質及燈光構成。建築、擺件與管家各有可編輯場景，瀏覽器使用匯出的 GLB。編輯外觀時，房間與地標 ID 是既有記憶的固定地址，應予保留。

## 建築、材質與擺件

| 資產 | 內容 |
| --- | --- |
| `assets/memory-palace.blend` | 可編輯的建築、家具、花園、燈光與 25 組拍攝視角。落地玻璃使用折射透光材質，供 Cycles 算圖。 |
| `assets/memory-palace.glb` | 瀏覽器可行走的場景。匯出時按樓層、房間與材質分批合併網格，玻璃改用透明度混合以減少即時折射成本。 |
| `blender/luxury_details.py` | 生成窗框與五金、家具包邊與腳座、植栽與景觀收邊等可編輯網格。 |
| `blender/luxury_materials.py` | 生成八組無縫 PBR 材質，並依實體尺寸配置 UV。洞石、石灰岩、Calacatta 大理石、橡木、胡桃木、圈絨、天鵝絨、拉絲青銅各有一張底色、法線與粗糙度貼圖，共 24 張 512 × 512 PNG。 |
| `assets/accessories/accessories.blend` | 絨毛熊、月光燈、陶盆綠植與水晶簇，各有獨立集合與可編輯零件。 |
| `assets/accessories/*.glb` | 四件擺件的即時模型，帶有可換色的材質。 |

建築使用象牙白石材、淺橡木、鼠尾草綠布面與香檳金五金，日光以柔和的漫射光為主。原始貼圖位於 `assets/textures/`，也封裝在可編輯建築場景內。絨毛熊有縫線與黃銅吊牌，月光燈有月面紋理、銅環和黑石底座，陶盆內有土面、樹皮和帶葉脈的彎曲葉片，水晶簇以多顆獨立切面晶體組成。

## 室內與動線照明

`blender/lighting_design.py` 定義吊燈、閱讀燈、牆面照明與動線引導燈。重建時，燈具網格與 Cycles 光源寫入 Blender 場景，燈具網格隨 GLB 匯出，光源位置、方向、色彩與照明範圍另存為 `assets/lighting-manifest.json`。清單涵蓋 24 個房間與 10 個動線區，共 285 個光源配置。

瀏覽器依視角、樓層和位置挑選附近光源，重用 5 盞點光源與 6 盞聚光燈。穩定時最多啟用 9 盞，另外兩個位置留給淡入淡出。主要聚光燈使用一張快取的陰影貼圖，並在光源或視角切換時更新。「風格」裡的「莊園照明」會以 70% 至 150% 的設定值調整即時燈光，涵蓋室內燈具與花園引路燈。

## 瀏覽器場景風格

`app/material-styles.js` 依 GLB 的具名材質設定石材、木作、金屬、玻璃、織物及燈具表面的底色、粗糙度、金屬度和自發光。原有貼圖、UV 與玻璃透明度保留，回到柔和日光會復原原始材質參數。這些變更發生在瀏覽器的可行走場景，Cycles 圖集可透過獨立的「圖集色調」預覽。

`app/render-style.js` 依風格調整環境光、主光與輪廓光，室內由附近燈具提供分層照明。柔和日光、科幻和賽博龐克直接渲染，黑白、復古電影和美式卡通分別加上灰階、靜態膠片顆粒和描邊。場景已移除全畫面霧狀覆層，風格背景色顯示在場景輪廓之外。

## 機械動物管家

| 資產 | 內容 |
| --- | --- |
| `assets/stewards/robot-animals.blend` | 三種機械動物的可編輯場景，含獨立零件、關節、材質與棚拍燈光。 |
| `assets/stewards/robot-dog.glb` | FERN（花園）及 NOA 精修版載入失敗時的機械狗模型。 |
| `assets/quality/robot-noa.glb` | NOA（迎賓）的獨立精修模型；保留原本具名關節與眼睛視角。 |
| `assets/stewards/robot-cat.glb` | MUSE（人生）與 SOLA（靜心）的機械貓模型。 |
| `assets/stewards/robot-owl.glb` | INDEX（知識）與 VEGA（遠景）的機械貓頭鷹模型。 |

瀏覽器載入三種共用動物與 NOA 的獨立 GLB，建立六位管家的模型與識別燈色。Three.js 依具名關節控制步態、轉頭、眨眼及耳、尾或翼的動作。管家停在地標時會稍微轉頭。眼睛視角取自模型靜止時的 `EyeCamera` 位置，鏡頭會跟隨路線位置和管家朝向。開啟減少動態效果時，模型維持靜止姿勢並繼續沿路移動。

每位管家獨立執行自己的待辦，六位可同時沿固定路線出發、停留地標與返回原位。行程面板提供六個狀態按鈕供切換跟隨對象，背景行程更新時保留當前鏡頭。

## Cycles 算圖

建築算圖位於 `assets/renders/`，索引檔為 `assets/renders/index.json`。建築全景與 24 個空間各有一張獨立算圖，並可從本機圖庫開啟原尺寸 PNG。[本機圖庫](http://127.0.0.1:8765/renders.html)

| 視角 | 張數 | 尺寸 | Cycles 採樣上限 |
| --- | ---: | --- | ---: |
| 建築全景 | 1 | 2400 × 1800 | 128 |
| 迎賓大廳、知識書房、靜心室、星象閣 | 4 | 1920 × 1440 | 96 |
| 其餘室內與戶外空間 | 20 | 1280 × 960 | 64 |
| 四件擺件棚拍 | 1 | 1800 × 1000 | 72 |
| 三種機械動物合照 | 1 | 1800 × 1000 | 56 |

擺件棚拍存於 `assets/accessories/accessory-preview.png`，機械動物合照存於 `assets/stewards/robot-animals-preview.png`。`assets/stewards/live-preview.jpg` 記錄六位管家在瀏覽器中的畫面，`assets/first-person-preview.jpg` 記錄瀏覽器第一視角畫面；`assets/lighting-preview.jpg` 記錄室內照明，`assets/render-style-preview.jpg` 展示風格與燈光控制。

新版瀏覽器畫面可看 [六種場景風格對照](../assets/style-comparison.jpg)與[管家並行行程面板](../assets/concurrent-stewards-preview.jpg)。

## 重建

### 迎賓大廳與 NOA 精修樣板

`blender/build_hall_quality.py` 以原始莊園為基礎，另存 `assets/quality/hall-quality.blend`。新的石板拼縫、地面鑲嵌、木作櫃檯、深色檯面、招牌與入口燈籠都由網格構成。原始建築、房間和地標清單不改寫；其他空間仍使用原版。

大廳以 Cycles 射線烘焙 2048 × 2048 的環境遮蔽貼圖，使用獨立的第二組 UV，保留原有底色、法線和粗糙度貼圖。這張 AO 圖提供接縫和家具接觸處的陰影，封裝在 GLB 與 Blender 原檔內。瀏覽器使用即時分層照明加上 AO；完整的間接光反彈出現在 Cycles 算圖中，目前沒有把整套間接光烘焙到瀏覽器。

瀏覽器成功載入 `hall-quality.glb` 後，會隱藏原模型中標記為 `room_id=hall` 的視覺網格。原網格仍保留給行走碰撞，地標與路線不變；新網格參與樓層切片、風格切換和地標遮擋。載入失敗時保留原版大廳。觸控小螢幕使用較低的像素倍率和貼圖斜角濾波預算，模型位置與記憶地址一致；這是繪圖負擔調整，手機連線仍待後續實作。

`blender/build_noa_quality.py` 產生 NOA 獨立原檔及 GLB。陶瓷分片、外殼接縫、關節軸承、腳墊與鏡頭分層均為幾何細節；三種表面共帶有六張 256 × 256 的法線／粗糙度貼圖。網頁版約 4.8 萬三角形，保留原機械狗的 17 個具名節點位置與階層，既有步態和眼睛視角可直接使用。其餘五位管家保留原版。

兩張新圖為 `assets/renders/quality-hall.png`（1680 × 1050）和 `quality-noa.png`（1600 × 1000），各採 Cycles 64 樣本上限。圖庫的「細節樣板」獨立展示兩件新作，舊版 25 張空間算圖仍保留。

```sh
PALACE_METAL=1 blender --background --python-exit-code 1 --python blender/build_hall_quality.py
NOA_METAL=1 blender --background --python-exit-code 1 --python blender/build_noa_quality.py
```

若沒有可用的 Metal GPU，省略環境變數即可使用 CPU。樣板所有貼圖封裝於原檔和 GLB，無須另行尋找貼圖資料夾。從 Blender 手工修改過的樣板請先另存；重建會覆寫同名樣板檔。

### 原始莊園與共用模型

在專案資料夾執行下列命令。從 Blender 內修改過的場景請先另存，重建會覆寫生成的場景與圖檔。`PALACE_SKIP_RENDER=1` 會在重建建築時跳過一次全景算圖，下一個算圖步驟會產出全景。

```sh
PALACE_SKIP_RENDER=1 blender --background --python-exit-code 1 --python blender/build_palace.py
blender --background --python-exit-code 1 --python blender/build_accessories.py
blender --background --python-exit-code 1 --python blender/build_robot_animals.py
blender --background --python-exit-code 1 --python blender/render_estate.py
```

若使用 macOS 的 Blender.app，且終端找不到 `blender`，可使用 `/Applications/Blender.app/Contents/MacOS/Blender`。支援 Cycles Metal 的 Mac 可在命令前加入 `PALACE_METAL=1`，讓 Blender 使用 GPU 算圖。重算個別房間時，以逗號分隔房間 ID。

```sh
PALACE_METAL=1 blender --background --python-exit-code 1 --python blender/render_estate.py -- --only hall,library
```

重建管家時，可在命令尾端加入 `-- --no-render`，只輸出可編輯場景和 GLB。支援 Cycles Metal 的 Mac 可在管家重建命令前加上 `STEWARD_METAL=1`。

算圖完成後執行 `python3 scripts/package_template.py`，即可生成包含場景、照明清單、擺件、管家、貼圖與圖庫的本機分享 ZIP。封裝採檔名允許清單，私人資料庫、對話、上傳截圖、設定金鑰和 Blender 暫存備份留在本機。
