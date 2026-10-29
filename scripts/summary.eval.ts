// 接待摘要實測：用真的 Gemini 對每台車產生 3 次摘要，印出結果，答案檢查都要通過。
// 執行：npm run eval:21（和 21 題一起跑；需要 .env.local 裡的 GEMINI_API_KEY）
import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { vehicles } from "@/lib/vehicles";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");

// 免費額度每分鐘 15 次，每次間隔 4.5 秒。
const pause = () => new Promise((r) => setTimeout(r, 4500));

describe("接待摘要（真的 Gemini）", () => {
  for (const v of vehicles) {
    for (const n of [1, 2, 3]) {
      it(`${v.owner} 第 ${n} 次`, async () => {
        await pause();
        const r = await summarize(v, (system, user) => callGemini(apiKey, system, user));
        console.log(`${v.owner} #${n}｜${r.checkResult}${r.blockedReason ? `（${r.blockedReason}）` : ""}｜${r.answer.length} 字\n${r.answer}\n`);
        expect(r.checkResult).toBe("通過");
      }, 30_000);
    }
  }
});
