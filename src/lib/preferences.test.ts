import { describe, expect, it } from "vitest";
import { cardProps } from "./card";
import { applyPreferences, preferenceLabels, preferenceNote } from "./preferences";
import { judge } from "./rules";
import { findVehicle, type Vehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;

describe("applyPreferences：把瀏覽器送來的偏好套進車輛資料", () => {
  it("合法偏好會套上，不動到原始資料", () => {
    const prefs = { handling: "一次處理完", priority: "耐用度", longTrip: "沒有", recentIssue: "有", issueNote: "起步有異音" };
    const v = applyPreferences(lin, prefs)!;
    expect(v.preferences).toEqual(prefs);
    expect(v.items).toBe(lin.items);
    expect(lin.preferences).toBeUndefined();
  });

  it("每個欄位都可選：只送一項、空物件都可以", () => {
    expect(applyPreferences(lin, { priority: "安靜和舒適" })!.preferences).toEqual({ priority: "安靜和舒適" });
    expect(applyPreferences(wang, {})!.preferences).toEqual({});
  });

  it("沒送偏好時回傳原本的車輛資料（王先生保留預設偏好）", () => {
    expect(applyPreferences(wang, undefined)).toBe(wang);
    expect(applyPreferences(lin, undefined)).toBe(lin);
  });

  it("反例：格式不對一律失敗", () => {
    for (const bad of [
      null,
      "能等就等",
      1,
      [],
      [{ handling: "能等就等" }],
      { handling: "等一下" }, // 不在選項內
      { handling: "能等" }, // 只差一個字
      { priority: "價格 " }, // 多一個空白
      { longTrip: true }, // 錯誤型別
      { longTrip: 1 },
      { recentIssue: ["有"] },
      { handling: null },
      { budget: "低" }, // 不存在的欄位
      { handling: "能等就等", extra: 1 }, // 多出不認識的欄位
      { recentIssue: "有", issueNote: 1 },
      { recentIssue: "沒有", issueNote: "怪怪的" }, // 沒有異常卻附描述
      { issueNote: "怪怪的" },
      { recentIssue: "有", issueNote: "很".repeat(201) }, // 描述過長
    ]) {
      expect(applyPreferences(wang, bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("異常描述剛好 200 字可以", () => {
    expect(applyPreferences(lin, { recentIssue: "有", issueNote: "很".repeat(200) })).not.toBeNull();
  });
});

describe("可延後項目的「依你的偏好」那一句", () => {
  // 這一句只由畫面依目前偏好算（preferenceNote），伺服器給的卡片項目不帶。
  const items = (v: Vehicle) => cardProps(v).items;
  const noteOf = (v: Vehicle, id: string) => preferenceNote(v.preferences, judge(v.items.find((i) => i.id === id)!));
  const notes = (v: Vehicle) => v.items.map((i) => preferenceNote(v.preferences, judge(i)));
  const withPrefs = (prefs: object, v: Vehicle = wang) => applyPreferences(v, prefs)!;
  // 空氣濾網目視需留意 → 可延後，回廠提醒 6 個月，用來確認 N 取規則的月數。
  const dirtyFilter = { ...wang, items: wang.items.map((i) => (i.id === "air-filter" ? { ...i, visualOk: false } : i)) };

  it("能等就等：可以先不換，N 個月後提醒回來複查（N 取回廠提醒月數）", () => {
    expect(noteOf(withPrefs({ handling: "能等就等" }), "battery")).toBe("可以先不換，3 個月後提醒你回來複查。");
    expect(noteOf(withPrefs({ handling: "能等就等" }, dirtyFilter), "air-filter")).toBe("可以先不換，6 個月後提醒你回來複查。");
  });

  it("一次處理完：今天一起換，下次不用再跑一趟", () => {
    expect(noteOf(withPrefs({ handling: "一次處理完" }), "battery")).toBe("今天一起換，下次不用再跑一趟。");
  });

  it("有長途行程：再加一句出發前可以請專員安排再測一次", () => {
    expect(noteOf(wang, "battery")).toBe("可以先不換，3 個月後提醒你回來複查。出發前可以請專員安排再測一次。");
    expect(noteOf(withPrefs({ longTrip: "有" }), "battery")).toBe("出發前可以請專員安排再測一次。");
  });

  it("反例：沒有長途行程、只填最在意或異常，都沒有這一句", () => {
    expect(noteOf(withPrefs({ handling: "能等就等", longTrip: "沒有" }), "battery")).toBe("可以先不換，3 個月後提醒你回來複查。");
    expect(noteOf(withPrefs({ priority: "價格", recentIssue: "有", longTrip: "沒有" }), "battery")).toBeUndefined();
    expect(noteOf(withPrefs({}), "battery")).toBeUndefined();
  });

  it("反例：必須更換、目前不用換的項目沒有這一句", () => {
    for (const prefs of [{ handling: "能等就等", longTrip: "有" }, { handling: "一次處理完", longTrip: "有" }]) {
      const v = withPrefs(prefs);
      expect(noteOf(v, "brake-pad")).toBeUndefined(); // 必須更換
      for (const id of ["tire", "air-filter", "wiper"]) expect(noteOf(v, id)).toBeUndefined(); // 目前不用換
    }
    const linPrefs = withPrefs({ handling: "能等就等", longTrip: "有" }, lin);
    for (const n of notes(linPrefs)) expect(n).toBeUndefined(); // 林小姐沒有可延後項目
  });

  it("沒有偏好：所有項目都沒有這一句", () => {
    for (const n of notes(lin)) expect(n).toBeUndefined();
    for (const n of notes({ ...wang, preferences: undefined })) expect(n).toBeUndefined();
  });

  it("伺服器給的卡片項目不帶這一句（只留畫面一個來源）", () => {
    for (const i of items(wang)) expect(i.preferenceNote).toBeUndefined();
  });

  it("同一台車換不同偏好：結論、安全門檻、價格、顯示的項目、款式清單和排序完全相同", () => {
    const tireMust = { ...wang, items: wang.items.map((i) => (i.id === "tire" ? { ...i, measurement: { value: 1, unit: "mm" } } : i)) };
    const strip = (v: Vehicle) => items(v);
    const variants = [
      { ...tireMust, preferences: undefined },
      withPrefs({ handling: "能等就等", priority: "價格", longTrip: "有", recentIssue: "沒有" }, tireMust),
      withPrefs({ handling: "一次處理完", priority: "耐用度", longTrip: "沒有", recentIssue: "有", issueNote: "怪聲" }, tireMust),
      withPrefs({ priority: "安靜和舒適" }, tireMust),
    ];
    const base = strip(variants[0]);
    expect(base.find((i) => i.id === "tire")!.options).toHaveLength(3);
    for (const v of variants) expect(strip(v)).toEqual(base);
  });
});

describe("決策卡上方的「你的偏好」", () => {
  it("王先生預設已填好：顯示 4 個偏好答案", () => {
    expect(cardProps(wang).vehicle.preferences).toEqual({ handling: "能等就等", priority: "價格", longTrip: "有", recentIssue: "沒有" });
    expect(preferenceLabels(cardProps(wang).vehicle.preferences!)).toEqual(["能等就等", "最在意價格", "近期有長途行程", "最近沒有異常"]);
  });

  it("另一組偏好的顯示文字", () => {
    const v = applyPreferences(lin, { handling: "一次處理完", priority: "安靜和舒適", longTrip: "沒有", recentIssue: "有" })!;
    expect(preferenceLabels(v.preferences!)).toEqual(["一次處理完", "最在意安靜和舒適", "近期沒有長途行程", "最近有異常"]);
    expect(preferenceLabels({ priority: "耐用度" })).toEqual(["最在意耐用度"]);
  });

  it("反例：林小姐沒有預設偏好，卡片沒有這個區塊", () => {
    expect(cardProps(lin).vehicle.preferences).toBeUndefined();
  });
});
