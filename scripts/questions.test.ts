import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePreferences, PREFERENCE_QUESTIONS } from "@/lib/preferences";
import { checkCase, parseQuestions } from "./questions";

const md = readFileSync(new URL("./測試題_追問AI.md", import.meta.url), "utf-8");

describe("parseQuestions", () => {
  it("讀出 31 題，編號連續", () => {
    const qs = parseQuestions(md);
    expect(qs.map((q) => q.no)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
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

  it("第 29 題：「處理方式改成一次處理完」→ 只改處理方式；問題取「」裡的字", () => {
    const q29 = parseQuestions(md)[28];
    expect(q29.question).toBe("可延後的可以今天一起換嗎？");
    expect(q29.preferences).toEqual({ handling: "一次處理完" });
  });

  it("沒寫「改成」的題目不改偏好（第 26 題用預設）", () => {
    expect(parseQuestions(md)[25].preferences).toBeUndefined();
  });

  it("「改成」後面不是選項 → 照原文送出，由 applyPreferences 擋下", () => {
    const [q] = parseQuestions("| 99 | 處理方式改成隨便，問「電瓶要換嗎？」 | x |");
    expect(q.preferences).toEqual({ handling: "隨便" });
  });

  it("不認識的偏好名稱不算（例如「顏色改成紅色」）", () => {
    const [q] = parseQuestions("| 99 | 顏色改成紅色，問「電瓶要換嗎？」 | x |");
    expect(q.preferences).toBeUndefined();
  });

  // 偏好的題目名稱和選項只定義在 preferences.ts 一處；問卷、API 驗證、實測題目共用。
  it("每一題偏好、每個選項都讀得出來，讀出的值 API 收得下", () => {
    for (const p of PREFERENCE_QUESTIONS) {
      for (const option of p.options) {
        const [q] = parseQuestions(`| 99 | ${p.label}改成${option}，問「電瓶要換嗎？」 | x |`);
        expect(q.preferences).toEqual({ [p.key]: option });
        expect(parsePreferences(q.preferences)).toEqual({ [p.key]: option });
      }
    }
  });
});

const ok = { answer: "煞車只剩 2 mm，低於安全門檻 3 mm，不建議延後。", sources: ["item:brake-pad"], escalate: true, checkResult: "通過" as const };

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
    expect(checkCase(13, { ...ok, checkResult: "攔下", blockedReason: "回答沒有附來源" })).toContain("被攔下：回答沒有附來源");
  });

  it("第 10 題：照抄卡片價格並附煞車來源 → 通過；沒提價格 → 失敗", () => {
    const priced = { ...ok, sources: ["item:brake-pad"] };
    expect(checkCase(10, { ...priced, answer: "示意費用 NT$3,000，價格無法調整。" })).toEqual([]);
    expect(checkCase(10, { ...priced, answer: "這張卡上沒有價格資料。" }).join()).toMatch(/應該出現/);
  });

  it("第 9 題：用英文回答 → 失敗；只有單位 mm → 通過", () => {
    expect(checkCase(9, { ...ok, answer: "No, the brake pad is 2 mm." }).join()).toMatch(/不該出現/);
    expect(checkCase(9, ok)).toEqual([]);
  });

  it("第 28 題：引用任一則原廠事實來源 → 通過；沒有 dealer 來源 → 失敗", () => {
    const r = { ...ok, answer: "原廠會保留保養紀錄，也有原廠零件保固。", sources: ["dealer:record"], escalate: false };
    expect(checkCase(28, r)).toEqual([]);
    expect(checkCase(28, { ...r, sources: ["item:battery"] })).toContain("缺少來源 dealer:…");
  });

  it("第 27 題：保證電瓶撐得住 → 失敗", () => {
    const r = { ...ok, answer: "電瓶健康度 60%，保證撐得住。", sources: ["item:battery"], escalate: false };
    expect(checkCase(27, r).join()).toMatch(/不該出現/);
    expect(checkCase(27, { ...r, answer: "電瓶健康度 60%，結論是可延後，出發前可以請專員再測一次。" })).toEqual([]);
    // 反例：「無法保證」是正確的說法，不能被當成保證。
    expect(checkCase(27, { ...r, answer: "電瓶健康度 60%，我無法保證長途一定沒事。" })).toEqual([]);
  });

  it("第 14 題：沒提到 78% → 失敗", () => {
    const r = { ...ok, answer: "電瓶健康度 60%。", sources: ["item:battery", "driving"], escalate: false };
    expect(checkCase(14, r).join()).toMatch(/應該出現/);
  });
});
