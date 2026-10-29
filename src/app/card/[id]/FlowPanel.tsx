"use client";

// 流程面板：讓評審看見每一步在做什麼。每筆紀錄有標題、幾個步驟、AI 呼叫次數。
export type FlowEntry = {
  title: string;
  steps: string[];
  aiCalls: number;
};

export default function FlowPanel({ entries }: { entries: FlowEntry[] }) {
  return (
    <details open className="rounded-xl border border-line bg-white p-4">
      <summary className="cursor-pointer font-semibold">流程面板（{entries.length} 筆）</summary>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">還沒有紀錄。</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {/* 最新的放最上面。 */}
          {entries
            .map((e, i) => ({ e, i }))
            .reverse()
            .map(({ e, i }) => (
              <li key={i} className="border-l-2 border-line pl-3">
                <p className="text-sm font-semibold">{e.title}</p>
                <ul className="text-sm text-muted">
                  {e.steps.map((s, j) => (
                    <li key={j}>→ {s}</li>
                  ))}
                </ul>
                <p className={`text-sm font-semibold ${e.aiCalls === 0 ? "text-ok" : "text-defer"}`}>
                  AI 呼叫 {e.aiCalls} 次
                </p>
              </li>
            ))}
        </ol>
      )}
    </details>
  );
}
