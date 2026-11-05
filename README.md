# A.C.E. Garden Atelier

全新平地庭院辦公室，取代原本的浮島與營運模擬。

- 單層室內 22 × 15 公尺（330 平方公尺，約 100 坪），12 個工作席位、12 位同事。
- 玻璃立面、可開啟屋頂、天窗、石材地坪、木質工作桌、會議區、接待與休息區。
- 前院、花園、兩輛原創豪華旅行跑車、6 × 12 公尺泳池、躺椅，以及狗和貓各一隻。
- 正常比例的程序化人物與動物、程序化表面材質、動畫水面、日光／暮色、實體陰影。
- 介面只保留空間視角、屋頂與光線控制；沒有營運數值、部門、AI 工作台或遊樂園。

## 開發

純靜態網站，無建置步驟、API、金鑰或第三方網路依賴。

```sh
python3 -m http.server 8899
```

`index.html` 與 `atelier.css` 是介面；`js/atelier*.js` 分別建立基礎場景、建築、人物景觀與互動。Three.js 0.147.0 與 OrbitControls 隨站提供於 `vendor/`，授權見 `vendor/THREE-LICENSE.txt`。

世界單位為公尺。靜態網格依材質合併繪製；人物頭部、動物尾巴、水面與可切換屋頂保留獨立更新。陰影只在初次繪製、切換屋頂或光線時重算。手機限制像素比，作業系統減少動態設定會關閉環繞與環境動畫。這是可即時旋轉的風格化建築視覺化，並非離線寫實渲染。

## 驗證

需要 Playwright 與 Chromium；可用 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 指定安裝位置。

```sh
TEST_URL=http://127.0.0.1:8899 node tests/atelier-smoke.cjs
```

驗證場景載入、12 位同事與工作席位、人物在建築內、全景／辦公室／泳池／前院的鏡頭移動、光線與屋頂切換、手機操作、無舊介面及執行錯誤，並輸出截圖至 `/tmp`。

## 發布

將儲存庫根目錄作為 GitHub Pages 或 Cloudflare Pages 的靜態發布目錄，不需要建置指令。

## 憶境莊園 · Memory Palace

[記憶莊園](memory-palace/README.md) 是獨立的本機應用：24 個房間、192 個記憶地標、六位機械動物管家，以及可編輯的 Blender 建築與 NOA 精修模型。原有 A.C.E. Garden Atelier 網站保留在根目錄。

```sh
cd memory-palace
npm ci
python3 scripts/launch.py
```

啟動後開啟 http://127.0.0.1:8765/ 。需要 Python 3.10+ 與 Node.js；只有編輯模型時才需要 Blender。

記憶莊園使用 Python／SQLite 本機服務，不能直接以 GitHub Pages 執行完整功能。此處保存程式、共用場景、算圖與 Blender 原檔，不含私人記憶、對話、附件或金鑰。Cloudflare 線上版已提供登入與每帳號雲端保存：[開啟憶境莊園](https://luxkey-memory-palace.vitokok.workers.dev/)。手機與電腦可使用同一帳號；既有 Mac 資料不會自動上傳，Claude 管家已接入，支援引導對話、記憶安放與回想。

- [大廳與 NOA 精修資產](memory-palace/assets/quality/)
- [大廳 Cycles 算圖](memory-palace/assets/renders/quality-hall.png)
- [NOA Cycles 算圖](memory-palace/assets/renders/quality-noa.png)
- [AI Agent 連接協定](memory-palace/docs/agent-protocol.md)
