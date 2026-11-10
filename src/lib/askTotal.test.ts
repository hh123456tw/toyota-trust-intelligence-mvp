// 合計由程式計算（t39b）：使用者要求「加總用規則，不要讓 AI 加」。期望句照規格手寫，不用程式重算。
import { describe, expect, it } from "vitest";
import { ask } from "./ask";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const END = "以上都是示意費用，實際以服務廠報價為準。";

// 假 AI：記錄被呼叫幾次。主回答回傳 reply。
function fakeAI(reply: object = { answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] }) {
  const calls: string[] = [];
  const callAI = async (system: string) => {
    calls.push(system);
    return JSON.stringify(reply);
  };
  return { calls, callAI };
}

describe("車主問合計：不呼叫 AI，由程式組句", () => {
  it("王先生沒指定項目：今天必須做的、可延後也一起換的總合計", async () => {
    const ai = fakeAI();
    const r = await ask(wang, "今天全部做完要多少錢？", ai.callAI, { router: false });
    expect(ai.calls).toHaveLength(0);
    expect(r.answer).toBe(
      "今天必須做的：前煞車來令片 NT$3,000、定期保養（機油與機油芯） NT$2,500，合計 NT$5,500。" +
        "如果可延後的項目也一起換：電瓶 NT$3,500、輪胎胎紋 NT$11,200 起（依款式），總合計 NT$20,200 起。" +
        END,
    );
    expect(r.checkResult).toBe("通過");
    expect(r.trace.noAI).toBe(true);
  });

  it("林小姐沒指定項目：沒有可延後的項目，只列今天必須做的", async () => {
    const ai = fakeAI();
    const r = await ask(lin, "全部要多少錢？", ai.callAI, { router: false });
    expect(ai.calls).toHaveLength(0);
    expect(r.answer).toBe("今天必須做的：輪胎胎紋 NT$5,600 起（依款式）、定期保養（機油與機油芯） NT$2,500，合計 NT$8,100 起。" + END);
  });

  it("指定煞車和電瓶：只加總這兩項 6,500", async () => {
    const ai = fakeAI();
    const r = await ask(wang, "我今天只換煞車來令片和電瓶，卡上合計多少錢？", ai.callAI, { router: false });
    expect(ai.calls).toHaveLength(0);
    expect(r.answer).toBe("前煞車來令片 NT$3,000、電瓶 NT$3,500，合計 NT$6,500。" + END);
    expect(r.sources).toEqual(["item:brake-pad", "item:battery"]);
  });

  it("指定機油和煞車：定期保養也算進去", async () => {
    const ai = fakeAI();
    const r = await ask(wang, "機油加煞車一共多少？", ai.callAI, { router: false });
    expect(ai.calls).toHaveLength(0);
    expect(r.answer).toBe("前煞車來令片 NT$3,000、定期保養（機油與機油芯） NT$2,500，合計 NT$5,500。" + END);
    expect(r.sources).toEqual(["item:brake-pad", "routine"]);
  });

  it("指定的項目卡片上正常：沒有費用，不列入合計", async () => {
    const r = await ask(wang, "電瓶和空氣濾網加起來多少錢？", fakeAI().callAI, { router: false });
    expect(r.answer).toBe("電瓶 NT$3,500。空氣濾網檢查正常，目前不用換，沒有費用。" + END);
  });

  it.each([
    "電瓶先不換，今天總共多少錢？",
    "除了電瓶，其他加起來多少？",
    "不換電瓶的話，全部多少錢？",
    "輪胎選最便宜的，全部多少錢？",
    "我選米其林輪胎，全部加起來多少",
  ])("code review：程式聽不懂的組合「%s」→ 只列各項價格、不算合計、轉專員", async (q) => {
    const ai = fakeAI();
    const r = await ask(wang, q, ai.callAI, { router: false });
    expect(r.answer).toBe(
      "各項示意費用：前煞車來令片 NT$3,000、電瓶 NT$3,500、輪胎胎紋 NT$11,200 起（依款式）、定期保養（機油與機油芯） NT$2,500。要怎麼組合，可以按下面的按鈕請專員幫你算。" + END,
    );
    expect(r.answer).not.toMatch(/合計/);
    expect(r.escalate).toBe(true);
    expect(ai.calls).toHaveLength(0);
  });

  it("「總共跑了幾萬公里」不是問錢", async () => {
    const ai = fakeAI();
    await ask(wang, "總共跑了幾萬公里要換機油？", ai.callAI, { router: false });
    expect(ai.calls.length).toBeGreaterThan(0);
  });

  it.each(["電瓶多少錢？", "全部檢查多少項目？", "全部的費用都含工資嗎？", "全部多少錢？可以刷卡嗎？"])("反例：「%s」不是問合計，照常交給 AI", async (q) => {
    const ai = fakeAI();
    await ask(wang, q, ai.callAI, { router: false });
    expect(ai.calls.length).toBeGreaterThan(0);
  });
});

describe("AI 主回答不能自己加總金額", () => {
  const brakeAndBattery = {
    sources: ["item:brake-pad", "item:battery"],
    escalate: false,
    itemConclusions: [
      { id: "item:brake-pad", conclusion: "必須更換" },
      { id: "item:battery", conclusion: "可延後" },
    ],
  };

  it("AI 自己算合計 6,500 → 攔下，改用程式的合計句", async () => {
    const ai = fakeAI({ ...brakeAndBattery, answer: "前煞車來令片 NT$3,000，電瓶 NT$3,500，合計 NT$6,500，實際以服務廠報價為準。" });
    const r = await ask(wang, "煞車和電瓶各多少錢？", ai.callAI, { router: false });
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toMatch(/加總.*6,500/);
    expect(r.answer).toBe("前煞車來令片 NT$3,000、電瓶 NT$3,500，合計 NT$6,500。" + END);
  });

  it("Codex 審查：用單價冒充合計（合計 NT$3,500）→ 攔下", async () => {
    const ai = fakeAI({ ...brakeAndBattery, answer: "煞車必須更換，電瓶可延後，合計 NT$3,500，實際以服務廠報價為準。" });
    const r = await ask(wang, "煞車和電瓶各多少錢？", ai.callAI, { router: false });
    expect(r.checkResult).toBe("攔下");
  });

  it("單一項目的價格照常通過", async () => {
    const ai = fakeAI({ ...brakeAndBattery, answer: "前煞車來令片示意費用 NT$3,000，電瓶示意費用 NT$3,500，實際以服務廠報價為準。" });
    const r = await ask(wang, "煞車和電瓶各多少錢？", ai.callAI, { router: false });
    expect(r.checkResult).toBe("通過");
  });

  it("主回答提示詞要求不要自己加總", async () => {
    const ai = fakeAI();
    await ask(wang, "電瓶多少錢？", ai.callAI, { router: false });
    expect(ai.calls[0]).toContain("不要自己加總金額；車主問合計時，程式會回答");
  });
});
