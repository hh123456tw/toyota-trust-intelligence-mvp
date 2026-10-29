import { describe, expect, it } from "vitest";
import { cardContext, sourceLabel, validSources } from "./answers";
import { judge } from "./rules";
import { findVehicle, trendText } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const item = (v: typeof wang, id: string) => v.items.find((i) => i.id === id)!;

describe("量測趨勢：卡片顯示「半年前 → 本次」", () => {
  it("煞車、電瓶、輪胎顯示", () => {
    expect(trendText(item(wang, "brake-pad"))).toBe("半年前 3.5 mm → 本次 2 mm");
    expect(trendText(item(wang, "battery"))).toBe("半年前 72 % → 本次 60 %");
    expect(trendText(item(lin, "tire"))).toBe("半年前 2.5 mm → 本次 1.4 mm");
  });

  it("空氣濾網、雨刷不顯示", () => {
    expect(trendText(item(wang, "air-filter"))).toBeUndefined();
    expect(trendText(item(wang, "wiper"))).toBeUndefined();
  });
});

describe("量測趨勢不進規則引擎", () => {
  it("改變上次量測不改變結論", () => {
    const brake = item(wang, "brake-pad");
    const before = judge(brake);
    for (const value of [0, 2, 10, 100]) {
      expect(judge({ ...brake, previousMeasurement: { value, unit: "mm" } })).toEqual(before);
    }
    expect(judge({ ...brake, previousMeasurement: undefined })).toEqual(before);
  });
});

describe("量測趨勢是 AI 可引用的來源", () => {
  it("來源標籤顯示趨勢", () => {
    expect(sourceLabel(wang, "trend:brake-pad")).toBe("量測趨勢：前煞車來令片 半年前 3.5 mm → 本次 2 mm");
  });

  it("沒有上次量測的項目沒有趨勢來源", () => {
    expect(sourceLabel(wang, "trend:air-filter")).toBeUndefined();
    expect(sourceLabel(wang, "trend:nope")).toBeUndefined();
    expect(validSources(wang, ["trend:brake-pad", "trend:wiper"])).toEqual(["trend:brake-pad"]);
  });

  it("卡片資料給 AI 趨勢和來源代號", () => {
    const ctx = cardContext(wang).檢查項目;
    expect(ctx.find((i) => i.來源代號 === "item:brake-pad")!.量測趨勢).toEqual({
      來源代號: "trend:brake-pad",
      內容: "半年前 3.5 mm → 本次 2 mm",
    });
    expect(ctx.find((i) => i.來源代號 === "item:wiper")!.量測趨勢).toBeNull();
  });
});
