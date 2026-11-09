"use client";

import { useEffect, useRef, useState } from "react";
import { currentMeasurements } from "@/lib/card";
import type { SummaryResult } from "@/lib/ask";
import type { CardItem } from "@/lib/card";
import type { OwnerPreferences } from "@/lib/preferences";
import { staffConfirmFlow, summaryFlow, type FlowEntry } from "@/lib/flow";
import { LABEL, type Conclusion } from "@/lib/rules";
import { askHeaders } from "@/lib/visitor";
import Icon, { ITEM_ICON } from "../../Icon";

// 分級顏色：左側色條、圖示、標籤用同一個顏色，和簡報 A5 的 Rule Engine 分級一致。
const TONE: Record<Conclusion, { bar: string; text: string }> = {
  必須更換: { bar: "border-l-must", text: "text-must" },
  可延後: { bar: "border-l-defer", text: "text-defer" },
  正常: { bar: "border-l-ok", text: "text-ok" },
};

// 檢查結果摘要：技師檢查後給服務專員看，AI 把整張決策卡整理成 30 秒能講完的版本。
export default function InspectionSummary(props: {
  vehicleId: string;
  sourceLabels: Record<string, string>;
  onFlow: (entry: FlowEntry) => void;
  // 專員建議說法：由規則引擎結論組成（staffLine），不經 AI。
  line: string;
  // 一項一行的清單：結論和理由都來自規則引擎，不經 AI。
  items: CardItem[];
  // 車主偏好，和量測值一起送給 API。
  preferences?: OwnerPreferences;
}) {
  const { vehicleId, sourceLabels, onFlow } = props;
  const [result, setResult] = useState<SummaryResult | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // 技師改值後舊摘要就過期了：清掉，重新產生時會帶新值。
  const [seenItems, setSeenItems] = useState(props.items);
  if (props.items !== seenItems) {
    setSeenItems(props.items);
    setResult(null);
    setConfirmed(false);
  }

  // 產生到一半技師又改值：回來的是舊值的摘要，不能顯示，也不能讓專員確認。
  const latestItems = useRef(props.items);
  useEffect(() => {
    latestItems.current = props.items;
  }, [props.items]);

  async function generate() {
    const sent = props.items;
    setBusy(true);
    setConfirmed(false);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: askHeaders(),
        body: JSON.stringify({
          vehicleId,
          summary: true,
          measurements: currentMeasurements(props.items),
          preferences: props.preferences,
        }),
      });
      const data = await res.json();
      if (latestItems.current !== sent) return;
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
          <h3 className="font-bold">檢查結果摘要</h3>
          <p className="text-sm text-muted">AI 整理成 30 秒能講完的版本，專員確認後向車主說明。</p>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="min-h-11 shrink-0 rounded-xl bg-ink px-4 font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? "整理中…" : "產生摘要"}
        </button>
      </div>
      {result && "error" in result && <p className="text-sm text-muted">{result.error}</p>}
      {result && !("error" in result) && (
        <div className="space-y-3 rounded-xl bg-paper p-3">
          {/* 精簡清單：一項一行，結論一眼看完；下面是 AI 整理的說法。 */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">今天檢查 {props.items.length} 個項目（規則引擎判定）</p>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white">
              {props.items.map((i) => {
                const { conclusion, reason, reminderMonths } = i.verdict;
                const tone = TONE[conclusion];
                return (
                  <li key={i.id} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 border-l-4 sm:flex-nowrap py-1.5 pr-3 pl-2 text-sm ${tone.bar}`}>
                    <Icon name={ITEM_ICON[i.id] ?? "wrench"} className={`size-4 shrink-0 ${tone.text}`} />
                    <span className={`w-[4.5rem] shrink-0 font-semibold ${tone.text}`}>{LABEL[conclusion]}</span>
                    <span className="shrink-0 font-medium">{i.name}</span>
                    {/* 窄螢幕換行讀得完；寬螢幕單行，滑鼠停留看全文。 */}
                    <span
                      title={`${reason}${reminderMonths ? ` ${reminderMonths} 個月後提醒回廠。` : ""}`}
                      className="min-w-0 flex-1 text-xs text-muted sm:truncate"
                    >
                      {reason}
                      {reminderMonths && ` ${reminderMonths} 個月後提醒回廠。`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">{result.checkResult === "攔下" ? "規則版摘要（未經 AI）" : "AI 檢查結果摘要"}</p>
              <p
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${result.checkResult === "攔下" ? "bg-defer-soft text-defer" : "bg-ok-soft text-ok"}`}
              >
                <Icon name={result.checkResult === "攔下" ? "alert" : "check"} className="size-3.5 shrink-0" />
                答案檢查：{result.checkResult === "攔下" ? `攔下（${result.blockedReason}）` : "通過"}
              </p>
            </div>
            <p className="mt-2 text-lg leading-relaxed">{result.answer}</p>
            <details className="mt-1 text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center text-muted">看來源（{result.sources.length}）</summary>
              <ul className="flex flex-wrap gap-1">
                {result.sources.map((s) => (
                  <li
                    key={s}
                    className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-xs text-muted"
                  >
                    <Icon name="doc" className="size-3" />
                    來源｜{sourceLabels[s] ?? s}
                  </li>
                ))}
              </ul>
            </details>
          </div>
          {/* 上面的清單已列出每項結論，不再重複規則那句；確認按鈕留著，按下後記錄專員確認（建議說法仍由規則產生，寫進流程紀錄）。 */}
          {confirmed ? (
            <p className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ok">
              <Icon name="check" className="size-4" />
              專員已確認，可以向車主說明
            </p>
          ) : (
            <button
              onClick={() => {
                setConfirmed(true);
                onFlow(staffConfirmFlow(props.line));
              }}
              className="min-h-11 w-full rounded-xl bg-ink text-sm font-semibold text-white transition-opacity active:opacity-80"
            >
              確認並使用
            </button>
          )}
        </div>
      )}
    </div>
  );
}
