import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classify, parseEvalLog, parseRedteam, readable, type QuestionResult } from "./evalLog";

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

  it("11/5 付費版 run1–3：27 題全過，每題 AI 題都有回應秒數", () => {
    for (const f of ["2026-11-05_run1.log", "2026-11-05_run2.log", "2026-11-05_run3.log"]) {
      const run = parseEvalLog(raw(f));
      expect(run).toMatchObject({ passed: 27, total: 27 });
      expect(run.questions).toHaveLength(19);
      expect(run.questions.every((q) => q.pass && q.seconds !== undefined && q.seconds > 0)).toBe(true);
    }
  });

  it("被攔下的題目：從多行 JSON 取出 AI 原文的 answer，和車主看到的回答分開", () => {
    const q15 = parseEvalLog(raw("2026-11-08_review_fix_run2.log")).questions.find((q) => q.n === 15)!;
    expect(q15.check).toContain("攔下");
    expect(q15.answer).toContain("今天不用換");
    expect(q15.aiAnswer).toBe("空氣濾網技師目視檢查狀況良好，結論為正常，示意費用無。依據原廠手冊，空氣濾網每 48 個月才需要更換。");
    expect(q15.problems).toEqual(["被攔下：空氣濾網是正常，回答卻建議更換"]);
    // 原文 JSON 的內容不會被當成別的欄位
    expect(q15.sources).toBe("item:air-filter");
  });

  it("預期欄拿掉 Markdown 粗體記號", () => {
    const q5 = parseEvalLog(raw("2026-10-30_run1.log")).questions.find((q) => q.n === 5)!;
    expect(q5.expected).not.toContain("**");
    expect(q5.expected).toContain("可延後");
  });
});

const q = (problems: string[], aiAnswer?: string): QuestionResult => ({
  n: 1, pass: false, question: "", expected: "", answer: "", sources: "", escalate: false, check: "", problems, aiAnswer,
});

describe("readable：把驗收用的正規表示式改成白話", () => {
  it.each([
    ["應該出現 /3\\s*個月|三個月/", "回答沒有提到「3 個月」或「三個月」"],
    ["應該出現 /保養的?[紀記]錄|零件的?保[固證]/", "回答沒有提到「保養紀錄」或「零件保固」"],
    ["應該出現 /延後|先不用?換|(?:今天)?不(?:用|必|需要?)(?:今天)?更?換/", "回答沒有提到「延後」或「先不換」或「不用換」"],
    ["被攔下：空氣濾網是正常，回答卻建議更換", "答案檢查攔下：空氣濾網是正常，回答卻建議更換"],
    ["缺少來源 item:tire", "沒有附上來源 item:tire"],
    ["不該出現 /建議.{0,8}長效款/", "回答出現了不該說的話（「建議…長效款」）"],
  ])("%s", (p, want) => expect(readable(p)).toBe(want));
});

describe("classify：沒過的題目分類", () => {
  it("11/8 #15：正常項目講保養週期被攔 → 誤攔", () => {
    const run = parseEvalLog(raw("2026-11-08_review_fix_run2.log"));
    expect(classify(run.questions.find((x) => x.n === 15)!, false)).toEqual({ tag: "誤攔", why: "回答提到保養週期，被誤判成推銷" });
  });

  it("反例：正常項目被攔，原文叫車主今天換 → 不算誤攔", () => {
    const v = classify(q(["被攔下：空氣濾網是正常，回答卻建議更換"], "空氣濾網每 4 萬公里換，建議今天換掉。"), false);
    expect(v.tag).toBe("待人工判讀");
  });

  it("11/7 #25：原文說「無法下個月再換」卻被當成延後 → 誤攔；原文真的說可以延後 → 待人工判讀", () => {
    const run = parseEvalLog(raw("2026-11-07_pref_before-fix_run1.log"));
    expect(classify(run.questions.find((x) => x.n === 25)!, false).tag).toBe("誤攔");
    expect(classify(q(["被攔下：輪胎胎紋是必須更換，回答卻說可以延後"], "輪胎下個月再換也可以。"), false).tag).toBe("待人工判讀");
  });

  // Codex 審查：原文同時說不能延後又說可以晚點換，是自相矛盾，要人看，不能判誤攔。
  it("原文說不能延後、又說可以晚點換 → 待人工判讀", () => {
    const blocked = ["被攔下：煞車來令片是必須更換，回答卻說可以延後"];
    for (const ai of ["煞車不能延後，但可以下個月再換。", "煞車無法延後。不過先不換也行，下次再處理。"])
      expect(classify(q(blocked, ai), false).tag, ai).toBe("待人工判讀");
  });

  it("反例：原文只說不能延後（含「不建議延後」這類否定）→ 誤攔", () => {
    const blocked = ["被攔下：煞車來令片是必須更換，回答卻說可以延後"];
    for (const ai of ["煞車不能延後，今天要換。", "煞車無法延後，也不建議延後到下個月。"])
      expect(classify(q(blocked, ai), false).tag, ai).toBe("誤攔");
  });

  it("預算有限卻建議最貴、沒列出必須更換的結論 → 檢查擋對了", () => {
    for (const f of ["2026-11-07_pref_run2.log", "2026-11-08_wang_tire_run3.log", "2026-11-07_pref_fix1_run2.log"]) {
      const failed = parseEvalLog(raw(f)).questions.find((x) => x.aiAnswer)!;
      expect(classify(failed, false).tag, f).toBe("檢查擋對了");
    }
  });

  it("11/8 #28：用放寬後的驗收字詞會過 → 驗收太嚴；還是不過 → 待人工判讀，不硬猜", () => {
    const q28 = parseEvalLog(raw("2026-11-08_review_fix_run1.log")).questions.find((x) => x.n === 28)!;
    expect(classify(q28, true).tag).toBe("驗收太嚴");
    expect(classify(q28, false).tag).toBe("待人工判讀");
  });

  it("說了不該說的話、漏來源 → AI 說錯", () => {
    expect(classify(q(["不該出現 /統一標準/"]), false).tag).toBe("AI 說錯");
    expect(classify(q(["缺少來源 item:tire", "應該出現「請專員來說明」"]), false).tag).toBe("AI 說錯");
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

  it("來源行第 4 欄是 AI 回應秒數；舊紀錄沒有這欄就不填，不編造", () => {
    const log = ["#1 通過｜問題", "  來源：item:brake-pad｜專員：true｜答案檢查：通過｜AI 回應：1.4 秒", "#2 通過｜問題", "  來源：item:battery｜專員：false｜答案檢查：通過"].join("\n");
    const [q1, q2] = parseEvalLog(log).questions;
    expect(q1).toMatchObject({ escalate: true, check: "通過", seconds: 1.4 });
    expect(q2.seconds).toBeUndefined();
  });

  it("AI 原回答不是 JSON 或 JSON 壞掉：保留原樣，不崩潰；沒被攔下的題目沒有這欄", () => {
    const log = [
      "#1 失敗｜問題",
      "  來源：｜專員：true｜答案檢查：攔下（理由）",
      "  AI 原回答：{",
      '  "answer": "沒有結尾',
      "  問題：被攔下：理由",
      "#2 失敗｜問題",
      "  AI 原回答：純文字回答",
      "",
      "#3 通過｜問題",
    ].join("\n");
    const [q1, q2, q3] = parseEvalLog(log).questions;
    expect(q1.aiAnswer).toBe('{\n  "answer": "沒有結尾');
    expect(q1.problems).toEqual(["被攔下：理由"]);
    expect(q2.aiAnswer).toBe("純文字回答");
    expect(q3.aiAnswer).toBeUndefined();
  });

  it("✓ 行若已有 #N 紀錄，不會重複算成系統題", () => {
    const log = ["#1 通過｜問題", " ✓ scripts/eval21.eval.ts > 21 題實測 > #1 問題 900ms"].join("\n");
    expect(parseEvalLog(log).system).toEqual([]);
  });

  it("空紀錄回傳空結果，不編造數字", () => {
    expect(parseEvalLog("")).toEqual({ questions: [], system: [], summaries: [], passed: 0, total: 0 });
  });
});

// /eval 頁的紅隊數字（t38）：從 docs/eval/redteam/ 的摘要行讀，不寫死。
describe("parseRedteam：紅隊紀錄的摘要行", () => {
  const red = (name: string) => readFileSync(join(process.cwd(), "docs/eval/redteam", name), "utf-8");
  it("t38 紀錄：單輪 182 題 0 違規、多輪 235 輪 1 違規", () => {
    expect(parseRedteam(red("run_2026-11-09_t38.md"), red("multi_2026-11-09_t38.md"))).toEqual({ single: 182, singleFailed: 0, multi: 235, multiFailed: 1 });
  });
  it("讀不到摘要行就丟錯，不顯示假數字（單輪、多輪檔放反也一樣）", () => {
    expect(() => parseRedteam("沒有摘要", red("multi_2026-11-09_t38.md"))).toThrow();
    expect(() => parseRedteam(red("multi_2026-11-09_t38.md"), red("run_2026-11-09_t38.md"))).toThrow();
  });
});
