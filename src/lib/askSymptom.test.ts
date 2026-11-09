// 症狀開場（#37 正式站實測）：車主描述症狀時，AI 用症狀指示回應，不念卡片、不猜原因，後面接症狀登記。
import { describe, expect, it } from "vitest";
import { ask, STOP_LINE, SYMPTOM_FALLBACK, SYMPTOM_PROMPT } from "./ask";
import { askFlow } from "./flow";
import { startIntake } from "./intake";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";
const GOOD = "車子會抖一定讓你很不安。今天的檢查結果沒辦法判斷這個狀況的原因，我會請技師實際確認，先問你幾個問題，方便技師處理。";

// 假 AI：記下每次呼叫的提示詞開頭和內容。symptom 是症狀指示的回答（字串或丟錯）。
function fakeAI(symptom: string | Error, router = { category: "卡片內", topic: "" }) {
  const calls: { system: string; user: string }[] = [];
  const callAI = async (system: string, user: string) => {
    calls.push({ system, user });
    if (system === SYMPTOM_PROMPT) {
      if (symptom instanceof Error) throw symptom;
      return JSON.stringify({ answer: symptom });
    }
    if (system.startsWith(MAIN_HEAD))
      return JSON.stringify({ answer: "電瓶健康度 60%，可延後，3 個月後會提醒你回廠。", sources: ["item:battery"], escalate: false, itemConclusions: [{ id: "item:battery", conclusion: "可延後" }] });
    return JSON.stringify(router);
  };
  const used = (s: string) => calls.some((c) => c.system === s);
  return { callAI, calls, symptomCalled: () => used(SYMPTOM_PROMPT), mainCalled: () => calls.some((c) => c.system.startsWith(MAIN_HEAD)) };
}

describe("症狀開場：用症狀指示呼叫 AI，不呼叫主回答", () => {
  it("車子會抖：合格回答原樣顯示、轉介，後面接症狀登記", async () => {
    const ai = fakeAI(GOOD);
    const r = await ask(wang, "車子會抖", ai.callAI, { router: true });
    expect(ai.symptomCalled()).toBe(true);
    expect(ai.mainCalled()).toBe(false);
    expect(r.answer).toBe(GOOD);
    expect(r.checkResult).toBe("通過");
    expect(r.escalate).toBe(true);
    expect(r.sources).toEqual([]);
    // AI 已經說要先問幾個問題：症狀登記不再說「我先幫你把狀況記下來」，題目照樣問。
    expect(startIntake(r, "車子會抖")).toMatchObject({ intro: false, answers: [] });
    expect(r.trace.symptom).toEqual({ aiCalls: 1 });
  });

  it.each(["我冷氣不冷", "煞車踩下去軟軟的", "儀表板亮了一個黃色的燈，是警示燈", "開到 60 公里方向盤會震動", "水溫過高快冒煙了", "我冷氣吹起來有怪味", "儀表板亮了引擎燈", "冷氣一開有股酸酸臭臭的味道，要緊嗎"])("也走症狀開場：%s", async (q) => {
    const ai = fakeAI("聽起來真的讓人擔心。今天的檢查沒辦法判斷原因，我會請技師實際確認，先問你幾個問題。");
    const r = await ask(wang, q, ai.callAI, { router: true });
    expect(ai.mainCalled()).toBe(false);
    expect(r.checkResult).toBe("通過");
    expect(startIntake(r, q)).toBeDefined();
  });

  it("前幾題一起給 AI，回應才接得上對話", async () => {
    const ai = fakeAI(GOOD);
    await ask(wang, "車子會抖", ai.callAI, { history: ["電瓶還能用多久"] });
    expect(ai.calls[0].user).toContain("電瓶還能用多久");
    expect(ai.calls[0].user).toContain("車子會抖");
  });
});

describe("症狀開場的檢查：不合格就換成備用句", () => {
  it.each([
    ["念卡片數字", "車子會抖，我會請技師確認。前煞車來令片量測 2 mm，電瓶 60%。", /量測值/],
    ["講結論字詞", "車子會抖要請技師確認，另外有一項必須更換。", /結論字詞/],
    ["講可延後", "這個要請技師確認，其他項目可延後。", /結論字詞/],
    ["猜原因", "車子會抖可能是平衡沒調好造成的，我請技師確認。", /判斷了原因/],
    ["不判斷之後接但", "沒辦法馬上確定，但應該是平衡沒調好造成的。", /判斷了原因/],
    ["猜零件", "這應該是避震器的問題，先問你幾個問題。", /判斷了原因/],
    ["保證安全", "別擔心，可以繼續開，我請技師之後確認。", /保證安全/],
    ["提價格", "這個檢查大概 NT$1,500，我請技師確認。", /價格/],
    ["提車主沒問的項目", "車子會抖要請技師確認，雨刷今天也看過了。", /沒問的雨刷/],
  ])("%s → 備用句", async (_, answer, reason) => {
    const r = await ask(wang, "車子會抖", fakeAI(answer).callAI);
    expect(r.answer).toBe(SYMPTOM_FALLBACK);
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toMatch(reason);
    expect(r.escalate).toBe(true);
    expect(startIntake(r, "車子會抖")).toBeDefined();
  });

  it("AI 失敗：不丟錯，改用備用句，照樣接症狀登記", async () => {
    const r = await ask(wang, "車子會抖", fakeAI(new Error("Gemini 503")).callAI);
    expect(r.answer).toBe(SYMPTOM_FALLBACK);
    expect(r.trace.symptom).toEqual({ aiCalls: 1, failed: "AI 失敗或回應無法解析" });
    expect(startIntake(r, "車子會抖")).toBeDefined();
  });

  it.each([
    ["危險時提醒停車", "水溫過高快冒煙了", "冒煙真的很危險，請先停在安全的地方、不要繼續開，我會請技師確認原因。"],
    ["車主自己說的項目可以講", "煞車踩下去軟軟的", "煞車踩起來軟軟的一定很不安，今天的檢查沒辦法判斷原因，我會請技師確認。"],
    // 真 AI 好用度 G24 被誤攔：「沒辦法立刻確定」中間有副詞。
    ["明確不判斷（中間有副詞）", "車子會抖", "今天初步檢查沒辦法立刻確定是什麼原因造成的，等一下會請技師實際幫你確認看看。"],
  ])("反例（合格）：%s", async (_, q, answer) => {
    const r = await ask(wang, q, fakeAI(answer).callAI);
    expect(r.checkResult).toBe("通過");
    // 煞車軟是危險症狀：程式在前面補「先不要把車開走」（askUrgent.test.ts）。AI 已經說了就不補。
    expect(r.answer).toBe(/先不要把車開走/.test(answer) || !/軟軟/.test(q) ? answer : STOP_LINE + answer);
  });
});

describe("不走症狀開場的題目", () => {
  it.each(["電瓶還能用多久", "冷氣有在今天的檢查裡嗎", "煞車踩下去軟軟的，要換嗎？", "我沒有聽到異音，電瓶還能用多久", "機油燈沒亮，那機油應該不用管吧", "冷氣濾網多久換", "我冷氣吹起來有怪味，是不是要換濾網", "胎壓燈亮過一次，這次有幫我打氣嗎", "好吧。那煞車那項，我這幾天只開冷氣不太冷的短程"])("走主回答：%s", async (q) => {
    const ai = fakeAI(GOOD);
    const r = await ask(wang, q, ai.callAI, { router: true });
    expect(ai.symptomCalled()).toBe(false);
    expect(ai.mainCalled()).toBe(true);
    expect(r.trace.symptom).toBeUndefined();
  });

  it("症狀語境問原因（是不是X）照舊由程式組句，不呼叫 AI", async () => {
    const ai = fakeAI(GOOD);
    const r = await ask(wang, "方向盤會抖，是不是輪胎的關係", ai.callAI);
    expect(ai.calls).toEqual([]);
    expect(r.trace.scripted).toBe(true);
  });

  // 真 AI 小測：前一題「冷氣不太冷」，這一題問原因，主回答拿行車摘要猜原因。現在算症狀問原因，由程式組句。
  it("前幾題講冷氣不太冷、這一題問原因 → 程式組句", async () => {
    const ai = fakeAI(GOOD);
    const r = await ask(wang, "卡片上有講冷氣嗎？那你覺得大概是什麼原因", ai.callAI, { history: ["我冷氣最近不太冷，是不是壓縮機有問題？"] });
    expect(ai.calls).toEqual([]);
    expect(r.trace.scripted).toBe(true);
    expect(r.answer).toMatch(/我沒辦法判斷這個狀況的原因/);
  });

  it("程式組句關掉時（緊急開關），症狀題回到主回答", async () => {
    const ai = fakeAI(GOOD);
    await ask(wang, "車子會抖", ai.callAI, { scripted: false });
    expect(ai.symptomCalled()).toBe(false);
  });
});

describe("流程面板", () => {
  it("症狀開場：寫出步驟名稱、AI 呼叫 1 次", async () => {
    const r = await ask(wang, "車子會抖", fakeAI(GOOD).callAI);
    expect(askFlow("車子會抖", 200, r, {})).toEqual({
      title: "追問：車子會抖",
      steps: ["症狀：AI 用症狀指示回應，不念卡片、不猜原因", "答案檢查：通過", "接著問症狀登記的題目"],
      aiCalls: 1,
    });
  });

  it("攔下時標紅步驟，寫出換成備用句", async () => {
    const r = await ask(wang, "車子會抖", fakeAI("可能是平衡沒調好造成的。").callAI);
    expect(askFlow("車子會抖", 200, r, {}).steps[1]).toMatch(/^答案檢查：攔下（.*），改用備用句$/);
  });
});

describe("分類器判症狀、程式沒認出來", () => {
  it("沒提卡片項目：改用症狀開場（AI 共 3 次）", async () => {
    const ai = fakeAI(GOOD, { category: "症狀", topic: "車窗" });
    const r = await ask(wang, "車窗降一半就停住", ai.callAI, { router: true });
    expect(r.answer).toBe(GOOD);
    expect(r.trace.symptom).toEqual({ aiCalls: 3 });
    expect(r.trace.router).toMatchObject({ category: "症狀", used: false });
    expect(startIntake(r, "車窗降一半就停住")?.intro).toBe(false);
  });

  it("反例：問題提到卡片項目，照舊顯示主回答", async () => {
    const ai = fakeAI(GOOD, { category: "症狀", topic: "" });
    const r = await ask(wang, "電瓶好像怪怪的", ai.callAI, { router: true });
    expect(ai.symptomCalled()).toBe(false);
    expect(r.trace.symptom).toBeUndefined();
  });
});
