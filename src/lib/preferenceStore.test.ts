import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePreferences, type OwnerPreferences } from "./preferences";
import {
  cleanPreferences,
  readPreferences,
  savePreferences,
  storedPreferences,
  subscribePreferences,
  type PreferenceScope,
} from "./preferenceStore";

// 每個測試用不同的車主和工單，避免共用「存不了時的記憶」。
const scope = (name: string, inspectedAt = "2026-09-25"): PreferenceScope => ({ ownerId: `owner-${name}`, vehicleId: name, inspectedAt });
const nextVisit = (s: PreferenceScope): PreferenceScope => ({ ...s, inspectedAt: "2027-03-25" });
const load = (s: PreferenceScope, fallback?: OwnerPreferences) => storedPreferences(readPreferences(s), fallback);

function fakeStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
  return data;
}

const wangDefault: OwnerPreferences = { handling: "定期追蹤，到時再換", priority: "價格", longTrip: "有", recentIssue: "沒有" };

describe("savePreferences / readPreferences：長期偏好存車主、本次情況存這次工單", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("存成兩份：長期偏好以車主為鍵，本次情況以車輛＋工單日期為鍵；讀回合成一份", () => {
    const data = fakeStorage();
    const s = scope("wang-ok");
    savePreferences(s, { handling: "今天一起換，少跑一趟", longTrip: "有" });
    expect(JSON.parse(data.get("owner-preferences:long:owner-wang-ok")!)).toEqual({ handling: "今天一起換，少跑一趟" });
    expect(JSON.parse(data.get("owner-preferences:visit:wang-ok:2026-09-25")!)).toEqual({ longTrip: "有" });
    expect(load(s, wangDefault)).toEqual({ handling: "今天一起換，少跑一趟", longTrip: "有" });
    expect(load(scope("lin-ok"))).toBeUndefined();
  });

  it("換工單：長期偏好沿用，本次情況不沿用", () => {
    fakeStorage();
    const s = scope("wang-next");
    savePreferences(s, { handling: "今天一起換，少跑一趟", priority: "耐用度", recentIssue: "有", issueNote: "起步有異音" });
    expect(load(nextVisit(s))).toEqual({ handling: "今天一起換，少跑一趟", priority: "耐用度" });
    // 反例：同一張工單還是讀得到本次情況。
    expect(load(s)).toEqual({ handling: "今天一起換，少跑一趟", priority: "耐用度", recentIssue: "有", issueNote: "起步有異音" });
  });

  it("跳過問卷只記在這次工單；下次回廠會再邀請", () => {
    fakeStorage();
    const s = scope("lin-skip");
    savePreferences(s, "skipped");
    expect(load(s)).toBe("skipped");
    expect(load(nextVisit(s))).toBeUndefined();
  });

  it("瀏覽器不能存檔時不出錯，這次開著的頁面仍記得改過的值，也會通知畫面", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
    const s = scope("lin-fail");
    expect(load(s)).toBeUndefined();
    const seen = vi.fn();
    const stop = subscribePreferences(seen);
    savePreferences(s, "skipped");
    stop();
    expect(load(s)).toBe("skipped");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  // 審查發現：卡片頁改了偏好，技師頁（另一個分頁）原本讀記憶體裡的舊值，也收不到通知。
  it("另一個分頁改了偏好：這一頁收到 storage 事件，讀到新值", () => {
    const data = fakeStorage();
    vi.stubGlobal("window", new EventTarget());
    const s = scope("wang-tabs");
    savePreferences(s, { handling: "定期追蹤，到時再換" });
    const seen = vi.fn();
    const stop = subscribePreferences(seen);
    // 另一個分頁寫進同一份 localStorage，瀏覽器對其他分頁發出 storage 事件。
    data.set("owner-preferences:long:owner-wang-tabs", JSON.stringify({ handling: "今天一起換，少跑一趟" }));
    window.dispatchEvent(new Event("storage"));
    stop();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(load(s)).toEqual({ handling: "今天一起換，少跑一趟" });
    // 取消訂閱後不再收到通知。
    window.dispatchEvent(new Event("storage"));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("沒有 localStorage（伺服器端）也不出錯", () => {
    vi.stubGlobal("localStorage", undefined);
    const s = scope("none");
    expect(load(s)).toBeUndefined();
    savePreferences(s, {});
    expect(load(s)).toEqual({});
  });
});

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

describe("storedPreferences：讀回保存的偏好", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("沒存過時用預設（示意：和泰車主檔已有的偏好）：王先生有，林小姐沒有", () => {
    fakeStorage();
    expect(load(scope("wang-d"), wangDefault)).toEqual(wangDefault);
    expect(load(scope("lin-d"))).toBeUndefined();
    expect(storedPreferences(null, wangDefault)).toEqual(wangDefault);
  });

  it("只存了一層：另一層用預設", () => {
    const data = fakeStorage();
    const s = scope("wang-half");
    data.set("owner-preferences:long:owner-wang-half", JSON.stringify({ handling: "今天一起換，少跑一趟" }));
    expect(load(s, wangDefault)).toEqual({ handling: "今天一起換，少跑一趟", longTrip: "有", recentIssue: "沒有" });
  });

  // Codex 審查：舊格式沒有工單日期，本次情況不知道是哪一張工單的，只遷移長期偏好。
  it("舊格式（整份以車輛為鍵）：只遷移長期偏好，11/8 改名前的舊選項換成新名稱；本次情況不遷移", () => {
    const data = fakeStorage();
    const s = scope("wang-old");
    const old = { handling: "一次處理完", priority: "耐用度", longTrip: "有", recentIssue: "有", issueNote: "起步有異音" };
    data.set("owner-preferences:wang-old", JSON.stringify(old));
    expect(load(s)).toEqual({ handling: "今天一起換，少跑一趟", priority: "耐用度" });
    // 換工單：長期偏好還在，舊資料的 longTrip:"有" 不出現。
    expect(load(nextVisit(s))).toEqual({ handling: "今天一起換，少跑一趟", priority: "耐用度" });
    // 本次情況改用預設。
    expect(load(nextVisit(s), wangDefault)).toEqual({ handling: "今天一起換，少跑一趟", priority: "耐用度", longTrip: "有", recentIssue: "沒有" });
  });

  it("舊格式的其他寫法：「能等就等」換新名稱；舊的「跳過」屬於本次情況，不遷移", () => {
    const data = fakeStorage();
    data.set("owner-preferences:wang-old2", JSON.stringify({ handling: "能等就等" }));
    expect(load(scope("wang-old2"), wangDefault)).toEqual({ handling: "定期追蹤，到時再換", longTrip: "有", recentIssue: "沒有" });
    data.set("owner-preferences:lin-old", JSON.stringify("skipped"));
    expect(load(scope("lin-old"))).toBeUndefined();
  });

  // Codex 審查：兩層有一層沒寫進 localStorage，就不能刪舊格式，否則重新整理後資料就不見了。
  it.each(["owner-preferences:long:owner-wang-fail1", "owner-preferences:visit:wang-fail1:2026-09-25"])(
    "寫入 %s 失敗：不刪舊格式",
    (failing) => {
      const data = fakeStorage();
      const setItem = localStorage.setItem;
      vi.stubGlobal("localStorage", {
        ...localStorage,
        setItem: (k: string, v: string) => {
          if (k === failing) throw new Error("QuotaExceededError");
          setItem(k, v);
        },
      });
      data.set("owner-preferences:wang-fail1", JSON.stringify({ handling: "能等就等" }));
      savePreferences(scope("wang-fail1"), { handling: "今天一起換，少跑一趟", longTrip: "有" });
      expect(data.has("owner-preferences:wang-fail1")).toBe(true);
    },
  );

  it("新格式存過就蓋過舊格式", () => {
    const data = fakeStorage();
    const s = scope("wang-both");
    data.set("owner-preferences:wang-both", JSON.stringify({ handling: "能等就等", longTrip: "有" }));
    savePreferences(s, { handling: "今天一起換，少跑一趟", longTrip: "沒有" });
    expect(load(s, wangDefault)).toEqual({ handling: "今天一起換，少跑一趟", longTrip: "沒有" });
    // 存過新格式就刪掉舊格式：下次回廠不會從舊資料撿回本次情況。
    expect(data.has("owner-preferences:wang-both")).toBe(false);
    expect(load(nextVisit(s))).toEqual({ handling: "今天一起換，少跑一趟" });
  });

  it("反例：舊名稱只在讀回保存的資料時換，不認得的值照樣回到預設", () => {
    const data = fakeStorage();
    data.set("owner-preferences:long:owner-x1", JSON.stringify({ handling: "隨便" }));
    expect(load(scope("x1"), wangDefault)).toEqual(wangDefault);
    data.set("owner-preferences:long:owner-x2", JSON.stringify({ priority: "能等就等" }));
    expect(load(scope("x2"), wangDefault)).toEqual(wangDefault);
  });

  it("反例：欄位放錯層（長期偏好裡出現本次情況、本次情況裡出現長期偏好）就不採用那一層", () => {
    const data = fakeStorage();
    data.set("owner-preferences:long:owner-x3", JSON.stringify({ handling: "今天一起換，少跑一趟", recentIssue: "有" }));
    data.set("owner-preferences:visit:x3:2026-09-25", JSON.stringify({ priority: "耐用度" }));
    expect(load(scope("x3"), wangDefault)).toEqual(wangDefault);
  });

  it("反例：壞資料一律回到預設（新舊格式都一樣）", () => {
    const bads = [
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
    ];
    const data = fakeStorage();
    bads.forEach((bad, i) => {
      for (const key of [`owner-preferences:bad${i}`, `owner-preferences:long:owner-bad${i}`, `owner-preferences:visit:bad${i}:2026-09-25`]) {
        data.set(key, bad);
      }
      expect(load(scope(`bad${i}`), wangDefault), bad).toEqual(wangDefault);
      expect(load(scope(`bad${i}`)), bad).toBeUndefined();
    });
  });
});
