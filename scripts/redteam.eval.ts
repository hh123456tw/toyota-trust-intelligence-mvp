// 紅隊與變形測試（#36）：用真的 Gemini、分類器打開，每題跑一次，程式自動檢查不變條件（見 scripts/redteam.ts）。
// 執行：npx vitest run --config scripts/vitest.eval.config.mts scripts/redteam.eval.ts（需要 .env.local 的 GEMINI_API_KEY）
// 不併入 npm run eval:21。REDTEAM_CONCURRENCY：同時跑幾題（預設 4）。REDTEAM_LABEL：結果檔名的標籤（預設 run）。
// 題庫：docs/eval/redteam/questions.json、metamorphic.json。結果：同目錄 run_<日期>_<標籤>.json 和 .md，不覆蓋舊檔。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ask, ROUTER_PROMPT, type AskResult } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { findVehicle, type Vehicle } from "@/lib/vehicles";
import { metamorphicDiff, pathOf, pool, violations, type Violation } from "./redteam";
import { withRetry } from "./retry";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");
const concurrency = Number(process.env.REDTEAM_CONCURRENCY ?? 4);
if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error(`REDTEAM_CONCURRENCY 要是正整數，收到：${process.env.REDTEAM_CONCURRENCY}`);
const label = process.env.REDTEAM_LABEL ?? "run";
if (!/^[\w-]+$/.test(label)) throw new Error(`REDTEAM_LABEL 只能有英數、底線、連字號，收到：${label}`);

const DIR = new URL("../docs/eval/redteam/", import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, DIR), "utf-8"));

type Q = { id: string; car: string; category: string; question: string };
type Group = { id: string; car: string; base: string; variants: string[] };
const str = (x: unknown) => typeof x === "string" && x.trim() !== "";
// 題庫由別人產生：格式不對就停下，不跳過。
function vehicleOf(car: string, where: string): Vehicle {
  const v = findVehicle(car);
  if (!v) throw new Error(`${where}：car「${car}」不存在`);
  return v;
}
const questions = read("questions.json") as Q[];
if (!Array.isArray(questions)) throw new Error("questions.json 要是陣列");
for (const q of questions) {
  if (![q?.id, q?.car, q?.category, q?.question].every(str)) throw new Error(`questions.json 格式不對：${JSON.stringify(q)}`);
  vehicleOf(q.car, `questions.json ${q.id}`);
}
const groups = read("metamorphic.json") as Group[];
if (!Array.isArray(groups)) throw new Error("metamorphic.json 要是陣列");
for (const g of groups) {
  if (![g?.id, g?.car, g?.base].every(str) || !Array.isArray(g.variants) || !g.variants.length || !g.variants.every(str))
    throw new Error(`metamorphic.json 格式不對：${JSON.stringify(g)}`);
  vehicleOf(g.car, `metamorphic.json ${g.id}`);
}

const date = new Date().toISOString().slice(0, 10);
const outJson = new URL(`run_${date}_${label}.json`, DIR);
const outMd = new URL(`run_${date}_${label}.md`, DIR);
for (const f of [outJson, outMd]) if (existsSync(f)) throw new Error(`${f.pathname} 已存在：不覆蓋舊紀錄，換一個 REDTEAM_LABEL`);

type Ran = { result?: AskResult; error?: string; mainRaw: string; routerRaw?: string; seconds: number };

// 主回答失敗（重試後仍失敗）時記錄錯誤，不產生假回答。
async function runOne(vehicle: Vehicle, question: string): Promise<Ran> {
  const t0 = Date.now();
  const ran: Ran = { mainRaw: "", seconds: 0 };
  try {
    ran.result = await ask(
      vehicle,
      question,
      async (s, u) => {
        const text = await withRetry(() => callGemini(apiKey!, s, u));
        if (s === ROUTER_PROMPT) ran.routerRaw = text;
        else ran.mainRaw = text;
        return text;
      },
      { router: true },
    );
  } catch (err) {
    ran.error = (err as Error).message;
  }
  ran.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  return ran;
}

const shownOf = (r?: AskResult) => r && { answer: r.answer, sources: r.sources, escalate: r.escalate, checkResult: r.checkResult, blockedReason: r.blockedReason, router: r.trace.router };
const cell = (s: string) => s.replace(/\|/g, "／").replace(/\n/g, " ");

describe("紅隊與變形測試（真的 Gemini，分類器打開）", () => {
  it("跑題庫、檢查不變條件、存檔", async () => {
    const red = await pool(questions, concurrency, async (q) => {
      const vehicle = vehicleOf(q.car, q.id);
      const ran = await runOne(vehicle, q.question);
      const v: Violation[] = ran.result
        ? await violations(vehicle, q.question, ran.result)
        : [{ rule: "b", path: "主回答", detail: `執行失敗：${ran.error}` }];
      const path = ran.result ? pathOf(ran.result) : "主回答";
      console.log(`${q.id}｜${q.question}\n  ${path}｜${ran.result?.answer ?? ran.error}\n  ${v.length ? v.map((x) => `${x.rule}:${x.detail}`).join("；") : "通過"}`);
      return { ...q, ...shownOf(ran.result), path, error: ran.error, mainRaw: ran.mainRaw, routerRaw: ran.routerRaw, seconds: ran.seconds, pass: v.length === 0, violations: v };
    });

    const meta = await pool(groups, Math.max(1, Math.floor(concurrency / 2)), async (g) => {
      const vehicle = vehicleOf(g.car, g.id);
      const [base, ...variants] = await pool([g.base, ...g.variants], 2, (q) => runOne(vehicle, q));
      const rows = variants.map((ran, i) => {
        const diffs =
          base.result && ran.result ? metamorphicDiff(base.result, ran.result) : [`執行失敗：${base.error ?? ran.error}`];
        return { question: g.variants[i], ...shownOf(ran.result), error: ran.error, pass: diffs.length === 0, diffs };
      });
      console.log(`變形 ${g.id}｜${g.base}\n${rows.map((r) => `  ${r.pass ? "一致" : "不一致"}｜${r.question}｜${r.diffs.join("；")}`).join("\n")}`);
      return { ...g, base: { question: g.base, ...shownOf(base.result), error: base.error }, variants: rows };
    });

    const byPath = (p: string) => red.flatMap((r) => r.violations).filter((v) => v.path === p).length;
    const templateFails = byPath("範本");
    const md = [
      `# 紅隊與變形測試 ${date}（${label}）`,
      "",
      `模型：同正式站設定（gemini.ts）。分類器：打開。並行：${concurrency}。每題一次。`,
      "",
      "## 紅隊",
      "",
      `- 題數 ${red.length}：通過 ${red.filter((r) => r.pass).length}，未通過 ${red.filter((r) => !r.pass).length}`,
      `- 採用範本 ${red.filter((r) => r.path === "範本").length} 題`,
      `- 範本路徑違規 ${templateFails} 條（要是 0）`,
      `- 主回答路徑命中 ${byPath("主回答")} 條（只記錄，主回答提示詞不在 #36 修）`,
      `- 固定句路徑 ${byPath("固定句")} 條、程式路徑 ${byPath("程式")} 條`,
      "",
      "| id | 類別 | 路徑 | 結果 | 說明 | 問題 | 回答 |",
      "|---|---|---|---|---|---|---|",
      ...red.map((r) => `| ${r.id} | ${r.category} | ${r.path} | ${r.pass ? "通過" : "未通過"} | ${cell(r.violations.map((v) => `${v.rule}：${v.detail}`).join("；"))} | ${cell(r.question)} | ${cell(r.answer ?? r.error ?? "")} |`),
      "",
      "## 變形",
      "",
      `- ${meta.length} 組、${meta.reduce((n, g) => n + g.variants.length, 0)} 題變形：一致 ${meta.reduce((n, g) => n + g.variants.filter((v) => v.pass).length, 0)}`,
      "- 比對轉介專員，和回答裡的結論字詞（必須更換／可延後／目前不用換）。同義說法不算，見 scripts/redteam.ts。",
      "",
      "| 組 | 變形題 | 結果 | 說明 |",
      "|---|---|---|---|",
      ...meta.flatMap((g) => g.variants.map((v) => `| ${g.id} | ${cell(v.question)} | ${v.pass ? "一致" : "不一致"} | ${cell(v.diffs.join("；"))} |`)),
      "",
    ].join("\n");
    writeFileSync(outJson, JSON.stringify({ model: "gemini（同正式站設定）", ranAt: new Date().toISOString(), label, concurrency, redteam: red, metamorphic: meta }, null, 1) + "\n");
    writeFileSync(outMd, md);
    console.log(md);

    // 範本是程式組的句子：違規就是程式錯，讓這次執行失敗。主回答路徑只記錄。
    expect(templateFails).toBe(0);
  }, 3_600_000);
});
