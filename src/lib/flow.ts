// 把追問結果轉成流程面板的一筆紀錄。只讀 trace 和檢查結果，不顯示被攔下的 AI 原回答。

import type { FlowEntry } from "@/app/card/[id]/FlowPanel";
import type { Preset } from "./answers";
import type { AskResult } from "./ask";

type Labels = Record<string, string>;

const list = (keys: string[], labels: Labels, empty: string) =>
  keys.length ? keys.map((k) => labels[k] ?? k).join("、") : empty;

// status：/api/ask 的 HTTP 狀態；0 代表連線失敗。502 代表已呼叫 AI 但失敗。
export function askFlow(question: string, status: number, data: AskResult | { error: string }, labels: Labels): FlowEntry {
  const title = `追問：${question}`;
  if (status !== 200 || "error" in data) {
    return { title, steps: [`失敗：${"error" in data ? data.error : "未知錯誤"}`], aiCalls: status === 502 ? 1 : 0 };
  }
  const { trace, verdict, blockedReason } = data;
  return {
    title,
    steps: [
      `理解的問題：${trace.mentionedItems.length ? `提到 ${list(trace.mentionedItems, labels, "")}` : "沒有提到特定項目"}`,
      `用了哪些資料：這張卡片的檢查項目與行車摘要${trace.docs.length ? `、原廠文件：${list(trace.docs, labels, "")}` : ""}`,
      `引用的來源：${list(trace.aiSources, labels, "無")}`,
      `答案檢查：${verdict === "攔下" ? `攔下（${blockedReason}）` : "通過"}`,
    ],
    aiCalls: 1,
  };
}

export function presetFlow(preset: Preset, labels: Labels): FlowEntry {
  return {
    title: `常見問題：${preset.question}`,
    steps: ["使用預寫回答，不呼叫 AI", `引用的來源：${list(preset.answer.sources, labels, "無")}`],
    aiCalls: 0,
  };
}
