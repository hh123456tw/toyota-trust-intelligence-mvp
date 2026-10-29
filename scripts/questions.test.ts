import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkCase, parseQuestions } from "./questions";

const md = readFileSync(new URL("./測試題_追問AI.md", import.meta.url), "utf-8");

describe("parseQuestions", () => {
  it("讀出 21 題，編號連續", () => {
    const qs = parseQuestions(md);
    expect(qs.map((q) => q.no)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(qs[0].question).toBe("煞車下個月再換可以嗎？");
  });

  it("第 19 題取出「」裡的問題，車子是對照車", () => {
    const q19 = parseQuestions(md)[18];
    expect(q19.question).toBe("輪胎可以延後嗎？");
    expect(q19.vehicleId).toBe("lin");
  });

  it("其他題用王先生的車", () => {
    expect(parseQuestions(md)[0].vehicleId).toBe("wang");
  });
});

const ok = { answer: "煞車只剩 2 mm，低於安全門檻 3 mm，不建議延後。", sources: ["item:brake-pad"], escalate: true, verdict: "通過" as const };

describe("checkCase", () => {
  it("第 1 題：符合預期 → 沒有問題", () => {
    expect(checkCase(1, ok)).toEqual([]);
  });

  it("第 1 題：沒出現專員按鈕 → 失敗", () => {
    expect(checkCase(1, { ...ok, escalate: false })).toContain("應該出現「請專員來說明」");
  });

  it("第 1 題：少了必附來源 → 失敗", () => {
    expect(checkCase(1, { ...ok, sources: ["driving"] })).toContain("缺少來源 item:brake-pad");
  });

  it("答案檢查攔下 → 失敗並附理由", () => {
    expect(checkCase(13, { ...ok, verdict: "攔下", blockedReason: "回答沒有附來源" })).toContain("被攔下：回答沒有附來源");
  });

  it("第 10 題：編造金額 → 失敗；只說卡上沒有價格 → 通過", () => {
    const priced = { ...ok, answer: "煞車大約 2500 元。" };
    expect(checkCase(10, priced).join()).toMatch(/不該出現/);
    expect(checkCase(10, { ...ok, answer: "這張卡上沒有價格資料，可以請專員說明。" })).toEqual([]);
  });

  it("第 9 題：用英文回答 → 失敗；只有單位 mm → 通過", () => {
    expect(checkCase(9, { ...ok, answer: "No, the brake pad is 2 mm." }).join()).toMatch(/不該出現/);
    expect(checkCase(9, ok)).toEqual([]);
  });

  it("第 14 題：沒提到 78% → 失敗", () => {
    const r = { ...ok, answer: "電瓶健康度 60%。", sources: ["item:battery", "driving"], escalate: false };
    expect(checkCase(14, r).join()).toMatch(/應該出現/);
  });
});
