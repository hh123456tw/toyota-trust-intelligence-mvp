import { describe, expect, it } from "vitest";
import { cardItems, withMeasurement } from "./card";
import { choiceKey, handover, staffLine, type Choice } from "./handover";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const items = cardItems(wang.items);
const battery = items.find((i) => i.id === "battery")!;
const run = (choices: Record<string, Choice> = {}, list = items) => handover(list, choices, wang.routine, wang.nextServiceKm);
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("handover：交車說明", () => {
  it("必須更換一律在今天完成；定期保養項目排最前面", () => {
    expect(names(run().done)).toEqual(["機油與機油芯", "前煞車來令片"]);
  });

  it("可延後：沒選或選延後 → 今天延後並附提醒月數；選今天換 → 今天完成", () => {
    expect(run().deferred.map((d) => [d.item.id, d.months])).toEqual([["battery", 3]]);
    expect(run({ [choiceKey(battery)]: "defer" }).deferred).toHaveLength(1);
    const today = run({ [choiceKey(battery)]: "today" });
    expect(names(today.done)).toContain("電瓶");
    expect(today.deferred).toEqual([]);
  });

  it("正常項目只在目前不用換，不會跑進今天完成（反例）", () => {
    const h = run();
    expect(h.fine.map((i) => i.id)).toEqual(["air-filter", "wiper", "tire"]);
    expect(names(h.done)).not.toContain("空氣濾網");
  });

  it("技師改值讓結論改變後，舊的選擇不沿用", () => {
    // 電瓶 60% 可延後時選了今天換；技師改成 80% 變正常，舊的「今天換」不能讓它出現在今天完成。
    const choices = { [choiceKey(battery)]: "today" as Choice };
    const edited = cardItems(withMeasurement(wang.items, "battery", 80));
    const h = run(choices, edited);
    expect(names(h.done)).not.toContain("電瓶");
    expect(h.fine.map((i) => i.id)).toContain("battery");
  });

  it("下次提醒：延後項目的複查月數，加上下次定期保養里程", () => {
    expect(run().reminders).toEqual(["3 個月後電瓶複查", "約 5,000 km 後定期保養"]);
    expect(run({ [choiceKey(battery)]: "today" }).reminders).toEqual(["約 5,000 km 後定期保養"]);
  });
});

describe("staffLine：專員建議說法", () => {
  it("王先生：必須更換 → 可延後 → 正常，項目不漏", () => {
    expect(staffLine(items)).toBe("今天優先處理前煞車來令片。電瓶可以延後。空氣濾網、雨刷、輪胎胎紋目前不用換。");
  });

  it("沒有必須更換時不說「今天優先處理」", () => {
    const line = staffLine(cardItems(withMeasurement(wang.items, "brake-pad", 6)));
    expect(line).not.toContain("今天優先處理");
    expect(line).toContain("前煞車來令片");
  });

  it("林小姐：輪胎今天處理，其餘不用換", () => {
    expect(staffLine(cardItems(lin.items))).toBe("今天優先處理輪胎胎紋。前煞車來令片、電瓶、空氣濾網目前不用換。");
  });
});
