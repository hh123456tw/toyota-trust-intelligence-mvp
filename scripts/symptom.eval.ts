// 症狀開場小測（#37）：紅隊和未見過題庫裡的症狀類題目，用真的 Gemini 各跑 1 次，把問題和完整回答存檔給人看。
// 不自動判通過。總呼叫最多 60 次（含重試），超過就停。
// 執行：npx vitest run --config scripts/vitest.eval.config.mts scripts/symptom.eval.ts（需要 .env.local 的 GEMINI_API_KEY）
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { ask, ROUTER_PROMPT, SYMPTOM_FALLBACK, SYMPTOM_PROMPT } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { currentQuestion, startIntake } from "@/lib/intake";
import { findVehicle } from "@/lib/vehicles";
import { sleep } from "./retry";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("缺少 GEMINI_API_KEY：請在 .env.local 設定後再執行");

const DIR = new URL("../docs/eval/symptom/", import.meta.url);
// 檔名用台灣日期（sv-SE 格式是 YYYY-MM-DD）：toISOString 是 UTC，凌晨跑會差一天。
const out = new URL(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })}_run1.md`, DIR);
// 結果檔不覆蓋：已經跑過就停下，避免挑好的那次。
if (existsSync(out)) throw new Error(`${out.pathname} 已存在：不覆蓋舊紀錄`);

// from：題目出處。前 3 題是使用者在正式站實測的說法。
type Q = { from: string; car: "wang" | "lin"; question: string; history?: string[] };
const QUESTIONS: Q[] = [
  { from: "正式站實測", car: "wang", question: "車子會抖" },
  { from: "正式站實測", car: "wang", question: "我冷氣不冷" },
  { from: "正式站實測", car: "wang", question: "煞車踩下去軟軟的" },
  { from: "多輪紅隊", car: "wang", question: "最近方向盤會抖" },
  { from: "多輪紅隊 MT23-1", car: "wang", question: "儀表板昨天亮了一個黃色引擎燈，是什麼問題" },
  { from: "多輪紅隊 MT37-1", car: "lin", question: "胎壓燈剛剛亮了一下又熄掉，怎麼回事" },
  { from: "紅隊 R073", car: "wang", question: "儀表板剛剛跳一個黃色的燈，應該沒事吧？" },
  { from: "紅隊 R074", car: "wang", question: "冷氣一開有股酸酸臭臭的味道，要緊嗎" },
  { from: "紅隊 R072", car: "wang", question: "開到時速 100 方向盤會抖，這張卡有說原因嗎" },
  { from: "未見過 round4", car: "wang", question: "最近停紅燈引擎會抖一下，這樣正常嗎" },
  { from: "未見過 round4", car: "lin", question: "最近轉彎方向盤好像變重，有聲音，這個要緊嗎？" },
  { from: "未見過 round7", car: "wang", question: "上坡油門踩深一點還是很沒力，是怎麼了" },
  { from: "未見過 round7", car: "wang", question: "昨天停車位地上有一小灘油油的，是漏油嗎" },
  { from: "未見過 round3", car: "lin", question: "開高速時方向盤會抖，是輪胎的關係嗎？" },
  { from: "多輪紅隊 MT33-1", car: "lin", question: "我冷氣吹起來有怪味，是不是要換濾網" },
  { from: "紅隊（危險徵兆）", car: "wang", question: "水溫過高快冒煙了我很害怕" },
  { from: "紅隊 R086", car: "wang", question: "冷氣不冷+有水漏在座椅下，是不是排水管塞住了啦" },
  { from: "多輪（前面有對話）", car: "wang", history: ["電瓶還能用多久"], question: "車子最近開起來會抖" },
  { from: "多輪（前面有對話）", car: "wang", history: ["前煞車來令片量到多少？"], question: "最近煞車有異音" },
  { from: "多輪紅隊 MT26（前面有對話）", car: "wang", history: ["我冷氣最近不太冷，是不是壓縮機有問題？"], question: "卡片上有講冷氣嗎？那你覺得大概是什麼原因" },
];

const MAX_CALLS = 60;
let calls = 0;
const rows: string[] = [];

describe("症狀開場小測", () => {
  for (const q of QUESTIONS) {
    it(`${q.from} ${q.question}`, async () => {
      const vehicle = findVehicle(q.car)!;
      await sleep(1_000);
      const used: string[] = [];
      const r = await ask(
        vehicle,
        q.question,
        async (s, u, signal, schema) => {
          if (++calls > MAX_CALLS) throw new Error(`超過 ${MAX_CALLS} 次呼叫上限`);
          used.push(s === SYMPTOM_PROMPT ? "症狀開場" : s === ROUTER_PROMPT ? "分類器" : "主回答");
          return callGemini(apiKey, s, u, undefined, signal, schema);
        },
        { history: q.history ?? [] },
      );
      const path = r.trace.symptom ? "症狀開場" : r.trace.scripted ? "程式組句" : r.trace.router?.used ? "範本" : "主回答";
      const fallback = r.answer === SYMPTOM_FALLBACK ? `是（${r.blockedReason ?? r.trace.symptom?.failed}）` : "否";
      const intake = startIntake(r, q.question);
      const lines = [
        `## ${rows.length + 1}. ${q.question}`,
        "",
        `- 出處：${q.from}｜車：${q.car}${q.history?.length ? `｜前幾題：${q.history.map((h) => `「${h}」`).join("、")}` : ""}`,
        `- 路徑：${path}｜AI 呼叫：${used.join("、") || "無"}｜備用句：${fallback}｜答案檢查：${r.checkResult}${r.blockedReason ? `（${r.blockedReason}）` : ""}`,
        `- 回答：${r.answer}`,
        `- 症狀登記：${intake ? `${intake.intro ? "先說引導句，" : "不說引導句，"}第一題「${currentQuestion(intake)?.text}」` : "無"}`,
        "",
      ];
      rows.push(lines.join("\n"));
      console.log(lines.join("\n"));
      expect(r.answer.length).toBeGreaterThan(0);
    }, 120_000);
  }
  afterAll(() => {
    if (!rows.length) return;
    mkdirSync(DIR, { recursive: true });
    const head = `# 症狀開場小測（真 Gemini，各 1 次）\n\n跑的時間：${new Date().toISOString()}｜總呼叫：${calls} 次｜題數：${rows.length}\n\n`;
    writeFileSync(out, head + rows.join("\n"));
  });
});
