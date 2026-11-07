import { describe, expect, it } from "vitest";
import { cardContext, contextSources, sourceLabel } from "./answers";
import { ask } from "./ask";
import { cardItems, cardProps } from "./card";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;

describe("在原廠做的差別：卡片內容", () => {
  it("只有可延後的項目有，必須更換和正常的項目沒有", () => {
    for (const v of [wang, lin]) {
      for (const item of cardItems(v.items)) {
        if (item.verdict.conclusion === "可延後") expect(item.dealerFacts?.length).toBeGreaterThan(0);
        else expect(item.dealerFacts).toBeUndefined();
      }
    }
    // 王先生的電瓶是可延後，確認上面的迴圈真的測到可延後的項目。
    expect(cardItems(wang.items).find((i) => i.id === "battery")!.verdict.conclusion).toBe("可延後");
  });

  it("每一條都標示意，包含保養紀錄延續和原廠零件保固", () => {
    const facts = cardItems(wang.items).find((i) => i.id === "battery")!.dealerFacts!;
    expect(facts.map((f) => f.title)).toEqual(["保養紀錄延續", "原廠零件保固"]);
    for (const f of facts) expect(f.text).toContain("示意");
  });

  it("沒有和外面保養廠比較的字句，也沒有保固年限之類的數字", () => {
    const text = cardItems(wang.items)
      .find((i) => i.id === "battery")!
      .dealerFacts!.map((f) => f.title + f.text)
      .join();
    expect(text).not.toMatch(/外面|別家|其他(?:保養|修車)?廠|比較便宜|比較貴|比較差|更好|更便宜/);
    expect(text).not.toMatch(/\d/);
  });
});

describe("在原廠做的差別：AI 卡片資料", () => {
  it("卡片資料包含這些事實和來源代號", () => {
    const facts = cardContext(wang).在原廠做的差別;
    expect(facts).toEqual([
      expect.objectContaining({ 來源代號: "dealer:record", 項目: "保養紀錄延續" }),
      expect.objectContaining({ 來源代號: "dealer:parts-warranty", 項目: "原廠零件保固" }),
    ]);
    expect(contextSources(wang)).toEqual(expect.arrayContaining(["dealer:record", "dealer:parts-warranty"]));
  });

  it("來源顯示得出名稱，卡片畫面也拿得到", () => {
    expect(sourceLabel(wang, "dealer:record")).toBe("在原廠做的差別（示意）：保養紀錄延續");
    expect(cardProps(wang).sourceLabels["dealer:parts-warranty"]).toBe("在原廠做的差別（示意）：原廠零件保固");
  });

  it("反例：不存在的代號沒有名稱", () => {
    expect(sourceLabel(wang, "dealer:price")).toBeUndefined();
    expect(sourceLabel(wang, "dealer:")).toBeUndefined();
    expect(sourceLabel(wang, "dealerrecord")).toBeUndefined();
  });
});

describe("在原廠做的差別：假 AI 追問", () => {
  const fakeAI = (reply: object) => async () => JSON.stringify(reply);
  const question = "過保還要回原廠嗎？";

  it("AI 引用事實並附正確來源 → 通過，來源保留", async () => {
    const answer = "可以自己決定。在原廠做，這次的量測會留在保養紀錄，下次回廠技師看得到；原廠零件也有零件保固（示意）。";
    const sources = ["dealer:record", "dealer:parts-warranty"];
    const r = await ask(wang, question, fakeAI({ answer, sources, escalate: false, itemConclusions: [] }));
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(answer);
    expect(r.sources).toEqual(sources);
  });

  it("反例：來源代號寫錯 → 攔下", async () => {
    const r = await ask(
      wang,
      question,
      fakeAI({ answer: "原廠零件有零件保固（示意）。", sources: ["dealer:warranty-years"], escalate: false, itemConclusions: [] }),
    );
    expect(r.checkResult).toBe("攔下");
  });
});
