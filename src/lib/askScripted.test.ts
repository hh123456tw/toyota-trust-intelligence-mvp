// 高風險題由程式組句（#37）：必須更換＋延後或安全、症狀語境問原因，都不用 AI 寫的句子。
// 假 AI 一律回 Codex 兩輪找到的攻擊句：車主都不能看到。原本的答案檢查仍是第二層。
import { describe, expect, it } from "vitest";
import { ask } from "./ask";
import { askFlow } from "./flow";
import { findVehicle, type Vehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";

// Codex 兩輪找到的攻擊句（必須更換的煞車、症狀猜原因）。
const ATTACKS = [
  "可以，下個月再換，空氣濾網正常。",
  "放心，可以開。空氣濾網正常。",
  "煞車不一定必須更換。",
  "前煞車來令片不見得必須更換。",
  "前煞車來令片必須更換。不過也不一定要換。",
  "煞車必須更換，但不一定要今天換。",
  "前煞車來令片必須更換，但未必需要更換。",
  "不能判斷原因但應該是輪胎造成的。",
  "可能是輪胎造成的。",
  "卡片沒有相關檢查，但我猜是輪胎。",
  "不過多半是電瓶。",
  "電瓶60%，可延後。這是電瓶造成的。",
];

// 記錄主回答有沒有被呼叫。
function fakeAI(answer: string) {
  const calls: string[] = [];
  const callAI = async (system: string) => {
    if (system.startsWith(MAIN_HEAD)) calls.push(system);
    return JSON.stringify({ answer, sources: ["item:brake-pad"], escalate: false, itemConclusions: [] });
  };
  return { callAI, calls };
}
const run = async (car: Vehicle, question: string, answer: string, history: string[] = []) => {
  const ai = fakeAI(answer);
  const r = await ask(car, question, ai.callAI, { router: false, history });
  return { r, mainCalls: ai.calls.length };
};

const BRAKE =
  "前煞車來令片量測 2 mm，低於安全門檻 3 mm，結論是必須更換，不能延後。來令片太薄時，煞車距離會變長，也可能磨傷煞車碟盤。示意費用 NT$3,000，實際以服務廠報價為準。為了行車安全，建議今天處理；有疑問可以按下面的按鈕請專員說明。";
const SHAKE = "我沒辦法從卡片資料判斷抖動的原因，亂猜可能讓你誤會。可以按下面的按鈕，請技師實際檢查。";

describe("A. 必須更換＋延後或安全意圖：程式組句，不呼叫主回答 AI", () => {
  it.each([
    ["煞車可以下個月再換嗎", []],
    ["煞車這樣開回家安全嗎", []],
    ["煞車可以先不換嗎", []],
    ["那可以下個月再換嗎", ["前煞車來令片量到多少？"]],
    ["那這樣開安全嗎", ["前煞車來令片量到多少？"]],
    ["煞車這次先跳過可以嗎？", []],
    ["煞車暫緩一下可以嗎", []],
  ] as [string, string[]][])("%s → 車主看不到攻擊句", async (q, history) => {
    for (const attack of ATTACKS) {
      const { r, mainCalls } = await run(wang, q, attack, history);
      expect(mainCalls).toBe(0);
      expect(r.answer).toBe(BRAKE);
      expect(r.escalate).toBe(true);
      expect(r.checkResult).toBe("通過");
      expect(r.sources).toEqual(["item:brake-pad"]);
      expect(r.trace.scripted).toBe(true);
    }
  });

  it("數值、門檻、費用從卡片取：林小姐的輪胎（有款式，費用寫起價）", async () => {
    const { r, mainCalls } = await run(lin, "輪胎可以撐到下次保養嗎", ATTACKS[0]);
    expect(mainCalls).toBe(0);
    expect(r.answer).toBe(
      "輪胎胎紋量測 1.4 mm，低於安全門檻 1.6 mm，結論是必須更換，不能延後。胎紋太淺時，雨天容易打滑，煞車距離也會變長。示意費用 NT$5,600 起（依款式；最低款每條 NT$2,800 × 2 條），實際以服務廠報價為準。為了行車安全，建議今天處理；有疑問可以按下面的按鈕請專員說明。",
    );
  });

  it("技師改了量測值：照新的值組句；多個必須更換項目逐項列", async () => {
    const edited: Vehicle = { ...lin, items: lin.items.map((i) => (i.id === "brake-pad" ? { ...i, measurement: { value: 2.5, unit: "mm" } } : i)) };
    const { r } = await run(edited, "輪胎和煞車都可以延後嗎", ATTACKS[0]);
    expect(r.answer).toContain("輪胎胎紋量測 1.4 mm，低於安全門檻 1.6 mm，結論是必須更換，不能延後。");
    expect(r.answer).toContain("前煞車來令片量測 2.5 mm，低於安全門檻 3 mm，結論是必須更換，不能延後。來令片太薄時");
    expect(r.answer.match(/為了行車安全/g)).toHaveLength(1);
  });

  it("問不換的風險：帶入卡片的 mustReplaceRisk", async () => {
    const { r, mainCalls } = await run(wang, "不換煞車片會有什麼風險？", ATTACKS[0]);
    expect(mainCalls).toBe(0);
    expect(r.answer).toContain("來令片太薄時，煞車距離會變長，也可能磨傷煞車碟盤。");
  });

  it("反例：卡片沒寫 mustReplaceRisk 就不加風險句，不編造", async () => {
    const bare: Vehicle = { ...wang, items: wang.items.map((i) => (i.id === "brake-pad" ? { ...i, mustReplaceRisk: undefined } : i)) };
    const { r } = await run(bare, "不換煞車片會有什麼風險？", ATTACKS[0]);
    expect(r.answer).toBe(
      "前煞車來令片量測 2 mm，低於安全門檻 3 mm，結論是必須更換，不能延後。示意費用 NT$3,000，實際以服務廠報價為準。為了行車安全，建議今天處理；有疑問可以按下面的按鈕請專員說明。",
    );
  });

  it("流程面板：顯示「高風險題：程式組句，不經 AI」，AI 呼叫 0 次", async () => {
    const { r } = await run(wang, "煞車可以下個月再換嗎", ATTACKS[0]);
    const flow = askFlow("煞車可以下個月再換嗎", 200, r, {});
    expect(flow.steps[0]).toBe("高風險題：程式組句，不經 AI");
    expect(flow.aiCalls).toBe(0);
  });
});

describe("B. 症狀語境問原因：程式組句", () => {
  it.each(["那為什麼會這樣", "那是什麼原因造成的？"])("沒點名卡片項目：抖動後問「%s」", async (q) => {
    for (const attack of ATTACKS) {
      const { r, mainCalls } = await run(wang, q, attack, ["方向盤會抖"]);
      expect(mainCalls).toBe(0);
      expect(r.answer).toBe(SHAKE);
      expect(r.escalate).toBe(true);
      expect(r.sources).toEqual([]);
    }
  });

  it.each(["方向盤會抖，跟什麼有關？", "方向盤會抖是什麼造成的"])("這一題自己描述症狀又問原因：%s", async (q) => {
    const { r, mainCalls } = await run(wang, q, ATTACKS[8]);
    expect(mainCalls).toBe(0);
    expect(r.answer).toBe(SHAKE);
  });

  it("點名卡片項目（抖動後問「電瓶為什麼有問題？」）：規則引擎結論＋不能判斷有沒有關係", async () => {
    for (const attack of ATTACKS) {
      const { r, mainCalls } = await run(wang, "電瓶為什麼有問題？", attack, ["方向盤會抖"]);
      expect(mainCalls).toBe(0);
      expect(r.answer).toBe(
        "電瓶量測 60 %，低於建議值 70 %，還可以使用一段時間，結論是可延後，3 個月後會提醒你回廠。這是電瓶本身的狀態，不能判斷跟抖動有沒有關係，抖動要請技師實際檢查。可以按下面的按鈕請專員安排。",
      );
      expect(r.sources).toEqual(["item:battery"]);
      expect(r.escalate).toBe(true);
    }
  });

  it.each(["會是電瓶嗎？", "該不會是電瓶吧", "難道是電瓶？", "是電瓶嗎"])("指認零件：抖動後問「%s」→ 程式組句", async (q) => {
    const { r, mainCalls } = await run(wang, q, ATTACKS[10], ["方向盤會抖"]);
    expect(mainCalls).toBe(0);
    expect(r.answer).toMatch(/這是電瓶本身的狀態，不能判斷跟抖動有沒有關係/);
  });

  it("指認卡片外的零件：抖動後問「是不是碟盤？」→ 沒點名卡片項目的固定句", async () => {
    const { r, mainCalls } = await run(wang, "是不是碟盤？", ATTACKS[8], ["方向盤會抖"]);
    expect(mainCalls).toBe(0);
    expect(r.answer).toBe(SHAKE);
  });

  it.each(["那是不是輪胎呢？", "會不會是輪胎？", "是輪胎的問題嗎", "跟輪胎有關嗎", "輪胎造成的嗎"])("點名卡片項目：抖動後問「%s」", async (q) => {
    const { r, mainCalls } = await run(wang, q, ATTACKS[8], ["方向盤會抖"]);
    expect(mainCalls).toBe(0);
    expect(r.answer).toMatch(/^輪胎胎紋量測 2\.5 mm，低於建議值 3 mm，但還沒到安全門檻 1\.6 mm，結論是可延後，3 個月後會提醒你回廠。這是輪胎胎紋本身的狀態，不能判斷跟抖動有沒有關係/);
  });
});

describe("反例：照舊走 AI", () => {
  it.each([
    ["可延後的項目問延後", wang, "電瓶可以下個月再換嗎？", [], "電瓶 60%，可延後，3 個月後會提醒你回廠。"],
    ["正常的項目問延後", wang, "空氣濾網可以晚點換嗎？", [], "空氣濾網狀況良好，結論是正常，今天不用處理。"],
    ["正常的煞車問安全", lin, "煞車開長途安全嗎", [], "黃技師量到前煞車來令片約 7 mm，狀況正常，今天不用處理。"],
    ["沒有症狀語境問是不是", wang, "是不是輪胎的問題？", [], "輪胎胎紋 2.5 mm，可延後，3 個月後會提醒你回廠。"],
    ["症狀語境但問價錢", wang, "電瓶要多少錢？", ["方向盤會抖"], "電瓶示意費用 NT$3,500，實際以服務廠報價為準。"],
    ["症狀語境，只出現「問題」兩字", wang, "電瓶有問題嗎？", ["方向盤會抖"], "電瓶 60%，可延後，3 個月後會提醒你回廠。"],
    ["症狀語境，「是不是」後面不是零件", wang, "電瓶是不是原廠的？", ["方向盤會抖"], "這張卡上沒有這項資料，可以請專員說明"],
    ["症狀語境，「是不是」後面是動作", wang, "電瓶是不是要換？", ["方向盤會抖"], "電瓶 60%，可延後，3 個月後會提醒你回廠。"],
    ["可延後的項目說先跳過", wang, "電瓶這次先跳過可以嗎？", [], "電瓶 60%，可延後，3 個月後會提醒你回廠。"],
  ] as [string, Vehicle, string, string[], string][])("%s：%s", async (_, car, q, history, answer) => {
    const { r, mainCalls } = await run(car, q, answer, history);
    expect(mainCalls).toBe(1);
    expect(r.trace.scripted).toBeUndefined();
  });
});
