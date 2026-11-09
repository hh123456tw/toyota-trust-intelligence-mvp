// 定期保養（t39）：交車說明列出「機油與機油芯（定期保養）」，卡片和 AI 也要知道，問機油不能回「不在今天的檢查範圍」。
import { describe, expect, it } from "vitest";
import { ask, CHAT_PROMPT, STOP_LINE, SYMPTOM_PROMPT } from "./ask";
import { routineLine } from "./handover";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";
const FACT = "今天定期保養會更換：機油與機油芯";
// 程式組的定期保養句：主回答沒資料或被攔下時用。期望值照規格手寫。
const ROUTINE_ANSWER = "機油與機油芯今天定期保養會一起換，示意費用 NT$1,800，實際以服務廠報價為準。有疑問可以按下面的按鈕請專員說明。";
const OUTSIDE = { category: "卡片外的車子問題", topic: "機油" };
const NO_DATA = { answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] };
const GOOD = "機油和機油芯今天定期保養會一起換，費用含在這次保養費裡。";
const routine = (answer: string, extra: object = {}) => ({ answer, sources: ["routine"], escalate: false, itemConclusions: [], ...extra });

// 假 AI：依提示詞分主回答、分類器、短指示、症狀開場，記下每次呼叫。
function fakeAI(main: object, router: object = OUTSIDE) {
  const calls: { system: string; user: string }[] = [];
  const callAI = async (system: string, user: string) => {
    calls.push({ system, user });
    if (system === CHAT_PROMPT) return JSON.stringify({ answer: "機油今天沒有檢查到，我手上沒有它的資料，可以按下面的按鈕請專員確認。" });
    if (system === SYMPTOM_PROMPT) return JSON.stringify({ answer: "機油燈亮了一定讓你很在意。今天的檢查結果沒辦法判斷原因，我會請技師確認，先問你幾個問題。" });
    return JSON.stringify(system.startsWith(MAIN_HEAD) ? main : router);
  };
  const main_ = () => calls.find((c) => c.system.startsWith(MAIN_HEAD));
  return { callAI, calls, main: main_, chatCalled: () => calls.some((c) => c.system === CHAT_PROMPT) };
}

describe("決策卡：項目清單後面的定期保養行", () => {
  it("從 routine 產生", () => {
    expect(routineLine(wang.routine, wang.routineFee)).toBe("本次定期保養：機油與機油芯（示意費用 NT$1,800，實際以服務廠報價為準）");
    expect(routineLine(["機油與機油芯", "輪胎對調"], 2500)).toBe("本次定期保養：機油與機油芯、輪胎對調（示意費用 NT$2,500，實際以服務廠報價為準）");
  });
  it("沒有定期保養項目 → 不顯示", () => {
    expect(routineLine([], 1800)).toBeUndefined();
  });
});

describe("問定期保養項目：走主回答，AI 拿到定期保養事實", () => {
  it.each(["機油要換嗎", "機油是不是該換了", "這次保養有換機油嗎"])("%s", async (q) => {
    const ai = fakeAI(routine(GOOD));
    const r = await ask(wang, q, ai.callAI, { router: true });
    expect(ai.main()!.user).toContain(FACT);
    expect(r.answer).toBe(GOOD);
    expect(r.checkResult).toBe("通過");
    expect(r.sources).toEqual(["routine"]);
    expect(r.trace.router?.used).toBe(false);
    expect(ai.chatCalled()).toBe(false);
  });

  it("林小姐問機油：一樣拿到她的定期保養事實", async () => {
    const ai = fakeAI(routine(GOOD));
    const r = await ask(lin, "機油要換嗎", ai.callAI, { router: true });
    expect(ai.main()!.user).toContain(FACT);
    expect(r.answer).toBe(GOOD);
  });

  it("主回答回沒有資料、分類器判卡片外 → 程式組的定期保養句，不說不在今天的檢查範圍", async () => {
    const ai = fakeAI(NO_DATA);
    const r = await ask(wang, "機油要換嗎", ai.callAI, { router: true });
    expect(r.answer).toBe(ROUTINE_ANSWER);
    expect(r.answer).not.toContain("不在今天");
    expect(ai.chatCalled()).toBe(false);
  });

  it("流程面板列出 routine 來源", async () => {
    const r = await ask(wang, "機油要換嗎", fakeAI(routine(GOOD)).callAI, { router: true });
    expect(r.trace.data).toContain("routine");
  });

  it("前一題問機油、這一題「那要多少錢」：照樣給定期保養事實", async () => {
    const ai = fakeAI(routine(GOOD));
    await ask(wang, "那要多少錢", ai.callAI, { router: true, history: ["機油要換嗎"] });
    expect(ai.main()!.user).toContain(FACT);
  });

  it("反例：沒問到定期保養項目 → 不給定期保養事實，其他題目的資料不變", async () => {
    const ai = fakeAI({ answer: "電瓶 60% 可延後，3 個月後會提醒你回廠。", sources: ["item:battery"], escalate: false, itemConclusions: [{ id: "item:battery", conclusion: "可延後" }] }, { category: "卡片內", topic: "" });
    const r = await ask(wang, "空氣濾網真的不用換嗎？", ai.callAI, { router: true });
    expect(ai.main()!.user).not.toContain("定期保養");
    expect(r.trace.data).not.toContain("routine");
  });
});

describe("答案檢查：定期保養項目不能說成延後、不用換、另外付費，不能報價", () => {
  it.each([
    "機油可以延後，下次保養再換就好。",
    "機油和機油芯這次不用換。",
    "機油和機油芯是定期保養項目，要另外付費。",
    "機油和機油芯今天會換，是免費的。",
    "機油和機油芯定期保養會換，不用錢。",
    "機油和機油芯更換約 NT$2,500。",
    "機油與機油芯今天會換，費用 1500 元。",
  ])("攔下：%s", async (answer) => {
    const r = await ask(wang, "機油要換嗎", fakeAI(routine(answer)).callAI, { router: true });
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(ROUTINE_ANSWER);
  });

  it.each([
    "機油和機油芯今天定期保養會一起換，費用含在這次保養費裡，不用另外付費。",
    "機油和機油芯今天會換，費用含在保養費裡，詳細金額請專員報價。",
    "機油和機油芯今天定期保養會一起換，示意費用 NT$1,800，實際以服務廠報價為準。",
    "機油和機油芯今天會一起換，沒有額外費用。",
    "機油今天會換，不用等下次。",
    "機油濾網今天定期保養會一起換。",
  ])("通過：%s", async (answer) => {
    const r = await ask(wang, "機油要換嗎", fakeAI(routine(answer)).callAI, { router: true });
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(answer);
  });

  // 王先生選定期追蹤：「今天…換」講的是機油，不算建議今天換電瓶。
  const withBattery = (answer: string) => ({ answer, sources: ["routine", "item:battery"], escalate: false, itemConclusions: [{ id: "item:battery", conclusion: "可延後" }] });
  it.each([
    "機油今天會換，電瓶 60% 可延後，3 個月後會提醒你回廠。",
    "電瓶 60% 可延後，3 個月後會提醒你回廠，機油和機油芯今天定期保養會一起換。",
    "電瓶 60% 可延後，3 個月後會提醒你回廠。機油和機油芯今天定期保養會一起換。",
  ])("通過（機油和電瓶一起講）：%s", async (answer) => {
    const r = await ask(wang, "機油和電瓶要換嗎", fakeAI(withBattery(answer)).callAI, { router: true });
    expect(r.checkResult).toBe("通過");
  });
  it.each(["機油今天會換，電瓶 60% 也建議今天換。", "電瓶 60% 可延後。今天換比較好。"])("反例：建議今天換電瓶照樣攔下：%s", async (answer) => {
    const r = await ask(wang, "機油和電瓶要換嗎", fakeAI(withBattery(answer)).callAI, { router: true });
    expect(r.checkResult).toBe("攔下");
  });
});

describe("反例：其他卡片外項目和症狀照舊", () => {
  it("問冷氣：仍走卡片外短回應", async () => {
    const ai = fakeAI(NO_DATA, { category: "卡片外的車子問題", topic: "冷氣" });
    const r = await ask(wang, "冷氣多久要保養", ai.callAI, { router: true });
    expect(r.trace.router?.used).toBe(true);
    expect(ai.chatCalled()).toBe(true);
  });

  it("變速箱油不是機油：仍走卡片外", async () => {
    const ai = fakeAI(NO_DATA, { category: "卡片外的車子問題", topic: "變速箱油" });
    const r = await ask(wang, "變速箱油要換嗎", ai.callAI, { router: true });
    expect(r.trace.router?.used).toBe(true);
  });

  it("煞車油不是機油：不給定期保養句", async () => {
    const r = await ask(wang, "煞車油要換嗎", fakeAI(NO_DATA, { category: "卡片外的車子問題", topic: "煞車油" }).callAI, { router: true });
    expect(r.answer).not.toContain("定期保養");
    expect(r.trace.router?.reason).not.toBe("問題問到定期保養項目");
  });

  it("這台車沒有定期保養項目：機油照舊是卡片外，AI 也沒拿到定期保養事實", async () => {
    const bare = { ...wang, routine: [] };
    const ai = fakeAI(NO_DATA);
    const r = await ask(bare, "機油要換嗎", ai.callAI, { router: true });
    expect(ai.main()!.user).not.toContain("定期保養");
    expect(r.trace.router?.used).toBe(true);
  });

  it("機油燈亮了：走症狀開場，不呼叫主回答", async () => {
    const ai = fakeAI(routine(GOOD));
    const r = await ask(wang, "機油燈亮了", ai.callAI, { router: true });
    expect(r.trace.symptom).toBeDefined();
    expect(ai.main()).toBeUndefined();
    expect(r.escalate).toBe(true);
  });

  it("機油紅燈亮了（分類器判症狀）：症狀開場前面補危險提醒", async () => {
    const ai = fakeAI(routine(GOOD), { category: "症狀", topic: "" });
    const r = await ask(wang, "機油紅燈亮了", ai.callAI, { router: true });
    expect(r.trace.symptom).toBeDefined();
    expect(r.answer.startsWith(STOP_LINE)).toBe(true);
  });
});
