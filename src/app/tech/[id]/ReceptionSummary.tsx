"use client";

import { useState } from "react";
import type { SummaryResult } from "@/lib/ask";
import { summaryFlow, type FlowEntry } from "@/lib/flow";

// 接待摘要：給服務專員看，AI 把整張決策卡整理成 30 秒能講完的版本。
// edited：技師改過量測值。AI 只讀原始資料（同追問的已知限制），所以改值後不再產生。
export default function ReceptionSummary(props: {
  vehicleId: string;
  sourceLabels: Record<string, string>;
  onFlow: (entry: FlowEntry) => void;
  edited: boolean;
}) {
  const { vehicleId, sourceLabels, onFlow } = props;
  const [result, setResult] = useState<SummaryResult | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, summary: true }),
      });
      const data = await res.json();
      setResult(data);
      onFlow(summaryFlow(res.status, data, sourceLabels));
    } catch {
      const data = { error: "連線失敗" };
      setResult(data);
      onFlow(summaryFlow(0, data, sourceLabels));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">接待摘要（專員版）</p>
          <p className="text-sm text-muted">AI 整理成 30 秒能講完的版本，專員確認後向車主說明。</p>
        </div>
        <button
          onClick={generate}
          disabled={busy || props.edited}
          className="shrink-0 rounded-lg bg-ink px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {busy ? "整理中…" : "產生摘要"}
        </button>
      </div>
      {props.edited && <p className="text-sm text-muted">技師已改值：摘要只依原始量測產生，展示時請先產生摘要再改值。</p>}
      {result && "error" in result && <p className="text-sm text-muted">{result.error}</p>}
      {result && !("error" in result) && (
        <div>
          <p
            className={`mb-2 rounded px-2 py-1 text-sm font-semibold ${result.checkResult === "攔下" ? "bg-defer-soft text-defer" : "bg-ok-soft text-ok"}`}
          >
            答案檢查：
            {result.checkResult === "攔下" ? `攔下（${result.blockedReason}）。以下是規則版摘要（未經 AI）：` : "通過"}
          </p>
          <p>{result.answer}</p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {result.sources.map((s) => (
              <li key={s} className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
                來源｜{sourceLabels[s] ?? s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
