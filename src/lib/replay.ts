// 真實攔截重播：11/9 決賽凍結版實測時，真的 Gemini 回答說錯、被答案檢查攔下的一句。
// 展示用：原文照抄紀錄，不呼叫 AI，走真的答案檢查。紀錄檔在 repo，評審可以查證。
export type RealReplay = { question: string; answer: string; itemId: string; log: string };

export const REAL_REPLAY: Record<string, RealReplay> = {
  wang: {
    question: "你怎麼知道煞車剩 2mm？",
    answer: "前煞車來令片量測是 2 mm，低於安全門檻 3 mm。結論是必須更換，示意費用 NT$3,000，實際以服務廠報價為準。定期追蹤，到時再換。",
    itemId: "brake-pad",
    log: "docs/eval/raw/2026-11-09_freeze_run1.log 第 16 題",
  },
};
