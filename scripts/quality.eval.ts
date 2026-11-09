// 好用度評測：用真的 Gemini 跑 docs/eval/quality/questions.json 的 40 題，把回答原文存檔給盲評。不自動評分。
// 執行：npx vitest run --config scripts/vitest.eval.config.mts scripts/quality.eval.ts（需要 .env.local 的 GEMINI_API_KEY）
// QUALITY_OUT：輸出檔名（預設 run_<日期>.json），例如 run_baseline_d0e574e.json。不覆蓋已存在的檔案。
// 可以複製到舊版本（例如 v37）執行：沒有對話記憶的版本，多輪題只送最後一句，結果標 onlyLast。
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import * as askLib from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { findVehicle } from "@/lib/vehicles";
import { sleep, withRetry } from "./retry";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");
const name = process.env.QUALITY_OUT ?? `run_${new Date().toISOString().slice(0, 10)}.json`;
if (!/^run_[\w-]+\.json$/.test(name)) throw new Error(`QUALITY_OUT 要像 run_baseline_xxx.json，收到：${name}`);
const MAX_CALLS = 120;

// 舊版本沒有這些匯出：沒有 HISTORY_MAX 就不帶對話記憶，沒有 ROUTER_PROMPT 就沒有分類器。
const lib = askLib as unknown as Record<string, unknown>;
const HISTORY_MAX = lib.HISTORY_MAX as number | undefined;
const ROUTER_PROMPT = lib.ROUTER_PROMPT as string | undefined;
const ask = askLib.ask as unknown as (v: unknown, q: string, call: (s: string, u: string) => Promise<string>, opts?: { history: string[] }) => Promise<askLib.AskResult>;
// 症狀登記（#37）：舊版本沒有 intake.ts，glob 會是空的。
type IntakeMod = { startIntake: (r: unknown, q: string) => { set: { name: string; questions: { text: string }[] } } | undefined };
const intakeMod = Object.values(import.meta.glob("../src/lib/intake.ts", { eager: true }))[0] as unknown as IntakeMod | undefined;

const DIR = new URL("../docs/eval/quality/", import.meta.url);
type Q = { no: string; car: string; category: string; turns: string[] };
const questions: Q[] = JSON.parse(readFileSync(new URL("questions.json", DIR), "utf-8"));
for (const q of questions)
  if (!q.no || !findVehicle(q.car) || !Array.isArray(q.turns) || !q.turns.length || !q.turns.every((t) => typeof t === "string" && t.trim()))
    throw new Error(`questions.json 格式不對：${JSON.stringify(q)}`);

const out = new URL(name, DIR);
if (existsSync(out)) throw new Error(`${out.pathname} 已存在：不覆蓋舊紀錄，換一個 QUALITY_OUT`);

// 先估呼叫數：每次追問最多主回答＋分類器 2 次，超過上限就不跑。
const sent = (q: Q) => (HISTORY_MAX ? q.turns : q.turns.slice(-1));
const asks = questions.reduce((n, q) => n + sent(q).length, 0);
if (asks * (ROUTER_PROMPT ? 2 : 1) > MAX_CALLS) throw new Error(`預估呼叫 ${asks * (ROUTER_PROMPT ? 2 : 1)} 次，超過上限 ${MAX_CALLS}`);

let calls = 0;
const results: unknown[] = [];

async function runTurn(vehicle: unknown, question: string, history: string[]) {
  const t0 = Date.now();
  try {
    const call = (s: string, u: string, signal?: AbortSignal, schema?: object) =>
      withRetry(() => {
        if (++calls > MAX_CALLS) throw new Error(`呼叫超過上限 ${MAX_CALLS} 次，停止`);
        return callGemini(apiKey!, s, u, undefined, signal, schema);
      });
    const r = HISTORY_MAX ? await ask(vehicle, question, call, { history }) : await ask(vehicle, question, call);
    const intake = intakeMod?.startIntake(r, question);
    return {
      question, history, answer: r.answer, sources: r.sources, escalate: r.escalate, checkResult: r.checkResult, blockedReason: r.blockedReason,
      router: r.trace?.router, intake: intake ? { set: intake.set.name, questions: intake.set.questions.map((x) => x.text) } : null,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
    };
  } catch (err) {
    // 失敗就記錯誤，不產生假回答。
    return { question, history, error: (err as Error).message, seconds: +((Date.now() - t0) / 1000).toFixed(1) };
  }
}

describe("好用度評測（真的 Gemini）", () => {
  it("40 題依序送出、存回答原文", async () => {
    for (const q of questions) {
      const vehicle = findVehicle(q.car)!;
      const turns = [];
      const asked = sent(q);
      for (const [i, question] of asked.entries()) {
        await sleep(1_000);
        // 和正式站前端一樣：只帶車主前幾題原文，最多 HISTORY_MAX 題，不帶 AI 回答。
        const history = HISTORY_MAX ? asked.slice(Math.max(0, i - HISTORY_MAX), i) : [];
        const t = await runTurn(vehicle, question, history);
        console.log(`${q.no}-${i + 1}｜${question}\n  ${"answer" in t ? `${t.answer}｜專員：${t.escalate}｜登記：${t.intake?.set ?? "無"}` : `錯誤：${t.error}`}`);
        turns.push(t);
      }
      results.push({ ...q, onlyLast: asked.length < q.turns.length || undefined, replies: turns });
    }
    expect(results.length).toBe(questions.length);
  }, 3_600_000);
  afterAll(() => {
    if (!results.length) return;
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    writeFileSync(out, JSON.stringify({ commit, historyMax: HISTORY_MAX ?? 0, router: !!ROUTER_PROMPT, intake: !!intakeMod, ranAt: new Date().toISOString(), calls, results }, null, 1) + "\n");
  });
});
