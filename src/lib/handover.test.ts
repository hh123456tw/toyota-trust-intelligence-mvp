import { describe, expect, it } from "vitest";
import { cardItems, withMeasurement } from "./card";
import { choiceKey, handover, pruneChoices, staffLine, type Choice } from "./handover";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const items = cardItems(wang.items);
const battery = items.find((i) => i.id === "battery")!;
const run = (choices: Record<string, Choice> = {}, list = items) => handover(list, choices, wang.routine, wang.nextServiceKm);
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("handover：交車說明", () => {
  it("必須更換：車主還沒授權 → 待車主授權，不在今天完成；授權後才進今天完成", () => {
    const brake = items.find((i) => i.id === "brake-pad")!;
    const h = run();
    expect(names(h.done)).toEqual(["機油與機油芯"]);
    expect(h.pending.map((p) => p.item.id)).toEqual(["brake-pad"]);
    expect(h.pending[0].note).toContain("待車主授權");
    const ok = run({ [choiceKey(brake)]: "today" });
    expect(names(ok.done)).toEqual(["機油與機油芯", "前煞車來令片"]);
    expect(ok.pending).toEqual([]);
  });

  it("可延後：沒選 → 尚未選擇（預設提醒月數），不寫成今天延後；選延後 → 今天延後；選今天換 → 今天完成", () => {
    const none = run();
    expect(none.deferred).toEqual([]);
    expect(none.undecided.map((d) => [d.item.id, d.months])).toEqual([["battery", 3], ["tire", 3]]);
    const deferred = run({ [choiceKey(battery)]: "defer" });
    expect(deferred.deferred.map((d) => d.item.id)).toEqual(["battery"]);
    expect(deferred.undecided.map((d) => d.item.id)).toEqual(["tire"]);
    const today = run({ [choiceKey(battery)]: "today" });
    expect(names(today.done)).toContain("電瓶");
    expect(today.deferred).toEqual([]);
    expect(today.undecided.map((d) => d.item.id)).toEqual(["tire"]);
  });

  it("正常項目只在目前不用換，不會跑進今天完成（反例）", () => {
    const h = run();
    expect(h.fine.map((i) => i.id)).toEqual(["air-filter", "wiper"]);
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
    expect(run().reminders).toEqual(["3 個月後電瓶複查", "3 個月後輪胎胎紋複查", "約 5,000 km 後定期保養"]);
    expect(run({ [choiceKey(battery)]: "today" }).reminders).toEqual(["3 個月後輪胎胎紋複查", "約 5,000 km 後定期保養"]);
  });
});

describe("staffLine：專員建議說法", () => {
  it("王先生：必須更換 → 可延後 → 正常，項目不漏", () => {
    expect(staffLine(items)).toBe("今天優先處理前煞車來令片。電瓶、輪胎胎紋可以延後。空氣濾網、雨刷目前不用換。");
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

describe("pruneChoices 與殘留選擇（Codex review）", () => {
  it("往返：60% 選今天換 → 80% 正常 → 60%，舊選擇不復活", () => {
    let choices: Record<string, Choice> = { [choiceKey(battery)]: "today" };
    choices = pruneChoices(choices, cardItems(withMeasurement(wang.items, "battery", 80)));
    expect(choices).toEqual({});
    const back = cardItems(withMeasurement(wang.items, "battery", 60));
    expect(names(run(pruneChoices(choices, back), back).done)).not.toContain("電瓶");
  });

  it("結論沒變的選擇保留", () => {
    const choices = { [choiceKey(battery)]: "defer" as Choice };
    expect(pruneChoices(choices, cardItems(withMeasurement(wang.items, "battery", 65)))).toEqual(choices);
  });

  it("反例：正常項目帶殘留的「今天換」也不會進今天完成；必須更換帶殘留的「延後」也不會被延後", () => {
    const filter = items.find((i) => i.id === "air-filter")!;
    const brake = items.find((i) => i.id === "brake-pad")!;
    const h = run({ [`${filter.id}:可延後`]: "today", [choiceKey(filter)]: "today", [choiceKey(brake)]: "defer" });
    expect(names(h.done)).not.toContain("空氣濾網");
    expect(h.pending.map((p) => p.item.id)).toEqual(["brake-pad"]);
    expect(h.deferred.map((d) => d.item.id)).not.toContain("brake-pad");
    expect(h.undecided.map((d) => d.item.id)).not.toContain("brake-pad");
  });

  it("今天完成的檢查項目附判定依據用的項目資料；定期保養項目沒有", () => {
    const brake = items.find((i) => i.id === "brake-pad")!;
    const done = run({ [choiceKey(brake)]: "today" }).done;
    expect(done.find((d) => d.name === "前煞車來令片")!.item!.measuredAt).toBe("10:42");
    expect(done.find((d) => d.name === "機油與機油芯")!.item).toBeUndefined();
  });
});

describe("staffLine 邊界", () => {
  it("沒有可延後、沒有正常項目時，不出現對應句子", () => {
    const allMust = items.filter((i) => i.verdict.conclusion === "必須更換");
    expect(staffLine(allMust)).toBe("今天優先處理前煞車來令片。");
    const allFine = items.filter((i) => i.verdict.conclusion === "正常");
    expect(staffLine(allFine)).toBe("空氣濾網、雨刷目前不用換。");
    expect(staffLine([])).toBe("");
  });
});
