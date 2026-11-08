import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanPreferences, readPreferences, savePreferences, storedPreferences, subscribePreferences } from "./preferenceStore";

describe("savePreferences / readPreferences：存在這支手機的瀏覽器", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("存進 localStorage，重新整理後讀得回來", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    });
    savePreferences("wang-ok", { handling: "今天一起換，少跑一趟" });
    expect(JSON.parse(data.get("owner-preferences:wang-ok")!)).toEqual({ handling: "今天一起換，少跑一趟" });
    expect(readPreferences("wang-ok")).toBe(JSON.stringify({ handling: "今天一起換，少跑一趟" }));
    expect(readPreferences("lin-ok")).toBeNull();
  });

  it("瀏覽器不能存檔時不出錯，這次開著的頁面仍記得改過的值，也會通知畫面", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
    expect(readPreferences("lin-fail")).toBeNull();
    const seen = vi.fn();
    const stop = subscribePreferences(seen);
    savePreferences("lin-fail", "skipped");
    stop();
    expect(readPreferences("lin-fail")).toBe('"skipped"');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  // 審查發現：卡片頁改了偏好，技師頁（另一個分頁）原本讀記憶體裡的舊值，也收不到通知。
  it("另一個分頁改了偏好：這一頁收到 storage 事件，讀到新值", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    });
    vi.stubGlobal("window", new EventTarget());
    savePreferences("wang-tabs", { handling: "定期追蹤，到時再換" });
    const seen = vi.fn();
    const stop = subscribePreferences(seen);
    // 另一個分頁寫進同一份 localStorage，瀏覽器對其他分頁發出 storage 事件。
    data.set("owner-preferences:wang-tabs", JSON.stringify({ handling: "今天一起換，少跑一趟" }));
    window.dispatchEvent(new Event("storage"));
    stop();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(readPreferences("wang-tabs")).toBe(JSON.stringify({ handling: "今天一起換，少跑一趟" }));
    // 取消訂閱後不再收到通知。
    window.dispatchEvent(new Event("storage"));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("沒有 localStorage（伺服器端）也不出錯", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readPreferences("none")).toBeNull();
    savePreferences("none", {});
    expect(readPreferences("none")).toBe("{}");
  });
});
import { parsePreferences, type OwnerPreferences } from "./preferences";

describe("cleanPreferences：問卷填完後整理成合法偏好", () => {
  it("跳過的題目不留欄位，結果 API 收得下", () => {
    const p = cleanPreferences({ handling: "今天一起換，少跑一趟", priority: undefined, longTrip: undefined });
    expect(p).toEqual({ handling: "今天一起換，少跑一趟" });
    expect(parsePreferences(p)).toEqual(p);
    expect(cleanPreferences({})).toEqual({});
  });

  it("有異常時保留描述，只去掉前後空白，內文不動", () => {
    expect(cleanPreferences({ recentIssue: "有", issueNote: "  起步時 (冷車) 有異音！ \n" })).toEqual({
      recentIssue: "有",
      issueNote: "起步時 (冷車) 有異音！",
    });
  });

  it("反例：沒有異常、跳過異常題、描述只有空白，都不留描述", () => {
    expect(cleanPreferences({ recentIssue: "沒有", issueNote: "怪怪的" })).toEqual({ recentIssue: "沒有" });
    expect(cleanPreferences({ issueNote: "怪怪的" })).toEqual({});
    expect(cleanPreferences({ recentIssue: "有", issueNote: "   " })).toEqual({ recentIssue: "有" });
  });

  it("描述超過 200 字就截斷，API 才收得下", () => {
    const p = cleanPreferences({ recentIssue: "有", issueNote: "很".repeat(250) });
    expect(p.issueNote).toHaveLength(200);
    expect(parsePreferences(p)).not.toBeNull();
  });
});

const wangDefault: OwnerPreferences = { handling: "定期追蹤，到時再換", priority: "價格", longTrip: "有", recentIssue: "沒有" };

describe("storedPreferences：讀回這支手機保存的偏好", () => {
  it("沒存過時用預設：王先生是預設偏好，林小姐沒有", () => {
    expect(storedPreferences(null, wangDefault)).toEqual(wangDefault);
    expect(storedPreferences(null, undefined)).toBeUndefined();
  });

  it("存過合法偏好就用存的，蓋過預設", () => {
    const saved = { handling: "今天一起換，少跑一趟", recentIssue: "有", issueNote: "起步有異音" };
    expect(storedPreferences(JSON.stringify(saved), wangDefault)).toEqual(saved);
    expect(storedPreferences("{}", wangDefault)).toEqual({});
  });

  it("林小姐跳過問卷：記成 skipped", () => {
    expect(storedPreferences(JSON.stringify("skipped"), undefined)).toBe("skipped");
  });

  it("反例：壞資料一律回到預設", () => {
    for (const bad of [
      "",
      "不是 JSON",
      "{",
      "null",
      "1",
      "[]",
      '"skip"', // 只差幾個字
      '"Skipped"',
      JSON.stringify({ handling: "等一下" }),
      JSON.stringify({ handling: "定期追蹤，到時再換", budget: "低" }),
      JSON.stringify({ recentIssue: "沒有", issueNote: "怪怪的" }),
    ]) {
      expect(storedPreferences(bad, wangDefault), bad).toEqual(wangDefault);
      expect(storedPreferences(bad, undefined), bad).toBeUndefined();
    }
  });
});
