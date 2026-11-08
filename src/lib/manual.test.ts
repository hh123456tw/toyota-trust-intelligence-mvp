import { describe, expect, it } from "vitest";
import { EXCERPTS, excerptLabel, findExcerpts } from "./manual";

const ids = (q: string) => findExcerpts(q, "TOYOTA COROLLA CROSS").map((e) => e.id);

describe("原廠文件片段：關鍵字比對", () => {
  it("問結帳 → 挑到結帳片段", () => {
    expect(ids("結帳可以用 Point 折抵嗎？")).toEqual(["checkout"]);
  });

  it("問中間報告 → 挑到中間報告片段", () => {
    expect(ids("技師另外發現要換的東西會通知我嗎？")).toContain("mid-report");
  });

  it("問電瓶多久檢查 → 挑到車主手冊的電瓶保養週期，來源標示文件名和頁碼", () => {
    expect(ids("電瓶多久要檢查一次？")).toContain("owner-battery-interval");
    expect(excerptLabel("doc:owner-battery-interval", "TOYOTA COROLLA CROSS")).toBe("COROLLA CROSS 車主手冊 p.216");
  });

  // QA M1：林小姐開 YARIS CROSS，不能拿到 COROLLA CROSS 車主手冊的頁碼。
  it("別的車型 → 不挑 COROLLA CROSS 車主手冊，流程手冊照挑；來源標籤也不給", () => {
    const yaris = (q: string) => findExcerpts(q, "TOYOTA YARIS CROSS").map((e) => e.id);
    for (const q of ["我預算有限，輪胎選哪款？", "電瓶多久要檢查一次？", "煞車下個月再換可以嗎？"])
      expect(yaris(q).filter((id) => id.startsWith("owner-")), q).toEqual([]);
    expect(yaris("結帳可以用 Point 折抵嗎？")).toEqual(["checkout"]);
    expect(excerptLabel("doc:owner-tire-check", "TOYOTA YARIS CROSS")).toBeUndefined();
    expect(excerptLabel("doc:checkout", "TOYOTA YARIS CROSS")).toBe("回廠服務流程手冊 p.9");
    // 反例：COROLLA CROSS 照樣拿得到。
    expect(findExcerpts("輪胎可以撐到下次保養嗎？", "TOYOTA COROLLA CROSS").map((e) => e.id)).toContain("owner-tire-replace");
  });

  it.each([
    ["煞車下個月再換可以嗎？", "owner-brake-interval"],
    ["輪胎可以撐到下次保養嗎？", "owner-tire-replace"],
    ["胎紋磨到多少要換？", "owner-tire-check"],
    ["空氣濾網為什麼今天不用換？", "owner-air-filter-check"],
  ])("問「%s」→ 挑到車主手冊片段 %s", (q, id) => {
    expect(ids(q)).toContain(id);
  });

  it.each(["遙控器電池沒電了怎麼辦？", "煞車油多久換一次？", "煞車燈不亮", "冷氣濾網要換嗎？"])(
    "名稱相近的別的零件「%s」→ 不挑車主手冊片段",
    (q) => {
      expect(ids(q).filter((id) => id.startsWith("owner-"))).toEqual([]);
    },
  );

  it.each(["保養要等多久？", "結帳可以用 Point 折抵嗎？", "預約前會提醒我嗎？"])("流程問題「%s」→ 不挑車主手冊片段", (q) => {
    expect(ids(q).filter((id) => id.startsWith("owner-"))).toEqual([]);
  });

  it("「要等到下個月才換嗎」→ 不挑客休室等待片段", () => {
    expect(ids("要等到下個月才換嗎")).not.toContain("lounge-wait");
  });

  it("「要等多久」→ 挑到客休室等待片段", () => {
    expect(ids("保養要等多久？")).toContain("lounge-wait");
  });

  it("英文關鍵字不分大小寫（point）", () => {
    expect(ids("可以用 point 折抵嗎")).toEqual(["checkout"]);
  });

  it("資料檔有 10–22 段，每段有頁碼和內文", () => {
    expect(EXCERPTS.length).toBeGreaterThanOrEqual(10);
    expect(EXCERPTS.length).toBeLessThanOrEqual(22);
    for (const e of EXCERPTS) {
      expect(e.page).toBeGreaterThan(0);
      expect(e.text.length).toBeGreaterThan(0);
    }
    expect(new Set(EXCERPTS.map((e) => e.id)).size).toBe(EXCERPTS.length);
  });
});
