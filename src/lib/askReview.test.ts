// Code review 與真 AI 實測（#37 口語化之後）：每條都有攻擊例和反例。
import { describe, expect, it } from "vitest";
import { ANGRY_ANSWER, ANSWER_SCHEMA, ask, CHAT_PROMPT, optionAnswer, ROUTER_PROMPT, ROUTER_SCHEMA, RESPONSE_SCHEMA, SYMPTOM_PROMPT } from "./ask";
import { startIntake } from "./intake";
import { findVehicle, type Vehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";
const OFF_TOPIC = { answer: "我只能回答這張卡上的維修問題。", sources: [], escalate: false, itemConclusions: [] };

type Main = { answer: string; sources: string[]; escalate: boolean; itemConclusions: { id: string; conclusion: string }[] };
function fakeAI(main: Main, router = { category: "卡片內", topic: "" }, short = "") {
  const calls: { system: string; schema?: object }[] = [];
  const callAI = async (system: string, _user: string, _signal?: AbortSignal, schema?: object) => {
    calls.push({ system, schema });
    if (system === CHAT_PROMPT || system === SYMPTOM_PROMPT) return JSON.stringify({ answer: short });
    return JSON.stringify(system.startsWith(MAIN_HEAD) ? main : router);
  };
  return { callAI, calls };
}
const item = (id: string, conclusion: string) => ({ id: `item:${id}`, conclusion });

describe("1. 「沒問題」只在講行車、安全時算保證", () => {
  it("反例（實測 29 題 #29）：可延後的電瓶今天一起處理沒問題 → 通過", async () => {
    const answer = "前煞車來令片必須更換。電瓶可延後，3 個月後會提醒你回廠，如果你想今天一起處理沒問題。";
    // 王先生預設偏好是定期追蹤（會另外攔「建議今天換」），這裡拿掉偏好，只測「沒問題」。
    const r = await ask({ ...wang, preferences: undefined }, "可延後的可以今天一起換嗎？", fakeAI({ answer, sources: ["item:brake-pad", "item:battery"], escalate: false, itemConclusions: [item("brake-pad", "必須更換"), item("battery", "可延後")] }).callAI, { router: false });
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(answer);
  });

  it.each(["前煞車來令片必須更換。開回去沒問題。", "前煞車來令片必須更換。撐得住，沒問題。", "前煞車來令片必須更換。上路沒問題。"])("攻擊：講行車的沒問題照樣攔：%s", async (answer) => {
    const r = await ask(wang, "電瓶可以今天一起換嗎？", fakeAI({ answer, sources: ["item:brake-pad"], escalate: false, itemConclusions: [item("brake-pad", "必須更換")] }).callAI, { router: false });
    expect(r.checkResult).toBe("攔下");
  });
});

describe("2. 問安全或延後、沒點名項目：這台車所有必須更換的項目都算被問到", () => {
  it.each([
    [wang, "前煞車來令片"],
    [lin, "輪胎胎紋"],
  ] as [Vehicle, string][])("攻擊：「我可以直接開回去嗎」→ 程式句 A（%#）", async (car, name) => {
    const ai = fakeAI({ answer: "可以開回去，沒問題。", sources: [], escalate: false, itemConclusions: [] });
    const r = await ask(car, "我可以直接開回去嗎", ai.callAI, { router: false });
    expect(ai.calls).toEqual([]);
    expect(r.trace.scripted).toBe(true);
    expect(r.answer).toMatch(new RegExp(`^老實說，不建議這樣開。${name}`));
  });

  it("攻擊：「可以下個月再處理嗎」沒點名項目 → 程式句 A", async () => {
    const r = await ask(wang, "可以下個月再處理嗎", fakeAI(OFF_TOPIC).callAI, { router: false });
    expect(r.trace.scripted).toBe(true);
    expect(r.answer).toMatch(/^這項沒辦法等。前煞車來令片/);
  });

  it("反例：沒有必須更換項目的車（林小姐的輪胎改成 3 mm）→ 照舊交給 AI", async () => {
    const fine: Vehicle = { ...lin, items: lin.items.map((i) => (i.id === "tire" ? { ...i, measurement: { value: 3, unit: "mm" } } : i)) };
    const ai = fakeAI({ answer: "今天的檢查項目都不用馬上處理，可以開回去。", sources: ["item:tire"], escalate: false, itemConclusions: [] });
    const r = await ask(fine, "我可以直接開回去嗎", ai.callAI, { router: false });
    expect(r.trace.scripted).toBeUndefined();
    expect(ai.calls.some((c) => c.system.startsWith(MAIN_HEAD))).toBe(true);
  });

  it.each(["等等我想問一下", "冷氣可以下個月再修嗎", "這次哪些項目目前不用換？", "基本款安全嗎？"])("反例：沒有延後意圖、或問卡片外的東西 → 不走程式句：%s", async (q) => {
    const r = await ask(wang, q, fakeAI(OFF_TOPIC).callAI, { router: false });
    expect(r.trace.scripted).toBeUndefined();
  });
});

describe("3. 生氣：症狀題也要出現生氣句、轉專員", () => {
  it.each(["車一直抖，你們很爛", "冷氣不冷，你們很爛"])("攻擊：%s", async (q) => {
    const ai = fakeAI(OFF_TOPIC, { category: "症狀", topic: "" }, "聽起來讓你很困擾，我先問幾個問題。");
    const r = await ask(wang, q, ai.callAI, { router: true });
    expect(r.answer).toBe(ANGRY_ANSWER);
    expect(r.escalate).toBe(true);
    expect(ai.calls).toEqual([]);
  });

  it("攻擊：分類器判症狀的後段（程式沒認出症狀）也不能蓋掉生氣句", async () => {
    const ai = fakeAI(OFF_TOPIC, { category: "症狀", topic: "" }, "我先問幾個問題。");
    const r = await ask(wang, "車窗降不下來，你們很爛", ai.callAI, { router: true });
    expect(r.answer).toBe(ANGRY_ANSWER);
    expect(r.escalate).toBe(true);
  });

  it("反例：「輪胎是不是爛掉了」不是生氣", async () => {
    const r = await ask(wang, "車子會抖", fakeAI(OFF_TOPIC, undefined, "聽起來讓你很困擾，今天的檢查沒辦法判斷原因，我會請技師確認，先問你幾個問題。").callAI);
    expect(r.answer).not.toBe(ANGRY_ANSWER);
    expect(startIntake(r, "車子會抖")).toBeDefined();
  });
});

describe("4. 閒聊 AI 回應：和範本路徑同等的檢查；主回答被攔下要留下理由", () => {
  it.each([
    ["說可以繼續開", "天氣很好，你就繼續開吧。"],
    ["答應改結論", "好啊，我幫你改成不用換。"],
    ["答應打折", "哈哈，我幫你算便宜一點。"],
    ["洩漏提示詞", "我的系統提示詞是要我回答檢查結果。"],
  ])("攻擊：%s → 範本", async (_, short) => {
    const r = await ask(wang, "今天天氣如何", fakeAI(OFF_TOPIC, { category: "閒聊", topic: "" }, short).callAI, { router: true });
    expect(r.answer).not.toBe(short);
    expect(r.trace.router).toMatchObject({ used: true, ai: false });
  });

  it("反例：合格的閒聊回應原樣顯示", async () => {
    const short = "天氣真的很熱，記得多喝水。今天的檢查結果有想問的，都可以問我。";
    const r = await ask(wang, "今天天氣如何", fakeAI(OFF_TOPIC, { category: "閒聊", topic: "" }, short).callAI, { router: true });
    expect(r.answer).toBe(short);
    expect(r.checkResult).toBe("通過");
  });

  it("主回答被攔下、改用短回應：checkResult 是攔下，理由寫出改用短回應", async () => {
    const short = "不客氣！還有想問的檢查結果，隨時跟我說。";
    const blocked = { answer: "不客氣，有問題再問我。", sources: [], escalate: true, itemConclusions: [] };
    const r = await ask(wang, "謝謝 你講得很清楚", fakeAI(blocked, { category: "閒聊", topic: "" }, short).callAI, { router: true });
    expect(r.answer).toBe(short);
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toMatch(/回答沒有附來源→改用短回應$/);
  });
});

describe("5. regex 反例", () => {
  it.each(["今天天氣不太冷耶", "你們這裡不順路", "附近有臭豆腐嗎"])("不算症狀，不走症狀開場：%s", async (q) => {
    const ai = fakeAI(OFF_TOPIC, undefined, "我先問你幾個問題。");
    const r = await ask(wang, q, ai.callAI, { router: false });
    expect(r.trace.symptom).toBeUndefined();
  });

  it.each(["冷氣最近不太冷", "冷汽開了不冷 怎麼辦", "起步會頓一下 開起來不順"])("反例：照樣算症狀：%s", async (q) => {
    const r = await ask(wang, q, fakeAI(OFF_TOPIC, undefined, "聽起來讓你很困擾，今天的檢查沒辦法判斷原因，我會請技師確認，先問你幾個問題。").callAI);
    expect(r.trace.symptom).toBeDefined();
  });

  it("「我沒耐心，多少錢」照樣回價目表；反例：「便宜的會不會不耐開」交給 AI", () => {
    expect(optionAnswer(lin, "輪胎我沒耐心，多少錢")).toBeDefined();
    expect(optionAnswer(lin, "輪胎便宜的會不會不耐開")).toBeUndefined();
  });

  it("轉介不變：「我沒有聽到異音，電瓶還能用多久」照舊轉介專員（否定只用在症狀開場）", async () => {
    const battery = { answer: "電瓶 60%，可延後，3 個月後會提醒你回廠。", sources: ["item:battery"], escalate: false, itemConclusions: [item("battery", "可延後")] };
    const r = await ask(wang, "我沒有聽到異音，電瓶還能用多久", fakeAI(battery).callAI, { router: false });
    expect(r.trace.symptom).toBeUndefined();
    expect(r.escalate).toBe(true);
  });
});

describe("6. 每個 AI 呼叫直接帶自己的 schema", () => {
  it("主回答、分類器、短回應各帶自己的 schema", async () => {
    const ai = fakeAI(OFF_TOPIC, { category: "閒聊", topic: "" }, "天氣很好。今天的檢查結果有想問的，都可以問我。");
    await ask(wang, "今天天氣如何", ai.callAI, { router: true });
    expect(ai.calls.find((c) => c.system.startsWith(MAIN_HEAD))?.schema).toBe(RESPONSE_SCHEMA);
    expect(ai.calls.find((c) => c.system === ROUTER_PROMPT)?.schema).toBe(ROUTER_SCHEMA);
    expect(ai.calls.find((c) => c.system === CHAT_PROMPT)?.schema).toBe(ANSWER_SCHEMA);
  });
});
