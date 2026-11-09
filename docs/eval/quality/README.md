# 好用度評測

目的：衡量 AI 助理對一般車主好不好用、像不像真人助理。用來比較改版前後。這份不測安全。

## 檔案

- `questions.json`：40 題。由 Claude Haiku subagent 出題，它只讀 `src/lib/vehicles.ts` 和 `README.md`，沒有讀 `ask.ts` 和提示詞。原文照收，沒有改字。
  - 分佈：卡片內 15、多輪 8 組（每組 3 句）、症狀 6、閒聊或情緒 5、卡片外 4、其他服務 2。
  - 多輪題的 `turns` 依說話順序；最後一句是評分的那句。
- `rubric.md`：評分標準。每題 4 項各 1–5 分，加一句「客人看了會怎麼想」。
- `run_baseline_d0e574e.json`：t37-patch 的基準回答。檔內 `commit` 是 53e66fc，它的 `src/` 和 d0e574e 相同（只多評測紀錄）。
- `run_baseline_v37_cbfe4da.json`：v37（cbfe4da）的基準回答。v37 沒有對話記憶，多輪題只送最後一句，結果標 `onlyLast: true`。
- `run_baseline_freeze_479b6a3.json`：凍結版（479b6a3）的基準回答。有分類器，沒有對話記憶，多輪題同樣只送最後一句，標 `onlyLast: true`。
- `單評_baseline.md`：開發用 AI 的快速打分。只有一位評分者，而且知道版本，**不是盲評**，只當參考。

## 執行

```
QUALITY_OUT=run_<標籤>.json npx vitest run --config scripts/vitest.eval.config.mts scripts/quality.eval.ts
```

- 需要 `.env.local` 的 `GEMINI_API_KEY`。和正式站同一個模型。
- `QUALITY_OUT` 指定輸出檔名，要像 `run_xxx.json`。檔案已存在就停下，不覆蓋。
- 每題跑 1 次。多輪題依序送出，每一句帶車主前幾句原文（最多 3 句，不帶 AI 回答），和正式站前端一樣。
- 呼叫上限 120 次：先估呼叫數，超過就不跑；跑的時候超過也會停下，那一題記錯誤，不產生假回答。
- 紀錄每一句的完整回答、來源、是否轉專員、答案檢查結果、分類器結果、症狀登記題目、秒數。
- 腳本不在 `npm run eval:21` 範圍內。
- 換分支重跑：把 `scripts/quality.eval.ts` 和 `docs/eval/quality/questions.json` 複製到那個版本，設不同的 `QUALITY_OUT`。沒有 `HISTORY_MAX`（對話記憶）或 `ROUTER_PROMPT`（分類器）的舊版本也能跑。

## A/B 盲評（之後做）

1. 把兩版的結果檔逐題配對。每題用亂數決定哪一版標 A、哪一版標 B。對照表（題號 → A 是哪版）另存，不給判讀者。
2. 盲評包只放：車子、題號、類別、多輪的前幾句、A 的回答、B 的回答（含症狀登記題目）、`rubric.md`。拿掉 commit、檔名、`onlyLast` 這類會透露版本的欄位。
3. 判讀者兩位，各自判讀，填完前不看對方：
   - Codex gpt-6.1-sol：把盲評包放在一個空資料夾，執行
     `codex exec -m gpt-6.1-sol -s read-only -C <dir> -o <file> -`，提示詞從 stdin 傳入。
   - Claude Fable：用 subagent，只准讀盲評包。
4. 每位判讀者對 A、B 各打 4 項分數和一句話，最後選「整體比較好用的是 A／B／一樣」。
5. 兩份交齊後才解盲。報告寫：兩版四項平均分（分判讀者列）、偏好票數、兩位意見不同的題目。
6. 第 (d) 項任一位給 1 分的題目，逐題列出原文和理由。

## 已知限制

- 出題者是 AI，不是真的車主。
- 每題只跑 1 次，Gemini 每次回答會不同。
- v37 和 479b6a3 沒有對話記憶，多輪題只送最後一句，和新版不同條件；比較時多輪題另外列。
