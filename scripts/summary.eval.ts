// 檢查結果摘要實測：用真的 Gemini 對每台車產生 3 次摘要，印出結果，答案檢查都要通過。
// 執行：npm run eval:21（和 21 題一起跑；需要 .env.local 裡的 GEMINI_API_KEY）
import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { vehicles } from "@/lib/vehicles";
import { sleep, withRetry } from "./retry";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");


describe("檢查結果摘要（真的 Gemini）", () => {
  for (const v of vehicles) {
    for (const n of [1, 2, 3]) {
      it(`${v.owner} 第 ${n} 次`, async () => {
        await sleep(1_000); // 付費版沒有每分鐘 15 次的限制，稍微間隔就好
        const r = await summarize(v, (system, user) => withRetry(() => callGemini(apiKey, system, user)));
        console.log(`${v.owner} #${n}｜${r.checkResult}${r.blockedReason ? `（${r.blockedReason}）` : ""}｜${r.answer.length} 字\n${r.answer}\n`);
        expect(r.checkResult).toBe("通過");
      }, 600_000); // 限流時會等好幾輪重試
    }
  }
});
