// 未見過的 20 題：用真的 Gemini 跑一次，把回答原文存檔給人判讀。不自動判通過，對錯由人看原文決定。
// 執行：npx vitest run --config scripts/vitest.eval.config.mts scripts/unseen.eval.ts（需要 .env.local 的 GEMINI_API_KEY）
// 第二輪以後：設 UNSEEN_ROUND=round2，讀 docs/eval/unseen/round2/ 的題目，結果也存在那裡。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { ask, ROUTER_PROMPT } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { startIntake } from "@/lib/intake";
import { findVehicle } from "@/lib/vehicles";
import { sleep, withRetry } from "./retry";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");

const round = process.env.UNSEEN_ROUND;
if (round && !/^round\d+(?:_\w+)?$/.test(round)) throw new Error(`UNSEEN_ROUND 只能是 round2、round3…或 round8_final，收到：${round}`);
const DIR = new URL(`../docs/eval/unseen/${round ? `${round}/` : ""}`, import.meta.url);
type Q = { no: string; by: string; car: "wang" | "lin"; type: string; question: string; why: string };
const questions: Q[] = JSON.parse(readFileSync(new URL("unseen_questions.json", DIR), "utf-8"));

// 結果檔不覆蓋：已經跑過就停下，避免挑好的那次。
const out = new URL(`run_${new Date().toISOString().slice(0, 10)}.json`, DIR);
if (existsSync(out)) throw new Error(`${out.pathname} 已存在：每天只跑一次，不覆蓋舊紀錄`);
const results: unknown[] = [];

describe("未見過的 20 題", () => {
  for (const q of questions) {
    it(`${q.no} ${q.question}`, async () => {
      const vehicle = findVehicle(q.car)!; // 卡片預設狀態，和出題者看到的畫面相同
      await sleep(1_000);
      let raw = "";
      let ms = 0;
      const r = await ask(vehicle, q.question, async (s, u, signal, schema) => {
        const t0 = Date.now();
        const text = await withRetry(() => callGemini(apiKey, s, u, undefined, signal, schema));
        // 主回答和分類器平行：原回答只記主回答，時間取較慢的那個。
        if (s !== ROUTER_PROMPT) raw = text;
        ms = Math.max(ms, Date.now() - t0);
        return text;
      });
      results.push({ ...q, answer: r.answer, sources: r.sources, escalate: r.escalate, checkResult: r.checkResult, blockedReason: r.blockedReason, router: r.trace.router, intake: startIntake(r, q.question) !== undefined, aiRaw: r.checkResult === "攔下" ? raw : undefined, seconds: +(ms / 1000).toFixed(1) });
      console.log(`${q.no}｜${q.question}\n  回答：${r.answer}\n  來源：${r.sources.join(", ")}｜專員：${r.escalate}｜答案檢查：${r.checkResult}${r.blockedReason ? `（${r.blockedReason}）` : ""}｜${(ms / 1000).toFixed(1)} 秒`);
      expect(r.answer.length).toBeGreaterThan(0);
    }, 600_000);
  }
  afterAll(() => {
    if (results.length) writeFileSync(out, JSON.stringify({ model: "gemini（同正式站設定）", ranAt: new Date().toISOString(), results }, null, 1) + "\n");
  });
});
