// 口語化（#37 好用度）：閒聊、情緒、卡片外改用 AI 短指示回應，範本變成備用句；好用度基準最差題的路徑。
import { describe, expect, it } from "vitest";
import { ask, CHAT_PROMPT, optionAnswer, SYMPTOM_PROMPT, templateAnswer } from "./ask";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";
const NO_DATA = { answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] };
const OFF_TOPIC = { answer: "我只能回答這張卡上的維修問題。", sources: [], escalate: false, itemConclusions: [] };
// 主回答沒附來源：答案檢查會攔下（好用度 G32、G33 的情況）。
const NO_SOURCE = { answer: "不客氣，有問題再問我。", sources: [], escalate: true, itemConclusions: [] };

function fakeAI(main: object, router: { category: string; topic: string }, chat: string) {
  const systems: string[] = [];
  const callAI = async (system: string) => {
    systems.push(system);
    if (system === CHAT_PROMPT) return JSON.stringify({ answer: chat });
    if (system === SYMPTOM_PROMPT) return JSON.stringify({ answer: "聽起來讓你很擔心，今天的檢查沒辦法判斷原因，我會請技師確認，先問你幾個問題。" });
    return JSON.stringify(system.startsWith(MAIN_HEAD) ? main : router);
  };
  return { callAI, systems };
}

describe("閒聊、情緒、卡片外：AI 短指示回應，範本是備用句", () => {
  it.each([
    ["閒聊", "今天天氣如何", OFF_TOPIC, "天氣真的很熱，記得多喝水。今天的檢查結果有想問的，都可以問我。", false],
    ["情緒", "我今天好累", OFF_TOPIC, "辛苦了，先坐著休息一下。車子的檢查結果有想知道的，隨時問我。", false],
    ["卡片外的車子問題", "冷氣多久要保養", NO_DATA, "冷氣今天沒有檢查到，我手上沒有它的資料，可以按下面的按鈕請專員確認。", true],
  ] as const)("%s：合格回答原樣顯示", async (category, q, main, chat, escalate) => {
    const ai = fakeAI(main, { category, topic: category === "卡片外的車子問題" ? "冷氣" : "" }, chat);
    const r = await ask(wang, q, ai.callAI, { router: true });
    expect(r.answer).toBe(chat);
    expect(r.escalate).toBe(escalate);
    expect(r.trace.router).toMatchObject({ used: true, ai: true });
  });

  it.each([
    ["提價格", "這個大概 NT$1,500 喔。"],
    ["保證安全", "沒問題，可以繼續開。"],
    ["念卡片數字", "電瓶 60% 還可以。"],
    ["講結論字詞", "其他項目都目前不用換。"],
  ])("不合格（%s）→ 改用範本", async (_, chat) => {
    const ai = fakeAI(OFF_TOPIC, { category: "閒聊", topic: "" }, chat);
    const r = await ask(wang, "今天天氣如何", ai.callAI, { router: true });
    expect(r.answer).toBe(templateAnswer(wang, "閒聊", ""));
    expect(r.trace.router).toMatchObject({ used: true, ai: false });
    expect(r.trace.router?.fallback).toBeDefined();
  });

  it("G32：主回答被攔下、分類器判閒聊 → AI 短指示回應，不轉介專員", async () => {
    const chat = "不客氣！還有想問的檢查結果，隨時跟我說。";
    const r = await ask(wang, "謝謝 你講得很清楚", fakeAI(NO_SOURCE, { category: "閒聊", topic: "" }, chat).callAI, { router: true });
    expect(r.answer).toBe(chat);
    expect(r.escalate).toBe(false);
    expect(r.checkResult).toBe("通過");
  });

  it("反例：主回答被攔下、分類器判卡片外 → 照舊不換", async () => {
    const r = await ask(wang, "冷氣多久要保養", fakeAI(NO_SOURCE, { category: "卡片外的車子問題", topic: "冷氣" }, "好").callAI, { router: true });
    expect(r.trace.router).toMatchObject({ used: false, reason: "主回答被攔下" });
  });

  it("反例：卡片問題被分類器判閒聊、主回答有內容 → 照舊用主回答", async () => {
    const battery = { answer: "電瓶目前 60%，可延後，3 個月後會提醒你回廠。", sources: ["item:battery"], escalate: false, itemConclusions: [{ id: "item:battery", conclusion: "可延後" }] };
    const r = await ask(wang, "今天要付多少", fakeAI(battery, { category: "閒聊", topic: "" }, "好").callAI, { router: true });
    expect(r.answer).toBe(battery.answer);
  });
});

describe("好用度基準最差題的路徑", () => {
  it("G23：前面要延後煞車，「那我先開回去行不行」→ 程式組句，第一句先說不建議", async () => {
    const r = await ask(wang, "那我先開回去行不行", fakeAI(OFF_TOPIC, { category: "卡片內", topic: "" }, "").callAI, {
      history: ["煞車那個錢能不能先不花", "那可以拖到什麼時候"],
    });
    expect(r.trace.scripted).toBe(true);
    expect(r.answer).toMatch(/^老實說，不建議這樣開。前煞車來令片/);
  });

  it("G17：問便宜的耐不耐開 → 交給 AI，不貼價目表；反例：只問價格照舊回清單", () => {
    expect(optionAnswer(lin, "那便宜的會不會不耐開", ["輪胎磨到1.4了對吧", "那換兩條多少錢"])).toBeUndefined();
    expect(optionAnswer(lin, "那便宜的多少錢", ["輪胎磨到1.4了對吧"])).toBeDefined();
  });

  it.each([
    ["G25", lin, "剎車踩下去會吱吱叫 是不是壞了"],
    ["G24", wang, "方向盤開到六七十會抖 煞車的時候更明顯"],
  ] as const)("%s：症狀開場", async (_, car, q) => {
    const ai = fakeAI(OFF_TOPIC, { category: "症狀", topic: "" }, "");
    const r = await ask(car, q, ai.callAI);
    expect(r.trace.symptom).toBeDefined();
    expect(ai.systems.some((s) => s.startsWith(MAIN_HEAD))).toBe(false);
  });
});
