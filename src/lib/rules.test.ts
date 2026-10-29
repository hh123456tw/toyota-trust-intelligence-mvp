import { describe, expect, it } from "vitest";
import { judge } from "./rules";
import { findVehicle, type InspectionItem } from "./vehicles";

// 從展示資料取出項目，換上指定量測值，確保測的是真正的規則表。
function itemWith(id: string, value?: number, visualOk?: boolean): InspectionItem {
  const item = findVehicle("wang")!.items.find((i) => i.id === id)!;
  return {
    ...item,
    measurement: value === undefined ? undefined : { ...item.measurement!, value },
    visualOk,
  };
}

describe("judge：煞車來令片", () => {
  it.each([
    [2.9, "必須更換"],
    [3, "可延後"],
    [4.9, "可延後"],
    [5, "正常"],
  ])("%s mm → %s", (mm, expected) => {
    expect(judge(itemWith("brake-pad", mm)).conclusion).toBe(expected);
  });
});

describe("judge：輪胎胎紋", () => {
  it.each([
    [1.5, "必須更換"],
    [1.6, "可延後"],
    [2.9, "可延後"],
    [3, "正常"],
  ])("%s mm → %s", (mm, expected) => {
    expect(judge(itemWith("tire", mm)).conclusion).toBe(expected);
  });
});

describe("judge：電瓶健康度", () => {
  it.each([
    [69, "可延後"],
    [70, "正常"],
  ])("健康度 %s → %s", (pct, expected) => {
    expect(judge(itemWith("battery", pct)).conclusion).toBe(expected);
  });

  it("任何值都不會是必須更換", () => {
    for (const pct of [0, 1, 30, 60]) {
      expect(judge(itemWith("battery", pct)).conclusion).not.toBe("必須更換");
    }
  });
});

describe("judge：目視型", () => {
  it.each([
    ["air-filter", 6],
    ["wiper", 3],
  ])("%s 良好 → 正常，不良 → 可延後並在 %s 個月後提醒", (id, months) => {
    expect(judge(itemWith(id, undefined, true)).conclusion).toBe("正常");
    const bad = judge(itemWith(id, undefined, false));
    expect(bad.conclusion).toBe("可延後");
    expect(bad.reminderMonths).toBe(months);
  });
});

describe("judge：量測型缺量測值", () => {
  it("丟錯，不回傳預設結論", () => {
    expect(() => judge(itemWith("brake-pad", undefined))).toThrow("缺少量測值");
  });
});
