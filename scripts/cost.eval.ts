// AI 成本實測：用真的 Gemini 跑王先生「1 次檢查結果摘要＋3 題追問」，讀回應的 usageMetadata 算每台車成本。
// 執行：npm run eval:cost（需要 .env.local 裡的 GEMINI_API_KEY；npm run eval:21 不跑這支）
// 結果整理在 docs/eval/cost.md。
import { describe, expect, it } from "vitest";
import { ask, summarize } from "@/lib/ask";
import { callGemini, type GeminiUsage } from "@/lib/gemini";
import { findVehicle } from "@/lib/vehicles";
import { withRetry } from "./retry";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");

// gemini-3.5-flash-lite 付費版 Standard，每百萬 token 美元。出處：https://ai.google.dev/gemini-api/docs/pricing（2026-11-08 查詢）
const USD_PER_M_INPUT = 0.3;
const USD_PER_M_OUTPUT = 2.5; // 含 thinking token
const TWD_PER_USD = 32; // 假設匯率
const ROUNDS = 3;
const QUESTIONS = ["電瓶為什麼衰退得比較快？", "我下週要載家人出遠門，輪胎可以嗎？", "煞車下個月再換可以嗎？"];

export const costUsd = (input: number, output: number) => (input * USD_PER_M_INPUT + output * USD_PER_M_OUTPUT) / 1e6;

describe("AI 每台車成本（真的 Gemini）", () => {
  it("公式自我檢查：100 萬輸入＋100 萬輸出＝0.3＋2.5 美元", () => {
    expect(costUsd(1e6, 1e6)).toBeCloseTo(2.8, 10);
  });

  it(`王先生：1 摘要＋3 追問，跑 ${ROUNDS} 輪`, async () => {
    const vehicle = findVehicle("wang");
    if (!vehicle) throw new Error("找不到王先生的車");
    const rows: { round: number; call: string; input: number; output: number }[] = [];

    for (let round = 1; round <= ROUNDS; round++) {
      const calls: [string, (ai: (s: string, u: string) => Promise<string>) => Promise<unknown>][] = [
        ["摘要", (ai) => summarize(vehicle, ai)],
        ...QUESTIONS.map((q): [string, (ai: (s: string, u: string) => Promise<string>) => Promise<unknown>] => [q, (ai) => ask(vehicle, q, ai)]),
      ];
      for (const [call, run] of calls) {
        // 追問會呼叫兩次（主回答＋分類器），token 數相加。
        const usage: GeminiUsage = {};
        const add = (u: GeminiUsage) => {
          for (const k of ["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "totalTokenCount"] as const) usage[k] = (usage[k] ?? 0) + (u[k] ?? 0);
        };
        await run((system, user) => withRetry(() => callGemini(apiKey, system, user, add)));
        const input = usage.promptTokenCount ?? 0;
        const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
        expect(input, `${call} 沒有回傳 token 數`).toBeGreaterThan(0);
        rows.push({ round, call, input, output });
        console.log(`#${round}｜${call}｜輸入 ${input}｜輸出 ${output}（含 thinking ${usage.thoughtsTokenCount ?? 0}）`);
      }
    }

    const perCar = (round: number) => rows.filter((r) => r.round === round);
    const sum = (rs: typeof rows, k: "input" | "output") => rs.reduce((a, r) => a + r[k], 0);
    const cars = Array.from({ length: ROUNDS }, (_, i) => perCar(i + 1));
    const avgIn = cars.reduce((a, c) => a + sum(c, "input"), 0) / ROUNDS;
    const avgOut = cars.reduce((a, c) => a + sum(c, "output"), 0) / ROUNDS;
    const usd = costUsd(avgIn, avgOut);
    const monthCars = 15 * 25;
    console.log(
      [
        `每台車平均：輸入 ${avgIn.toFixed(0)}、輸出 ${avgOut.toFixed(0)} token`,
        ...cars.map((c, i) => `  第 ${i + 1} 輪：輸入 ${sum(c, "input")}、輸出 ${sum(c, "output")}、${costUsd(sum(c, "input"), sum(c, "output")).toFixed(6)} 美元`),
        `每台車成本：${usd.toFixed(6)} 美元 ≈ ${(usd * TWD_PER_USD).toFixed(4)} 新台幣`,
        `每位專員每月（15 台 × 25 天＝${monthCars} 台）：${(usd * monthCars).toFixed(4)} 美元 ≈ ${(usd * monthCars * TWD_PER_USD).toFixed(2)} 新台幣`,
      ].join("\n"),
    );
  }, 600_000);
});
