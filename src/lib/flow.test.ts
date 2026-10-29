import { describe, expect, it } from "vitest";
import { askFlow, presetFlow } from "./flow";

const labels = {
  "item:brake-pad": "陳技師量測：前煞車來令片 2 mm",
  driving: "行車摘要（近 3 個月）",
  "doc:brake-1": "回廠服務流程手冊 第 3 頁",
};

const passed = {
  answer: "煞車只剩 2 mm。",
  sources: ["item:brake-pad"],
  escalate: false,
  verdict: "通過" as const,
  trace: { mentionedItems: ["item:brake-pad"], aiSources: ["item:brake-pad"], docs: [] as string[] },
};

describe("askFlow：追問的流程紀錄", () => {
  it("通過時顯示四步驟與「通過」，AI 呼叫 1 次", () => {
    const e = askFlow("煞車還能撐嗎？", 200, passed, labels);
    expect(e.title).toBe("追問：煞車還能撐嗎？");
    expect(e.steps).toEqual([
      "理解的問題：提到 陳技師量測：前煞車來令片 2 mm",
      "用了哪些資料：這張卡片的檢查項目與行車摘要",
      "引用的來源：陳技師量測：前煞車來令片 2 mm",
      "答案檢查：通過",
    ]);
    expect(e.aiCalls).toBe(1);
  });

  it("攔下時顯示原因，且不出現 AI 原回答", () => {
    const blocked = {
      ...passed,
      answer: "這個問題請服務專員當面跟你說明，會比較清楚。",
      verdict: "攔下" as const,
      blockedReason: "前煞車來令片是必須更換，回答卻說可以延後",
    };
    const e = askFlow("煞車下個月換", 200, blocked, labels);
    expect(e.steps.at(-1)).toBe("答案檢查：攔下（前煞車來令片是必須更換，回答卻說可以延後）");
    expect(e.steps.join()).not.toContain(passed.answer);
  });

  it("問題沒提到項目、AI 沒附來源時寫明，不留空白", () => {
    const e = askFlow("你好", 200, { ...passed, trace: { mentionedItems: [], aiSources: [], docs: [] } }, labels);
    expect(e.steps[0]).toBe("理解的問題：沒有提到特定項目");
    expect(e.steps[2]).toBe("引用的來源：無");
  });

  it("有查到原廠文件片段時列在用了哪些資料", () => {
    const e = askFlow("x", 200, { ...passed, trace: { ...passed.trace, docs: ["doc:brake-1"] } }, labels);
    expect(e.steps[1]).toBe("用了哪些資料：這張卡片的檢查項目與行車摘要、原廠文件：回廠服務流程手冊 第 3 頁");
  });

  it("未知來源代號直接顯示代號", () => {
    const e = askFlow("x", 200, { ...passed, trace: { mentionedItems: [], aiSources: ["item:ghost"], docs: [] } }, labels);
    expect(e.steps[2]).toBe("引用的來源：item:ghost");
  });

  it("沒有金鑰（503）顯示失敗，AI 呼叫 0 次", () => {
    const e = askFlow("煞車？", 503, { error: "AI 暫時無法回答" }, labels);
    expect(e.steps).toEqual(["失敗：AI 暫時無法回答"]);
    expect(e.aiCalls).toBe(0);
  });

  it("AI 失敗（502）顯示失敗，AI 呼叫 1 次", () => {
    const e = askFlow("煞車？", 502, { error: "AI 暫時無法回答" }, labels);
    expect(e.steps).toEqual(["失敗：AI 暫時無法回答"]);
    expect(e.aiCalls).toBe(1);
  });

  it("連線失敗（status 0）也顯示失敗", () => {
    expect(askFlow("煞車？", 0, { error: "連線失敗" }, labels).steps).toEqual(["失敗：連線失敗"]);
  });
});

describe("presetFlow：常見問題", () => {
  it("顯示預寫回答與來源，AI 呼叫 0 次", () => {
    const e = presetFlow({ question: "電瓶？", answer: { answer: "a", sources: ["driving"], escalate: false } }, labels);
    expect(e).toEqual({
      title: "常見問題：電瓶？",
      steps: ["使用預寫回答，不呼叫 AI", "引用的來源：行車摘要（近 3 個月）"],
      aiCalls: 0,
    });
  });
});
