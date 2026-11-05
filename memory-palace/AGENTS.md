# 憶境莊園

## User preferences

- Modern glass castle / manor, three floors, floor-to-ceiling glazing, gardens, advanced technology.
- Architecture and objects should have a luxurious finish with close-up Blender geometry, textured materials, and actual rendered deliverables. Preserve the editable Blender source; visually review both Cycles renders and browser output.
- 莊園是讓人安心的夢境空間，接納所有回憶，也保留收藏、回訪與可逆封存的選擇。預設採象牙白、淺木、鼠尾草綠、香檳金與柔和日光，介面保持明亮易讀。可選風格可以使用暗色與賽博龐克燈光，使用者可隨時切回柔和日光。
- 使用者不喜歡過亮、泛白和輪廓不清的場景。保持中間調、可辨識的外殼轉折、關節與地面接觸感；不要用增加全域補光來替代局部照明。管家的陶瓷配色不能自發光，只有眼睛與真正的指示燈發光。
- Butler is an efficient AI robot dog. Traditional Chinese interface.
- Animal stewards include mechanical dogs, cats, and owls with gentle expressive movement. Six existing steward identities and district responsibilities remain stable; animal meshes must have editable Blender sources and real rendered previews.
- Store memories on this Mac first. Cloud synchronization is a later extension.
- Shared architecture, individually furnished dream spaces. Keep decor configuration separate from stable memory addresses and personal memories.
- Mobile diary and recall are intended uses. Cross-device access and individual login are future work; never describe loopback-only access as phone connectivity.
- Use stronger reasoning for architecture and difficult decisions. Delegate routine implementation to a lower-cost model when supported. Do not claim to change the main chat model without verification.

## Project boundaries

- `blender/` is the source of the actual editable scene; `assets/` contains `.blend`, `.glb`, preview and scene manifest.
- Stable room and locus IDs are memory addresses. Preserve them when changing visual design.
- `data/` contains private local memory data; keep it out of Git and hosted builds.
- Keep original versions. Archival is reversible; do not silently rewrite user memories.
- Primary interaction is AI conversation and capture (speech, pasted conversations, text files, screenshots), not manual memory forms. Six stewards physically walk to memories.
- The user will supply an AI Agent later. Default to an explicitly configured local command using `memory-palace.agent.v1`; HTTP API providers are optional transports. Until configured, retain inputs as awaiting-API inbox items; do not simulate intelligence with keyword rules or reuse another signed-in account.
- Preserve transcript/source, factual extraction, and imaginative mnemonic as distinct records. Use fixed ordered routes, distinct landmarks, active recall and route familiarization.
- User explicitly authorized automatic placement of submitted conversation/captures. Whole-account transcript scraping, global agent configuration, cloud sync and scheduled surveillance remain outside this request.
- The current interface has four scene views: overview, human first person, follow-steward third person, and steward POV. Human navigation should support the complete fixed estate and preserve stable memory addresses.
- 六位管家可同時行走。每位管家依派遣順序處理自己的待辦，回到原位才開始下一趟。行程面板提供六個可切換跟隨對象的狀態按鈕，並顯示執行中與待辦數量。背景行程的進度和完成事件不會切換跟隨對象。
- 第三人稱只平滑跟隨管家的位移，觀看方向由使用者拖曳控制。管家第一人稱的自動水平轉向上限為每秒 25°，手動上限 45°，同時轉向上限 50°。開啟系統的「減少動態效果」時，第一人稱只在使用者拖曳時轉向。進出跟隨或切換管家時直接切換鏡頭，省去長距離飛移。
- 「風格」調整建築表面的 3D 材質和場景燈光，保留原貼圖、玻璃透明度和個人擺件設定。場景維持無全畫面霧層。柔和日光、科幻和賽博龐克直接繪製場景，黑白、復古電影與美式卡通分別用 GPU 後製補上灰階、靜態顆粒與描邊。預覽可取消或儲存，以本機外觀設定 `render_style` 儲存 `original`、`scifi`、`mono`、`cyberpunk`、`film` 或 `cartoon`，既有版本 1 佈置預設為 `original`。圖集的「圖集色調」獨立預覽，保留原始 Blender 算圖連結。
- 室內需要可辨識家具、材質和地標的分層照明。`blender/lighting_design.py` 同時定義實體燈具、Cycles 光源與 `assets/lighting-manifest.json`；瀏覽器以固定光源池選取附近燈具，使用一盞快取陰影的聚光燈。保持閱讀與環境燈色中性，風格色只混入重點燈。`lighting_level` 是 0.7～1.5 的本機外觀設定，舊版缺省為 1；花園引路燈也隨此亮度調整。
- Use Python standard library for persistence/API and locally installed Three.js for display.
- 瀏覽器燈具依用途校正強度：ambient ×0.36、task ×0.65、accent ×0.60、path ×1，再乘以使用者亮度。Blender／manifest 原值維持不變。`steward-appearance.js` 只校正即時材質，保留模型幾何與六區配色；柔和接觸陰影跟隨行走高度，斜坡時隱藏，且不參與點選或陰影快取。
- 靜心介面使用獨立的 `meditation.js`、`meditation.css` 與 Canvas 2D 水景 `meditation-water.js`。保留潮汐、漣漪、靜光三種風景及 3／5／10 分鐘計時；暫停、關閉、隱藏分頁或減少動態效果時停止水景動畫。隱藏分頁時時間仍繼續，顯示後依實際經過時間更新。靜心覆蓋莊園時略過底層 WebGL 渲染，但管家仍繼續行程。不得將靜心畫面的引導描述成醫療效果。
- Tests should use temporary databases, never the personal vault.
- 迎賓大廳與 NOA 的精修樣板位於 `assets/quality/`，由 `blender/build_hall_quality.py`、`blender/build_noa_quality.py` 獨立重建。大廳 GLB 帶有真實烘焙的第二組 UV AO，成功載入才隱藏原 hall 視覺網格；原網格留給碰撞，且不能被樓層切片重新顯示。保留材質後綴 ` · Hall quality` 的風格辨識和所有貼圖。NOA 保留 17 個具名節點與原眼睛位置，另五位仍用原模型。瀏覽器使用 AO 與即時照明，Cycles 圖片才有完整間接光，不要宣稱全莊園已升級或瀏覽器已有烘焙 GI。
- Sharing uses an allowlisted code/model template or cosmetic-only design export. Do not include vaults, conversations, screenshots, API keys or logs in share packages. The shared template is published under VitoKOK-lab/luxkey.studio/memory-palace; runtime data stays local.

## Checks

後端改動執行 `python3 -m unittest discover -s tests -v`。前端改動執行 `node --check app/main.js` 和相關模組的語法檢查，再以本機瀏覽器檢查操作。跟隨鏡頭、管家排程、燈光和場景材質的自動測試可一起執行 `node --test tests/*.test.js`。Blender 場景或正式算圖有改動時，需重新渲染並逐張檢查。
