// 21 題實測：用真的 Gemini 跑 測試題_追問AI.md，每題印出通過／失敗和實際回答。
// 執行：npm run eval:21（需要 .env.local 裡的 GEMINI_API_KEY）
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ask/route";
import { sourceLabel, presetsFor } from "@/lib/answers";
import { ask } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { limitFromEnv, PER_IP_WITHOUT_ID, PER_VISITOR } from "@/lib/rateLimit";
import { applyPreferences } from "@/lib/preferences";
import { findVehicle } from "@/lib/vehicles";
import { checkCase, parseQuestions } from "./questions";
import { sleep, withRetry } from "./retry";

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

function post(question: string, ip: string, visitorId?: string) {
  const req = new Request("http://local/api/ask", {
    method: "POST",
    headers: { "x-forwarded-for": ip, ...(visitorId ? { "x-visitor-id": visitorId } : {}) },
    body: JSON.stringify({ vehicleId: "wang", question }),
  });
  return POST(req as never);
}

describe("21 題實測", () => {
  for (const q of questions.filter((q) => q.no !== 20 && q.no !== 21)) {
    it(`#${q.no} ${q.question}`, async () => {
      const base = findVehicle(q.vehicleId)!;
      // 題目要改偏好時，和 API 一樣經過 applyPreferences；格式錯就讓這題失敗，不偷偷用預設。
      const vehicle = q.preferences ? applyPreferences(base, { ...base.preferences, ...q.preferences }) : base;
      if (!vehicle) throw new Error(`第 ${q.no} 題的偏好格式不正確：${JSON.stringify(q.preferences)}`);
      await sleep(1_000); // 付費版沒有每分鐘 15 次的限制，稍微間隔就好
      let raw = "";
      let ms = 0;
      const r = await ask(vehicle, q.question, async (s, u) => {
        const t0 = Date.now();
        raw = await withRetry(() => callGemini(apiKey, s, u));
        ms = Date.now() - t0; // AI 回應時間（含重試），不含上面的間隔
        return raw;
      });
      const problems = checkCase(q.no, r);
      console.log(
        `#${q.no} ${problems.length ? "失敗" : "通過"}｜${q.question}${q.preferences ? `（偏好改成${Object.values(q.preferences).join("、")}）` : ""}\n  預期：${q.expected}\n  回答：${r.answer}\n  來源：${r.sources.join(", ")}｜專員：${r.escalate}｜答案檢查：${r.checkResult}${r.blockedReason ? `（${r.blockedReason}）` : ""}｜AI 回應：${(ms / 1000).toFixed(1)} 秒${r.checkResult === "攔下" ? `\n  AI 原回答：${raw}` : ""}${problems.length ? `\n  問題：${problems.join("；")}` : ""}`,
      );
      expect(problems).toEqual([]);
    }, 600_000); // 限流時會等好幾輪重試
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

  // 拔掉金鑰跑：沒被擋的請求回 503，不會呼叫 Gemini。上限讀和 API 路由同一份設定，不寫死。
  // 細部規則（被擋不計次、無 id 桶、一分鐘恢復）由 src/lib/rateLimit.test.ts 涵蓋。
  it("#21 一分鐘內連問很多次：觸發次數限制，回友善提示", async () => {
    const statuses = (ip: string, n: number, id: (i: number) => string | undefined) =>
      withoutKey(async () => {
        const out: { status: number; error: string }[] = [];
        for (let i = 0; i < n; i++) {
          const res = await post("煞車狀況怎麼樣？", ip, id(i));
          out.push({ status: res.status, error: (await res.json()).error });
        }
        return out;
      });
    // 每個訪客：第 PER_VISITOR + 1 次被擋。
    const visitor = await statuses("eval-21-v", PER_VISITOR + 1, () => "eval-21-visitor");
    expect(visitor.slice(0, -1).every((r) => r.status === 503)).toBe(true);
    expect(visitor.at(-1)).toMatchObject({ status: 429, error: expect.stringMatching(/稍等/) });
    // 沒帶訪客 id：同 IP 共用的無 id 上限。
    const noId = await statuses("eval-21-n", PER_IP_WITHOUT_ID + 1, () => undefined);
    expect(noId.at(-1)?.status).toBe(429);
    // 每個 IP：每個訪客都沒超過自己的上限，同 IP 合計超過就被擋。
    const perIp = limitFromEnv(process.env.ASK_LIMIT_PER_IP_PER_MINUTE);
    const ipRun = await statuses("eval-21-ip", perIp + 1, (i) => `eval-21-ip-${Math.floor(i / PER_VISITOR)}`);
    expect(ipRun.slice(0, -1).every((r) => r.status === 503)).toBe(true);
    expect(ipRun.at(-1)?.status).toBe(429);
  });
});
