import { describe, expect, it } from "vitest";
import { cardItems } from "./card";
import { askFlow, handoverFlow, isBlockedStep, presetFlow, staffConfirmFlow, summaryFlow } from "./flow";
import { handover } from "./handover";
import { findVehicle } from "./vehicles";

const labels = {
  "item:brake-pad": "陳技師量測：前煞車來令片 2 mm",
  driving: "行車摘要（近 3 個月）",
  "doc:brake-1": "回廠服務流程手冊 第 3 頁",
};

const passed = {
  answer: "煞車只剩 2 mm。",
  sources: ["item:brake-pad"],
  escalate: false,
  checkResult: "通過" as const,
  trace: { mentionedItems: ["item:brake-pad"], aiSources: ["item:brake-pad"], data: ["item:brake-pad", "driving"] },
};

describe("askFlow：追問的流程紀錄", () => {
  it("通過時顯示四步驟與「通過」，AI 呼叫 1 次", () => {
    const e = askFlow("煞車還能撐嗎？", 200, passed, labels);
    expect(e.title).toBe("追問：煞車還能撐嗎？");
    expect(e.steps).toEqual([
      "理解的問題：提到 陳技師量測：前煞車來令片 2 mm",
      "用了哪些資料：陳技師量測：前煞車來令片 2 mm、行車摘要（近 3 個月）",
      "引用的來源：陳技師量測：前煞車來令片 2 mm",
      "答案檢查：通過",
    ]);
    expect(e.aiCalls).toBe(1);
  });

  it("攔下時顯示原因，且不出現 AI 原回答", () => {
    const blocked = {
      ...passed,
      answer: "這個問題請服務專員當面跟你說明，會比較清楚。",
      checkResult: "攔下" as const,
      blockedReason: "前煞車來令片是必須更換，回答卻說可以延後",
    };
    const e = askFlow("煞車下個月換", 200, blocked, labels);
    expect(e.steps.at(-1)).toBe("答案檢查：攔下（前煞車來令片是必須更換，回答卻說可以延後）");
    expect(e.steps.join()).not.toContain(passed.answer);
  });

  it("問題沒提到項目、AI 沒附來源時寫明，不留空白", () => {
    const e = askFlow("你好", 200, { ...passed, trace: { mentionedItems: [], aiSources: [], data: [] } }, labels);
    expect(e.steps[0]).toBe("理解的問題：沒有提到特定項目");
    expect(e.steps[2]).toBe("引用的來源：無");
  });

  it("有查到原廠文件片段時列在用了哪些資料", () => {
    const e = askFlow("x", 200, { ...passed, trace: { ...passed.trace, data: ["driving", "doc:brake-1"] } }, labels);
    expect(e.steps[1]).toBe("用了哪些資料：行車摘要（近 3 個月）、回廠服務流程手冊 第 3 頁");
  });

  it("未知來源代號直接顯示代號", () => {
    const e = askFlow("x", 200, { ...passed, trace: { mentionedItems: [], aiSources: ["item:ghost"], data: [] } }, labels);
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

describe("askFlow：模擬的竄改回答", () => {
  const simulated = {
    ...passed,
    answer: "替代回答",
    checkResult: "攔下" as const,
    blockedReason: "前煞車來令片是必須更換，回答卻說可以延後",
    simulated: true as const,
    question: "前煞車來令片可以下個月再換嗎？",
  };

  it("標題和步驟標明模擬、AI 回答是模擬的，AI 呼叫 0 次，仍顯示真的檢查結果", () => {
    const e = askFlow(simulated.question, 200, simulated, labels);
    expect(e.title).toBe("模擬：AI 回答被竄改（前煞車來令片可以下個月再換嗎？）");
    expect(e.steps[0]).toBe("AI 回答：模擬的竄改回答，沒有呼叫 AI");
    expect(e.steps.at(-1)).toBe("答案檢查：攔下（前煞車來令片是必須更換，回答卻說可以延後）");
    expect(e.aiCalls).toBe(0);
  });

  it("真的追問不會被標成模擬", () => {
    const e = askFlow("x", 200, passed, labels);
    expect(e.title).not.toContain("模擬");
    expect(e.steps.join()).not.toContain("模擬");
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

describe("summaryFlow：檢查結果摘要的流程紀錄", () => {
  const ok = { answer: "x", sources: ["item:brake-pad"], escalate: false, checkResult: "通過" as const };

  it("通過時列出來源與「通過」，AI 呼叫 1 次", () => {
    const e = summaryFlow(200, ok, labels);
    expect(e.steps.slice(1)).toEqual(["引用的來源：陳技師量測：前煞車來令片 2 mm", "答案檢查：通過"]);
    expect(e.aiCalls).toBe(1);
  });

  it("攔下時寫明原因和改用規則版摘要", () => {
    const e = summaryFlow(200, { ...ok, checkResult: "攔下", blockedReason: "摘要漏了可延後的電瓶" }, labels);
    expect(e.steps.at(-1)).toBe("答案檢查：攔下（摘要漏了可延後的電瓶），改顯示規則版摘要");
  });

  it("沒有金鑰（503）→ 顯示失敗，AI 呼叫 0 次", () => {
    const e = summaryFlow(503, { error: "AI 暫時無法回答" }, labels);
    expect(e).toMatchObject({ steps: ["失敗：AI 暫時無法回答"], aiCalls: 0 });
  });
});

describe("handoverFlow、staffConfirmFlow（#14 #18）", () => {
  it("交車說明：什麼都沒選時，必須更換列待車主授權、可延後列尚未選擇，AI 呼叫 0 次", () => {
    const v = findVehicle("wang")!;
    const e = handoverFlow(handover(cardItems(v.items), {}, v.routine, v.nextServiceKm));
    expect(e.aiCalls).toBe(0);
    expect(e.steps).toEqual([
      "今天完成：機油與機油芯",
      "待車主授權：前煞車來令片",
      "今天延後：無",
      "尚未選擇：電瓶（預設 3 個月後複查）、輪胎胎紋（預設 3 個月後複查）",
      "目前不用換：空氣濾網、雨刷",
    ]);
  });

  it("專員確認：AI 呼叫 0 次", () => {
    expect(staffConfirmFlow().aiCalls).toBe(0);
    expect(staffConfirmFlow().title).toBe("專員確認檢查結果摘要");
    // 反例：不再顯示規則那句建議說法
    expect(staffConfirmFlow().steps.join("")).not.toContain("說法（規則產生）");
  });
});

describe("isBlockedStep：流程面板標紅", () => {
  it("答案檢查攔下的步驟標紅", () => {
    expect(isBlockedStep("答案檢查：攔下（前煞車來令片是必須更換，回答卻說可以延後）")).toBe(true);
    expect(isBlockedStep("答案檢查：攔下（摘要漏了可延後的電瓶），改顯示規則版摘要")).toBe(true);
  });

  it("反例：未攔下、通過、問題或引用文字含「攔下」都不標紅", () => {
    for (const s of ["答案檢查：未攔下", "答案檢查：通過", "理解的問題：會不會被攔下？", "說法（規則產生）：攔下來的車今天處理"]) {
      expect(isBlockedStep(s)).toBe(false);
    }
  });
});
