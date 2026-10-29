import { describe, expect, it } from "vitest";
import { EXCERPTS, findExcerpts } from "./manual";

const ids = (q: string) => findExcerpts(q).map((e) => e.id);

describe("原廠文件片段：關鍵字比對", () => {
  it("問結帳 → 挑到結帳片段", () => {
    expect(ids("結帳可以用 Point 折抵嗎？")).toEqual(["checkout"]);
  });

  it("問中間報告 → 挑到中間報告片段", () => {
    expect(ids("技師另外發現要換的東西會通知我嗎？")).toContain("mid-report");
  });

  it.each(["電瓶多久要檢查一次？", "煞車下個月再換可以嗎？", "輪胎可以撐到下次保養嗎？", "空氣濾網為什麼今天不用換？"])(
    "不相關問題「%s」→ 不挑片段",
    (q) => {
      expect(ids(q)).toEqual([]);
    },
  );

  it("資料檔有 10–15 段，每段有頁碼和內文", () => {
    expect(EXCERPTS.length).toBeGreaterThanOrEqual(10);
    expect(EXCERPTS.length).toBeLessThanOrEqual(15);
    for (const e of EXCERPTS) {
      expect(e.page).toBeGreaterThan(0);
      expect(e.text.length).toBeGreaterThan(0);
    }
    expect(new Set(EXCERPTS.map((e) => e.id)).size).toBe(EXCERPTS.length);
  });
});
