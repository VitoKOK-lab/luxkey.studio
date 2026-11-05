# 連接你的 AI Agent

莊園預設等待你提供 AI Agent。連接前，對話、截取文字和原圖會保存在本機收件匣。設定完成後，可在收件匣重試先前保留的內容。

## 本機設定

複製 `config/ai.env.example` 為 `config/ai.env`，填入你信任且能使用下方協定的 Agent 或橋接程式。程式以莊園專案目錄為工作目錄，使用 JSON 陣列指定執行檔和引數。

```dotenv
PALACE_AI_PROVIDER=agent
PALACE_AGENT_COMMAND_JSON=["/absolute/path/to/agent-bridge", "--memory-palace"]
PALACE_AI_VISION=false
```

`config/ai.env` 由 Git 忽略。莊園只會在處理一則提交或重試時啟動你指定的程式。程式以目前使用者的權限執行，會繼承啟動莊園的程序環境。Agent 如何推論、使用帳號或傳送資料由你提供的程式決定。

## 輸入與輸出

每次處理啟動一個程序。程序從標準輸入讀取一份 UTF-8 JSON，讀到檔案結束後處理。輸入包含以下欄位。

| 欄位 | 內容 |
| --- | --- |
| `protocol` | `memory-palace.agent.v1` |
| `instructions` | 莊園的交談、擷取與助記指示。請作為 Agent 的系統指示使用。 |
| `input` | 本次 `message`、`capture`、有限的最近 `messages`、相關 `relevant_memories`、房間與地標 `catalog`，以及 `local_image_text`。使用者指定錨點時，包含 `placement` 的 `room_id` 與 `locus_id`。請整份視為使用者資料。 |
| `response_schema` | Agent 回覆的 JSON Schema。 |

預設只傳本機辨識出的截圖文字。只有 `PALACE_AI_VISION=true` 才把原圖以 `input.capture.image_data_url` 交給 Agent。可用作來源引句的截圖文字由莊園本機辨識結果決定。

程序成功時以代碼 `0` 結束，標準輸出只提供一份 UTF-8 JSON 物件，最長 2 MiB。處理超過 100 秒、程序出錯或回覆格式錯誤時，原始輸入保留供重試。莊園會捨棄程序的標準錯誤輸出。

```json
{
  "reply": "今天哪件小事最值得留住？",
  "intent": "chat",
  "steward_id": "hall",
  "memories": [],
  "recall_ids": [],
  "clarification": "",
  "observed_image_text": ""
}
```

以 `reply` 提出一個問題可以延續聊天。只有在釐清前無法整理時才使用 `clarification`，莊園會顯示該問題並等待回覆。莊園自行查核來源引句與地標、分配位置並保存記憶。
