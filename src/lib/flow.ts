// 把追問結果轉成流程面板的一筆紀錄。只讀 trace 和檢查結果，不顯示被攔下的 AI 原回答。

import type { Preset } from "./answers";
import type { AskResult, SummaryResult } from "./ask";
import type { Handover } from "./handover";

// 流程面板的一筆紀錄：標題、幾個步驟、AI 呼叫次數。
export type FlowEntry = {
  title: string;
  steps: string[];
  aiCalls: number;
};

type Labels = Record<string, string>;

const list = (keys: string[], labels: Labels, empty: string) =>
  keys.length ? keys.map((k) => labels[k] ?? k).join("、") : empty;

// status：/api/ask 的 HTTP 狀態；0 代表連線失敗。502 代表已呼叫 AI 但失敗。
// data.simulated：展示用的竄改回答（simulateTampered），沒有呼叫 AI。
export function askFlow(
  question: string,
  status: number,
  data: (AskResult & { simulated?: true }) | { error: string },
  labels: Labels,
): FlowEntry {
  const simulated = "simulated" in data && data.simulated === true;
  const replay = "replay" in data ? (data.replay as { log: string } | undefined) : undefined;
  const title = replay ? `重播真實攔截（${question}）` : simulated ? `模擬：AI 回答被竄改（${question}）` : `追問：${question}`;
  if (status !== 200 || "error" in data) {
    // 502：主回答和分類器都送出了。
    return { title, steps: [`失敗：${"error" in data ? data.error : "未知錯誤"}`], aiCalls: status === 502 ? 2 : 0 };
  }
  const { trace, checkResult, blockedReason } = data;
  const router = trace.router;
  const routerSteps = router
    ? [
        `分類器：${router.category ?? "失敗"}`,
        `範本：${router.used ? "採用（程式組句，不是 AI 自由文字）" : `沒採用（${router.reason}）`}`,
      ]
    : [];
  // 採用範本時，車主看到的是範本；答案檢查檢查的是主回答，要寫清楚。
  const checkLabel = router?.used ? "答案檢查（主回答）" : "答案檢查";
  // 對話記憶（#37）：只有車主前幾題的原文，沒有 AI 回答。
  const memo = [
    ...(trace.history?.length ? [`參考前幾題：${trace.history.map((h) => `「${h}」`).join("、")}`] : []),
    ...(trace.referredItems?.length ? [`這一題接著問：${list(trace.referredItems, labels, "")}`] : []),
  ];
  if (trace.crisis) return { title, steps: ["危機訊息：回固定的求助句（1925 安心專線），不呼叫 AI"], aiCalls: 0 };
  if (trace.noAI) {
    return { title, steps: [trace.aiSources.length ? "使用卡片上的款式清單回答，不呼叫 AI" : "打招呼，由程式自我介紹，不呼叫 AI", ...memo, `引用的來源：${list(trace.aiSources, labels, "無")}`], aiCalls: 0 };
  }
  return {
    title,
    steps: [
      ...(replay ? [`AI 回答：11/9 真實 Gemini 回答的紀錄重播（${replay.log}），這次沒有呼叫 AI`] : simulated ? ["AI 回答：模擬的竄改回答，沒有呼叫 AI"] : []),
      `理解的問題：${trace.mentionedItems.length ? `提到 ${list(trace.mentionedItems, labels, "")}` : "沒有提到特定項目"}`,
      ...memo,
      `用了哪些資料：${list(trace.data, labels, "無")}`,
      `引用的來源：${list(trace.aiSources, labels, "無")}`,
      `${checkLabel}：${checkResult === "攔下" ? `攔下（${blockedReason}）` : "通過"}`,
      ...(simulated ? [] : routerSteps),
    ],
    aiCalls: simulated ? 0 : router ? 2 : 1,
  };
}

export function presetFlow(preset: Preset, labels: Labels): FlowEntry {
  return {
    title: `常見問題：${preset.question}`,
    steps: ["使用預寫回答，不呼叫 AI", `引用的來源：${list(preset.answer.sources, labels, "無")}`],
    aiCalls: 0,
  };
}

// 檢查結果摘要：AI 讀整張卡；攔下時畫面改顯示規則版摘要。
export function summaryFlow(status: number, data: SummaryResult | { error: string }, labels: Labels): FlowEntry {
  const title = "檢查結果摘要：AI 整理給專員";
  if (status !== 200 || "error" in data) {
    return { title, steps: [`失敗：${"error" in data ? data.error : "未知錯誤"}`], aiCalls: status === 502 ? 1 : 0 };
  }
  return {
    title,
    steps: [
      "用了哪些資料：整張決策卡（結論由規則引擎判定）",
      `引用的來源：${list(data.sources, labels, "無")}`,
      `答案檢查：${data.checkResult === "攔下" ? `攔下（${data.blockedReason}），改顯示規則版摘要` : "通過"}`,
    ],
    aiCalls: 1,
  };
}

// 流程面板要標紅的步驟：答案檢查攔下。只認步驟開頭，引用文字或問題裡出現「攔下」不算。
export const isBlockedStep = (step: string) => /^答案檢查：攔下/.test(step);

// 交車說明：由規則引擎結論和車主選擇組成，不呼叫 AI。
export function handoverFlow(h: Handover): FlowEntry {
  const names = (xs: string[]) => (xs.length ? xs.join("、") : "無");
  return {
    title: "交車說明：規則產生",
    steps: [
      `今天完成：${names(h.done.map((d) => d.name))}`,
      `待車主授權：${names(h.pending.map((d) => d.name))}`,
      `今天延後：${names(h.deferred.map((d) => `${d.item.name}（${d.months} 個月後複查）`))}`,
      `尚未選擇：${names(h.undecided.map((d) => `${d.item.name}（預設 ${d.months} 個月後複查）`))}`,
      `目前不用換：${names(h.fine.map((i) => i.name))}`,
    ],
    aiCalls: 0,
  };
}

// 專員按「確認並使用」：建議說法由規則產生，專員確認後才對車主說明。
// 畫面已不顯示規則那句建議說法（上面清單已列結論），紀錄只寫專員確認了摘要。
export function staffConfirmFlow(): FlowEntry {
  return { title: "專員確認檢查結果摘要", steps: ["專員看過結論清單和 AI 摘要，確認後向車主說明"], aiCalls: 0 };
}

// 按「請專員來說明」：示意版沒有通知任何人（Codex 審查 #37），畫面只說正式版會怎麼做。note：症狀登記的內容。
export const notifyText = (note?: string) =>
  note ? `（示意）正式版會把通知送到服務專員的平板，並附上：${note}` : "（示意）正式版會把通知送到服務專員的平板。";
export function notifyFlow(note?: string): FlowEntry {
  return {
    title: "請專員來說明（示意）",
    steps: ["示意版沒有送出通知", note ? `正式版會送到服務專員的平板，附上：${note}` : "正式版會送到服務專員的平板"],
    aiCalls: 0,
  };
}
