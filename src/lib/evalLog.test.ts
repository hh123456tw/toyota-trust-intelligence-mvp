import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvalLog } from "./evalLog";

const raw = (name: string) => readFileSync(join(process.cwd(), "docs/eval/raw", name), "utf-8");

describe("parseEvalLog：真實紀錄", () => {
  it("run0：19 題 AI 題、2 題系統題、6 次摘要；第 5 題失敗並記下原因", () => {
    const run = parseEvalLog(raw("2026-10-30_run0_before-prompt-fix.log"));
    expect(run.questions).toHaveLength(19);
    expect(run.system.map((s) => s.n)).toEqual([20, 21]);
    expect(run.summaries).toHaveLength(6);
    expect(run).toMatchObject({ passed: 26, total: 27 });
    const q5 = run.questions.find((q) => q.n === 5)!;
    expect(q5.pass).toBe(false);
    expect(q5.problems[0]).toContain("3");
    expect(run.questions.filter((q) => !q.pass)).toHaveLength(1);
  });

  it("run1–3：27 題全過，每題都有回答和答案檢查結果", () => {
    for (const f of ["2026-10-30_run1.log", "2026-10-30_run2.log", "2026-10-30_run3.log"]) {
      const run = parseEvalLog(raw(f));
      expect(run).toMatchObject({ passed: 27, total: 27 });
      expect(run.questions.every((q) => q.pass && q.answer && q.check)).toBe(true);
      expect(run.summaries.map((s) => s.owner)).toEqual(["王先生", "王先生", "王先生", "林小姐", "林小姐", "林小姐"]);
      expect(run.summaries.every((s) => s.pass && s.text.length > 0)).toBe(true);
    }
  });

  it("預期欄拿掉 Markdown 粗體記號", () => {
    const q5 = parseEvalLog(raw("2026-10-30_run1.log")).questions.find((q) => q.n === 5)!;
    expect(q5.expected).not.toContain("**");
    expect(q5.expected).toContain("可延後");
  });
});

describe("parseEvalLog：不該被當成結果的行", () => {
  it("回答內文出現「#3 通過｜」不會被當成新題目；CRLF 也能讀", () => {
    const log = [
      "#1 通過｜煞車可以延後嗎？",
      "  預期：拒絕",
      "  回答：說明 #3 通過｜不是新題",
      "  來源：item:brake-pad｜專員：false｜答案檢查：通過",
      "",
      "      Tests  1 passed (1)",
    ].join("\r\n");
    const run = parseEvalLog(log);
    expect(run.questions).toHaveLength(1);
    expect(run.questions[0]).toMatchObject({ answer: "說明 #3 通過｜不是新題", escalate: false, check: "通過" });
    expect(run).toMatchObject({ passed: 1, total: 1 });
  });

  it("✓ 行若已有 #N 紀錄，不會重複算成系統題", () => {
    const log = ["#1 通過｜問題", " ✓ scripts/eval21.eval.ts > 21 題實測 > #1 問題 900ms"].join("\n");
    expect(parseEvalLog(log).system).toEqual([]);
  });

  it("空紀錄回傳空結果，不編造數字", () => {
    expect(parseEvalLog("")).toEqual({ questions: [], system: [], summaries: [], passed: 0, total: 0 });
  });
});
