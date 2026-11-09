// Codex 審查（事實與安全，#37）：危險症狀的停車提醒由程式補；猜原因檢查要認卡片外的症狀說法。
import { describe, expect, it } from "vitest";
import { ask, STOP_LINE, SYMPTOM_FALLBACK, SYMPTOM_PROMPT } from "./ask";
import { isUrgent } from "./askShared";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";
const CALM = "聽起來讓你很擔心，今天的檢查結果沒辦法判斷原因，我會請技師實際確認，先問你幾個問題。";

function fakeAI(symptom: string | Error, main: object = { answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] }) {
  return async (system: string) => {
    if (system === SYMPTOM_PROMPT) {
      if (symptom instanceof Error) throw symptom;
      return JSON.stringify({ answer: symptom });
    }
    return JSON.stringify(system.startsWith(MAIN_HEAD) ? main : { category: "卡片內", topic: "" });
  };
}

describe("1. 危險症狀：程式在症狀開場最前面補停車提醒", () => {
  it.each(["水溫過高快冒煙了", "煞車踩下去軟軟的", "儀表板亮紅色的警示燈", "引擎有燒焦味", "煞車好像失靈"])("AI 沒提停車：%s → 前面補停車提醒", async (q) => {
    const r = await ask(wang, q, fakeAI(CALM));
    expect(r.answer).toBe(STOP_LINE + CALM);
  });

  it("備用句（AI 回應不合格）也補", async () => {
    const r = await ask(wang, "水溫過高快冒煙了", fakeAI("可能是水箱破了造成的。"));
    expect(r.answer).toBe(STOP_LINE + SYMPTOM_FALLBACK);
  });

  it("AI 失敗或逾時也補", async () => {
    const r = await ask(wang, "水溫過高快冒煙了", fakeAI(new Error("TimeoutError")));
    expect(r.answer).toBe(STOP_LINE + SYMPTOM_FALLBACK);
  });

  it("反例：AI 已經叫車主停車，不重複", async () => {
    const said = "冒煙很危險，檢查完之前先不要把車開走，我會請技師確認原因，先問你幾個問題。";
    const r = await ask(wang, "水溫過高快冒煙了", fakeAI(said));
    expect(r.answer).toBe(said);
  });

  it.each(["車子會抖", "我冷氣不冷", "最近停紅燈引擎會抖一下"])("反例：不危險的症狀不補：%s", async (q) => {
    const r = await ask(wang, q, fakeAI(CALM));
    expect(r.answer).toBe(CALM);
  });

  it("危險判斷的反例：「天氣過熱」「紅色的車」「等紅燈」不算；儀表亮紅燈算", () => {
    expect(isUrgent("今天天氣過熱")).toBe(false);
    expect(isUrgent("我的車是紅色的車")).toBe(false);
    expect(isUrgent("等紅燈的時候會抖")).toBe(false);
    expect(isUrgent("儀表板亮紅燈")).toBe(true);
  });
});

describe("2. 猜原因檢查認卡片外的症狀說法（冷氣不冷等）", () => {
  it.each(["可能是冷媒不足造成的。", "應該是壓縮機的關係。"])("攻擊：我冷氣不冷 → 主回答「%s」被攔下", async (answer) => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(CALM, { answer, sources: ["driving"], escalate: false, itemConclusions: [] }), { scripted: false, router: false });
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toMatch(/判斷了原因/);
  });

  it("攻擊：症狀開場的 AI 回應猜冷媒 → 備用句", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI("可能是冷媒不足造成的，我請技師確認。"));
    expect(r.answer).toBe(SYMPTOM_FALLBACK);
  });

  it("反例：「冷氣不在今天的檢查範圍」不攔", async () => {
    const answer = "這張卡上沒有這項資料，冷氣不在今天的檢查範圍，可以請專員說明";
    const r = await ask(wang, "我冷氣不冷", fakeAI(CALM, { answer, sources: [], escalate: true, itemConclusions: [] }), { scripted: false, router: false });
    expect(r.blockedReason).toBeUndefined();
  });
});
