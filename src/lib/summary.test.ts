import { describe, expect, it } from "vitest";
import { ruleSummary, summarize } from "./ask";
import { judge } from "./rules";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;

const ALL = wang.items.map((i) => ({ id: `item:${i.id}`, conclusion: judge(i).conclusion }));
const GOOD =
  "前煞車來令片量測 2 mm，低於安全門檻 3 mm，今天必須更換。電瓶健康度 60%，可延後，3 個月後提醒回廠。空氣濾網、雨刷、輪胎胎紋狀況正常，今天不用處理。";

function fakeAI(answer: string, extra: object = {}) {
  return async () =>
    JSON.stringify({ answer, sources: ["item:brake-pad", "item:battery"], escalate: false, itemConclusions: ALL, ...extra });
}

describe("summarize：接待摘要", () => {
  it("正確的摘要 → 通過，原文顯示", async () => {
    const r = await summarize(wang, fakeAI(GOOD));
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(GOOD);
  });

  it("說必須更換的煞車可以延後 → 攔下，改顯示規則版摘要", async () => {
    const r = await summarize(wang, fakeAI(GOOD.replace("今天必須更換", "可以延後到下個月")));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(ruleSummary(wang).answer);
  });

  it("對正常的空氣濾網推銷更換 → 攔下", async () => {
    const r = await summarize(wang, fakeAI(`${GOOD}空氣濾網建議今天一起換。`));
    expect(r.checkResult).toBe("攔下");
  });

  it("漏掉可延後的電瓶 → 攔下", async () => {
    const r = await summarize(wang, fakeAI("前煞車來令片量測 2 mm，低於安全門檻 3 mm，今天必須更換。其他狀況正常。"));
    expect(r).toMatchObject({ checkResult: "攔下", blockedReason: "摘要漏了可延後的電瓶" });
  });

  it("只提到「遙控器電池」不算提到電瓶 → 仍算漏掉", async () => {
    const r = await summarize(wang, fakeAI("前煞車來令片 2 mm，低於安全門檻 3 mm，必須更換。遙控器電池正常。"));
    expect(r.blockedReason).toBe("摘要漏了可延後的電瓶");
  });

  it("AI 呼叫丟錯 → 丟錯，不回傳假摘要", async () => {
    await expect(
      summarize(wang, async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow("down");
  });
});

describe("ruleSummary：規則版摘要", () => {
  it.each([wang, lin])("$owner：每個項目都出現，結論和規則引擎一致，本身通過答案檢查", async (v) => {
    const s = ruleSummary(v);
    for (const i of v.items) expect(s.answer).toContain(i.name);
    expect(s.sources).toEqual(v.items.map((i) => `item:${i.id}`));
    const conclusions = v.items.map((i) => ({ id: `item:${i.id}`, conclusion: judge(i).conclusion }));
    const r = await summarize(v, async () => JSON.stringify({ ...s, itemConclusions: conclusions }));
    expect(r.checkResult).toBe("通過");
  });
});
