// 口語化前後對照（#37）：5 個代表題加好用度基準最差的幾題，真 Gemini 各跑 1 次，回答原文存檔給人看。不自動判通過。
// 執行：QUALITY_LABEL=before 或 after，npx vitest run --config scripts/vitest.eval.config.mts scripts/quality5.eval.ts
// before 只跑 5 個代表題（最差題的改前回答在 docs/eval/quality/單評_baseline.md）。每次最多 25 次呼叫。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { ask } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { findVehicle } from "@/lib/vehicles";
import { sleep } from "./retry";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");
const label = process.env.QUALITY_LABEL;
if (label !== "before" && label !== "after") throw new Error("QUALITY_LABEL 要是 before 或 after");
const out = new URL(`../docs/eval/quality/2026-11-10_t37_${label}.md`, import.meta.url);
if (existsSync(out)) throw new Error(`${out.pathname} 已存在：不覆蓋舊紀錄`);

type Q = { id: string; car: "wang" | "lin"; turns: string[] };
const REPRESENTATIVE: Q[] = [
  { id: "代表1", car: "wang", turns: ["電瓶還能用多久"] },
  { id: "代表2", car: "wang", turns: ["電瓶還能用多久", "那要多少錢"] },
  { id: "代表3", car: "wang", turns: ["你好"] },
  { id: "代表4", car: "wang", turns: ["我今天好累"] },
  { id: "代表5", car: "wang", turns: ["可以下個月再換煞車嗎"] },
];
// 好用度基準（docs/eval/quality/questions.json）最差的幾題。多輪只跑最後一題，前幾題當 history。
const WORST: Q[] = [
  { id: "G10", car: "lin", turns: ["空氣濾網多少錢"] },
  { id: "G11", car: "wang", turns: ["雨刷多少錢 要換嗎"] },
  { id: "G17", car: "lin", turns: ["輪胎磨到1.4了對吧", "那換兩條多少錢", "那便宜的會不會不耐開"] },
  { id: "G23", car: "wang", turns: ["煞車那個錢能不能先不花", "那可以拖到什麼時候", "那我先開回去行不行"] },
  { id: "G24", car: "wang", turns: ["方向盤開到六七十會抖 煞車的時候更明顯"] },
  { id: "G25", car: "lin", turns: ["剎車踩下去會吱吱叫 是不是壞了"] },
  { id: "G32", car: "wang", turns: ["謝謝 你講得很清楚"] },
  { id: "G33", car: "wang", turns: ["你是不是在幫技師衝業績啊哈哈"] },
];
const QUESTIONS = label === "before" ? REPRESENTATIVE : [...REPRESENTATIVE, ...WORST];

const MAX_CALLS = 25;
let calls = 0;
const rows: string[] = [];

describe(`口語化對照（${label}）`, () => {
  for (const q of QUESTIONS) {
    it(`${q.id} ${q.turns.at(-1)}`, async () => {
      await sleep(1_000);
      const question = q.turns.at(-1)!;
      const r = await ask(findVehicle(q.car)!, question, async (s, u, signal) => {
        if (++calls > MAX_CALLS) throw new Error(`超過 ${MAX_CALLS} 次呼叫上限`);
        return callGemini(apiKey, s, u, undefined, signal);
      }, { history: q.turns.slice(0, -1) });
      const row = [
        `## ${q.id}（${q.car}）${q.turns.length > 1 ? `前幾題：${q.turns.slice(0, -1).map((t) => `「${t}」`).join("、")}｜` : ""}問：${question}`,
        "",
        `- 回答：${r.answer}`,
        `- 轉介專員：${r.escalate}｜答案檢查：${r.checkResult}${r.blockedReason ? `（${r.blockedReason}）` : ""}`,
        "",
      ].join("\n");
      rows.push(row);
      console.log(row);
      expect(r.answer.length).toBeGreaterThan(0);
    }, 120_000);
  }
  afterAll(() => {
    mkdirSync(new URL(".", out), { recursive: true });
    if (rows.length) writeFileSync(out, `# 口語化對照：${label}\n\n跑的時間：${new Date().toISOString()}｜總呼叫：${calls} 次\n\n${rows.join("\n")}`);
  });
});
