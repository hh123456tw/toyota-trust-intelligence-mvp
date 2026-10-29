import { describe, expect, it } from "vitest";
import { cardItems, withMeasurement } from "./card";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const brake = (items: ReturnType<typeof cardItems>) => items.find((i) => i.id === "brake-pad")!;

describe("cardItems：技師改量測值後重算卡片", () => {
  it("王先生煞車 2 mm → 必須更換，排在最前面", () => {
    const items = cardItems(wang.items);
    expect(items[0].id).toBe("brake-pad");
    expect(items[0].verdict.conclusion).toBe("必須更換");
  });

  it("煞車改 4 mm → 可延後，有回廠提醒月數；改回 2 mm → 必須更換", () => {
    const four = cardItems(withMeasurement(wang.items, "brake-pad", 4));
    expect(brake(four).verdict.conclusion).toBe("可延後");
    expect(brake(four).verdict.reminderMonths).toBe(3);
    // 原備註寫「已低於安全門檻」，改值後不能留著和結論矛盾。
    expect(brake(four).technicianNote).toBe("技師更新量測值為 4 mm。");

    const back = cardItems(withMeasurement(withMeasurement(wang.items, "brake-pad", 4), "brake-pad", 2));
    expect(brake(back).verdict.conclusion).toBe("必須更換");
  });

  it("改值不動到原始資料，也不動到其他項目", () => {
    const edited = withMeasurement(wang.items, "brake-pad", 4);
    expect(wang.items.find((i) => i.id === "brake-pad")!.measurement!.value).toBe(2);
    expect(edited.find((i) => i.id === "battery")).toBe(wang.items.find((i) => i.id === "battery"));
  });

  it("排序：必須更換 → 可延後 → 正常", () => {
    const order = { 必須更換: 0, 可延後: 1, 正常: 2 } as const;
    const ranks = cardItems(wang.items).map((i) => order[i.verdict.conclusion]);
    expect(ranks).toEqual([...ranks].sort());
  });
});
