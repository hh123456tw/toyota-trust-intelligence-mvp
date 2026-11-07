import { describe, expect, it } from "vitest";
import {
  cardItems,
  cardProps,
  drivingAdvice,
  PRICE_FIRST_MIN_QUESTIONS,
  priceFirstNote,
  SHORT_TRIP_ADVICE_MIN_RATIO,
  withMeasurement,
} from "./card";
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

describe("gauge：量測刻度條", () => {
  it("煞車帶本次、上次和兩個門檻；改值後刻度跟著變", () => {
    expect(brake(cardItems(wang.items)).gauge).toEqual({ value: 2, previous: 3.5, unit: "mm", mustBelow: 3, deferBelow: 5 });
    expect(brake(cardItems(withMeasurement(wang.items, "brake-pad", 4))).gauge!.value).toBe(4);
  });

  it("電瓶不是安全項目：沒有安全門檻；目視型項目沒有刻度條", () => {
    const items = cardItems(wang.items);
    expect(items.find((i) => i.id === "battery")!.gauge!.mustBelow).toBeUndefined();
    expect(items.find((i) => i.id === "air-filter")!.gauge).toBeUndefined();
    expect(items.find((i) => i.id === "wiper")!.gauge).toBeUndefined();
  });
});

describe("priceFirstNote：上次回廠的追問紀錄決定是否先列費用", () => {
  const lin = findVehicle("lin")!;
  const withQuestions = (n: number) => ({ ...wang, lastVisitRecord: { priceQuestions: n } });

  it("王先生問過 4 次費用 → 先列費用，說明寫出次數", () => {
    expect(priceFirstNote(wang)).toBe("上次回廠時，你在決策卡追問了 4 次費用（示意），先把費用列在這裡。");
    expect(priceFirstNote(wang)).not.toContain("App");
  });

  it("剛好 3 次 → 先列；2 次 → 不先列", () => {
    expect(priceFirstNote(withQuestions(PRICE_FIRST_MIN_QUESTIONS))).toBeDefined();
    expect(priceFirstNote(withQuestions(PRICE_FIRST_MIN_QUESTIONS - 1))).toBeUndefined();
  });

  it("林小姐沒有追問紀錄 → 不先列", () => {
    expect(priceFirstNote(lin)).toBeUndefined();
  });

  it("cardProps 把說明帶到卡片；林小姐沒有", () => {
    expect(cardProps(wang).vehicle.priceFirstNote).toBeDefined();
    expect(cardProps(lin).vehicle.priceFirstNote).toBeUndefined();
  });
});

describe("drivingAdvice：行車摘要的規則建議", () => {
  const lin = findVehicle("lin")!;
  const withRatio = (r: number) => ({ ...wang, drivingSummary: { ...wang.drivingSummary, shortTripRatio: r } });

  it("王先生 78% 短程 → 有建議", () => {
    expect(drivingAdvice(wang)).toContain("每週安排一次較長距離行駛");
  });

  it("剛好 50% → 有建議；49% → 沒有", () => {
    expect(drivingAdvice(withRatio(SHORT_TRIP_ADVICE_MIN_RATIO))).toBeDefined();
    expect(drivingAdvice(withRatio(SHORT_TRIP_ADVICE_MIN_RATIO - 1))).toBeUndefined();
  });

  it("林小姐 20% 短程、多跑長途 → 沒有建議", () => {
    expect(drivingAdvice(lin)).toBeUndefined();
  });
});

describe("cca：電瓶測試器讀值只顯示，不改判定", () => {
  it("電瓶帶出 CCA；結論仍由健康度 60% 判定為可延後", () => {
    const battery = cardItems(wang.items).find((i) => i.id === "battery")!;
    expect(battery.cca).toEqual({ value: 340, standard: 430 });
    expect(battery.verdict.conclusion).toBe("可延後");
  });

  it("CCA 拿掉，結論一樣", () => {
    const noCca = wang.items.map((i) => ({ ...i, cca: undefined }));
    const a = cardItems(wang.items).map((i) => i.verdict);
    const b = cardItems(noCca).map((i) => i.verdict);
    expect(b).toEqual(a);
  });
});

describe("withMeasurement：改值後不留舊的 CCA", () => {
  it("電瓶改值 → CCA 拿掉；煞車改值 → 電瓶 CCA 保留", () => {
    const battery = (items: ReturnType<typeof cardItems>) => items.find((i) => i.id === "battery")!;
    expect(battery(cardItems(withMeasurement(wang.items, "battery", 80))).cca).toBeUndefined();
    expect(battery(cardItems(withMeasurement(wang.items, "brake-pad", 4))).cca).toEqual({ value: 340, standard: 430 });
  });
});
