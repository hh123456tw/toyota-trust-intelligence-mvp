"use client";

import { isBlockedStep, type FlowEntry } from "@/lib/flow";
import Icon from "../../Icon";

// 流程面板：讓評審看見每一步在做什麼。

export default function FlowPanel({ entries }: { entries: FlowEntry[] }) {
  return (
    <details open className="group rounded-2xl border border-line bg-white p-4 shadow-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-ink-2 text-white">
          <Icon name="cpu" className="size-5" />
        </span>
        <span className="flex-1 font-bold">流程面板</span>
        <span className="rounded-full bg-paper px-2.5 py-0.5 text-sm text-muted">{entries.length} 筆</span>
        <Icon name="chevron" className="size-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">還沒有紀錄。追問或改量測值後，這裡會顯示每一步。</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {/* 最新的放最上面。 */}
          {entries
            .map((e, i) => ({ e, i }))
            .reverse()
            .map(({ e, i }) => (
              <li key={i} className="rounded-xl border border-line bg-paper p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{e.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${e.aiCalls === 0 ? "bg-ok-soft text-ok" : "bg-defer-soft text-defer"}`}
                  >
                    AI 呼叫 {e.aiCalls} 次
                  </span>
                </div>
                <ol className="mt-2 space-y-1 border-l-2 border-line pl-3 text-sm text-muted">
                  {e.steps.map((s, j) => (
                    <li key={j} className={isBlockedStep(s) ? "font-semibold text-must" : ""}>
                      {s}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
        </ol>
      )}
    </details>
  );
}
