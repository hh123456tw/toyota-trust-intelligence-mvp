// 21 題實測：用真的 Gemini 跑 測試題_追問AI.md，每題印出通過／失敗和實際回答。
// 執行：npm run eval:21（需要 .env.local 裡的 GEMINI_API_KEY）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ask/route";
import { sourceLabel, presetsFor } from "@/lib/answers";
import { ask } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { findVehicle } from "@/lib/vehicles";
import { checkCase, parseQuestions } from "./questions";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定 GEMINI_API_KEY=<你的金鑰> 後再執行 npm run eval:21");

const questions = parseQuestions(readFileSync(new URL("./測試題_追問AI.md", import.meta.url), "utf-8"));

// 沒有金鑰時的 API 路由行為（第 20、21 題）。
async function withoutKey<T>(fn: () => Promise<T>): Promise<T> {
  delete process.env.GEMINI_API_KEY;
  try {
    return await fn();
  } finally {
    process.env.GEMINI_API_KEY = apiKey;
  }
}

function post(question: string, ip: string) {
  const req = new Request("http://local/api/ask", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify({ vehicleId: "wang", question }),
  });
  return POST(req as never);
}

describe("21 題實測", () => {
  for (const q of questions.filter((q) => q.no <= 19)) {
    it(`#${q.no} ${q.question}`, async () => {
      const vehicle = findVehicle(q.vehicleId)!;
      await new Promise((ok) => setTimeout(ok, 4_500)); // 免費額度每分鐘 15 次
      let raw = "";
      const r = await ask(vehicle, q.question, async (s, u) => (raw = await callGemini(apiKey, s, u)));
      const problems = checkCase(q.no, r);
      console.log(
        `#${q.no} ${problems.length ? "失敗" : "通過"}｜${q.question}\n  預期：${q.expected}\n  回答：${r.answer}\n  來源：${r.sources.join(", ")}｜專員：${r.escalate}｜答案檢查：${r.checkResult}${r.blockedReason ? `（${r.blockedReason}）` : ""}${r.checkResult === "攔下" ? `\n  AI 原回答：${raw}` : ""}${problems.length ? `\n  問題：${problems.join("；")}` : ""}`,
      );
      expect(problems).toEqual([]);
    });
  }

  it("#20 拔掉金鑰：API 回友善錯誤，3 顆常見問題都有預寫回答和來源", async () => {
    const res = await withoutKey(() => post("煞車下個月再換可以嗎？", "eval-20"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/常見問題/);
    const presets = presetsFor("wang");
    expect(presets).toHaveLength(3);
    for (const p of presets) {
      expect(p.answer.sources.length).toBeGreaterThan(0);
      for (const s of p.answer.sources) expect(sourceLabel(findVehicle("wang")!, s)).toBeDefined();
    }
  });

  it("#21 一分鐘內連問很多次：觸發次數限制，回友善提示", async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    await withoutKey(async () => {
      for (let i = 0; i < 8; i++) {
        last = await post("煞車狀況怎麼樣？", "eval-21");
        statuses.push(last.status);
      }
    });
    expect(statuses.at(-1)).toBe(429);
    expect((await last!.json()).error).toMatch(/稍等/);
  });
});
