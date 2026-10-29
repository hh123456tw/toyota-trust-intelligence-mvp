"use client";

import { useState } from "react";
import type { SummaryResult } from "@/lib/ask";
import { staffConfirmFlow, summaryFlow, type FlowEntry } from "@/lib/flow";
import Icon from "../../Icon";

// 接待摘要：給服務專員看，AI 把整張決策卡整理成 30 秒能講完的版本。
// edited：技師改過量測值。AI 只讀原始資料（同追問的已知限制），所以改值後不再產生。
export default function ReceptionSummary(props: {
  vehicleId: string;
  sourceLabels: Record<string, string>;
  onFlow: (entry: FlowEntry) => void;
  edited: boolean;
  // 專員建議說法：由規則引擎結論組成（staffLine），不經 AI。
  line: string;
}) {
  const { vehicleId, sourceLabels, onFlow } = props;
  const [result, setResult] = useState<SummaryResult | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function generate() {
    setBusy(true);
    setConfirmed(false);
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
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white">
          <Icon name="sparkle" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">接待摘要（專員版）</p>
          <p className="text-sm text-muted">AI 整理成 30 秒能講完的版本，專員確認後向車主說明。</p>
        </div>
        <button
          onClick={generate}
          disabled={busy || props.edited}
          className="min-h-11 shrink-0 rounded-xl bg-ink px-4 font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "整理中…" : "產生摘要"}
        </button>
      </div>
      {props.edited && <p className="text-sm text-muted">技師已改值：摘要只依原始量測產生，展示時請先產生摘要再改值。</p>}
      {result && "error" in result && <p className="text-sm text-muted">{result.error}</p>}
      {result && !("error" in result) && (
        <div className="rounded-xl bg-paper p-3">
          <p
            className={`mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold ${result.checkResult === "攔下" ? "bg-defer-soft text-defer" : "bg-ok-soft text-ok"}`}
          >
            <Icon name={result.checkResult === "攔下" ? "alert" : "check"} className="size-4 shrink-0" />
            答案檢查：
            {result.checkResult === "攔下" ? `攔下（${result.blockedReason}）。以下是規則版摘要（未經 AI）：` : "通過"}
          </p>
          <p className="leading-relaxed">{result.answer}</p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {result.sources.map((s) => (
              <li
                key={s}
                className="flex items-center gap-1 rounded-md border border-line bg-white px-2 py-0.5 text-xs text-muted"
              >
                <Icon name="doc" className="size-3" />
                來源｜{sourceLabels[s] ?? s}
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-lg border border-line bg-white p-3">
            <p className="text-xs font-semibold text-muted">專員建議說法（規則產生）</p>
            <p className="mt-1 font-semibold">「{props.line}」</p>
            {confirmed ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ok">
                <Icon name="check" className="size-4" />
                專員已確認，可以向車主說明
              </p>
            ) : (
              <button
                onClick={() => {
                  setConfirmed(true);
                  onFlow(staffConfirmFlow(props.line));
                }}
                className="mt-2 min-h-11 w-full rounded-xl bg-ink text-sm font-semibold text-white transition-opacity active:opacity-80"
              >
                確認並使用
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
