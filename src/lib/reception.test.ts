import { describe, expect, it } from "vitest";
import { cardContext } from "./answers";
import { receptionSummary } from "./reception";
import { findVehicle, type Vehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const text = (v: Vehicle) => receptionSummary(v).join("\n");

describe("receptionSummary：接待摘要（規則產生）", () => {
  it("王先生：上次延後的煞車、資料來源、車主偏好、追問費用紀錄、短程比例", () => {
    expect(receptionSummary(wang)).toEqual([
      "上次前煞車來令片 3.5 mm，延後，這次要複查。",
      "資料來源：保修紀錄的待修建議項目（示意）",
      "車主偏好：能等就等、最在意價格、近期有長途行程。",
      "上次回廠時，在決策卡追問了 4 次費用（示意）。先講價格。",
      "行車摘要（近 3 個月）：短程比例 78%，每週發動約 11 次。",
    ]);
  });

  it("王先生：不含本次量測值和本次結論", () => {
    const t = text(wang);
    for (const now of ["60 %", "60%", "2 mm", "5.2 mm"]) expect(t).not.toContain(now);
    for (const word of ["必須更換", "可延後", "目前不用換", "正常"]) expect(t).not.toContain(word);
  });

  it("反例：上次正常的項目不列（王先生電瓶上次 72%，高於 70% 門檻）", () => {
    expect(text(wang)).not.toContain("電瓶");
    expect(text(wang)).not.toContain("輪胎");
  });

  it("反例：沒有上次量測的項目不列（目視型的空氣濾網、雨刷）", () => {
    expect(text(wang)).not.toContain("空氣濾網");
    expect(text(wang)).not.toContain("雨刷");
  });

  it("上次已低於安全門檻也要列出", () => {
    const worn = {
      ...wang,
      items: wang.items.map((i) => (i.id === "tire" ? { ...i, previousMeasurement: { value: 1.2, unit: "mm" } } : i)),
    };
    expect(receptionSummary(worn)).toContain("上次輪胎胎紋 1.2 mm，已低於安全門檻，這次要確認。");
  });

  it("反例：上次沒有延後的項目時，不出現資料來源那一行", () => {
    const fine = { ...wang, items: wang.items.map((i) => ({ ...i, previousMeasurement: undefined })) };
    expect(text(fine)).not.toContain("保修紀錄");
  });

  it("反例：沒有偏好時不出現偏好行", () => {
    expect(text({ ...wang, preferences: undefined })).not.toContain("車主偏好");
  });

  it("反例：追問次數未達門檻時不出現「先講價格」，紀錄照列", () => {
    const t = text({ ...wang, lastVisitRecord: { priceQuestions: 2 } });
    expect(t).toContain("上次回廠時，在決策卡追問了 2 次費用（示意）。");
    expect(t).not.toContain("先講價格");
  });

  it("林小姐：上次延後的輪胎、行車摘要；沒有偏好和追問紀錄", () => {
    expect(receptionSummary(lin)).toEqual([
      "上次輪胎胎紋 2.5 mm，延後，這次要複查。",
      "資料來源：保修紀錄的待修建議項目（示意）",
      "行車摘要（近 3 個月）：短程比例 20%，每週發動約 6 次。",
    ]);
  });
});

describe("AI 卡片資料", () => {
  it("不再出現「在 App 問過」", () => {
    expect(JSON.stringify(cardContext(wang))).not.toContain("App 問過");
  });
});
