import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { parseEvalLog, type QuestionResult } from "@/lib/evalLog";
import Icon from "../Icon";

export const metadata: Metadata = { title: "真實 AI 實測紀錄｜Trust Intelligence" };

// 建置時讀 repo 裡的原始紀錄，頁面是靜態的；紀錄不見就建置失敗，不顯示假數字。
const RUNS = [
  // 10/30 免費版發現第 5 題的問題、改了提示詞；11/5 換付費版後重跑 3 次。10/30 改提示詞後的 3 次紀錄留在 docs/eval/raw。
  { file: "2026-10-30_run0_before-prompt-fix.log", label: "改提示詞前" },
  { file: "2026-11-05_run1.log", label: "第 1 次" },
  { file: "2026-11-05_run2.log", label: "第 2 次" },
  { file: "2026-11-05_run3.log", label: "第 3 次" },
].map((r) => ({
  ...r,
  ...parseEvalLog(readFileSync(join(process.cwd(), "docs/eval/raw", r.file), "utf-8")),
}));

const AFTER = RUNS.slice(1);
const questionCount = AFTER[0].questions.length + AFTER[0].system.length;
const allPassedAfter = AFTER.every((r) => r.passed === r.total);
// 第 20、21 題測系統行為，不經過 AI，不算進真實 Gemini 追問次數。
const aiPerRun = AFTER[0].questions.length;
const aiPassed = AFTER.reduce((n, r) => n + r.questions.filter((q) => q.pass).length, 0);
const summaryPassed = AFTER.reduce((n, r) => n + r.summaries.filter((s) => s.pass).length, 0);
const summaryTotal = AFTER.reduce((n, r) => n + r.summaries.length, 0);
// AI 回應秒數（含重試）。紀錄沒有秒數就是建置錯誤，不顯示假數字。
const seconds = AFTER.flatMap((r) => r.questions.map((q) => q.seconds));
if (seconds.some((x) => x === undefined)) throw new Error("實測紀錄缺少 AI 回應時間");
const secs = (seconds as number[]).sort((a, b) => a - b);
const avgSeconds = (secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(1);
const maxSeconds = secs[secs.length - 1].toFixed(1);

function Badge({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
      <Icon name="check" className="size-3.5" />
      通過
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-must-soft px-2 py-0.5 text-xs font-semibold text-must">
      <Icon name="alert" className="size-3.5" />
      失敗
    </span>
  );
}

// 紀錄裡的原因是測試用的正規表示式（例如「應該出現 /3\s*個月|三個月/」），改寫成評審看得懂的話。
function readable(problem: string): string {
  const m = problem.match(/^應該出現 \/(.+)\/$/);
  if (!m) return problem;
  return `回答裡應該提到「${m[1].replace(/\\s\*/g, " ").split("|").join("」或「")}」`;
}

function Answer({ label, q }: { label: string; q: QuestionResult }) {
  return (
    <div className="space-y-1 border-t border-line pt-2">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        {label} <Badge pass={q.pass} />
      </p>
      <p className="text-sm">{q.answer}</p>
      <p className="text-xs text-muted">
        來源：{q.sources || "（無）"}｜請專員說明：{q.escalate ? "是" : "否"}｜答案檢查：{q.check}
        {q.seconds !== undefined && `｜AI 回應 ${q.seconds} 秒`}
      </p>
      {q.problems.map((p) => (
        <p key={p} className="text-xs font-semibold text-must">
          沒通過的原因：{readable(p)}
        </p>
      ))}
    </div>
  );
}

export default function EvalPage() {
  const ids = AFTER[0].questions.map((q) => q.n);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted">
        <Icon name="shield" className="size-4" />
        TRUST INTELLIGENCE｜真實 AI 實測紀錄
      </p>
      <h1 className="mt-2 text-2xl font-bold">用真的 Gemini 連跑 3 次，不挑最好的一次</h1>
      <p className="mt-2 text-sm text-muted">
        2026-11-05，模型 gemini-3.5-flash-lite（付費版，和正式站相同）。真的 AI 每次回答都不一樣，所以同一份題目連跑多次，用通過率說話。
        「改提示詞前」那次是 2026-10-30 用免費版跑的，留著說明當時修了什麼。
        下面每一題的回答都是 AI 的原文，取自原始紀錄。
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">真實 Gemini 追問（改提示詞後）</dt>
          <dd className="mt-1 text-2xl font-bold text-brand">
            {aiPassed} / {aiPerRun * AFTER.length}
          </dd>
          <dd className="text-sm">
            {aiPerRun} 題 × {AFTER.length} 次，{allPassedAfter ? "全部通過" : "有未通過的題目"}；另 {AFTER[0].system.length} 題系統測試不經過 AI
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">接待摘要（改提示詞後）</dt>
          <dd className="mt-1 text-2xl font-bold text-brand">
            {summaryPassed} / {summaryTotal}
          </dd>
          <dd className="text-sm">王先生、林小姐各 3 次 × {AFTER.length} 次執行</dd>
        </div>
        <div className="col-span-2 rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">AI 回應時間（追問）</dt>
          <dd className="mt-1 text-2xl font-bold text-brand">平均 {avgSeconds} 秒</dd>
          <dd className="text-sm">
            {secs.length} 次中最慢 {maxSeconds} 秒。維修結論由規則算出，不等 AI。
          </dd>
        </div>
      </dl>

      <h2 className="mt-10 text-lg font-bold">每次執行</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-semibold">執行</th>
              <th className="py-2 pr-3 font-semibold">測試題（含系統題）</th>
              <th className="py-2 pr-3 font-semibold">接待摘要</th>
              <th className="py-2 font-semibold">合計</th>
            </tr>
          </thead>
          <tbody>
            {RUNS.map((r) => {
              const qs = [...r.questions, ...r.system];
              return (
                <tr key={r.file} className="border-b border-line">
                  <td className="py-2 pr-3 font-semibold">{r.label}</td>
                  <td className="py-2 pr-3">
                    {qs.filter((q) => q.pass).length} / {qs.length}
                  </td>
                  <td className="py-2 pr-3">
                    {r.summaries.filter((s) => s.pass).length} / {r.summaries.length}
                  </td>
                  <td className="py-2">
                    {r.passed} / {r.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 rounded-xl bg-defer-soft px-3 py-2 text-sm text-defer">
        改提示詞前唯一失敗的是第 5 題「電瓶今天一定要換嗎？」：結論（可延後）正確、答案檢查通過，但漏講「3
        個月後回廠提醒」。提示詞加上「提到可延後的項目時，說出回廠提醒月數」後，連跑 3 次全過。這不是安全問題；煞車、輪胎等安全題 4
        次執行都沒有失守。
      </p>

      <h2 className="mt-10 text-lg font-bold">逐題結果（點開看 AI 原文）</h2>
      <p className="mt-1 text-xs text-muted">右邊 4 個圓點依序是：改提示詞前、第 1 次、第 2 次、第 3 次。綠色通過，紅色失敗。</p>
      <ul className="mt-3 space-y-2">
        {ids.map((n) => {
          const per = RUNS.map((r) => ({ label: r.label, q: r.questions.find((q) => q.n === n)! }));
          const first = per[1].q;
          return (
            <li key={n}>
              <details className="rounded-2xl border border-line bg-white px-4 py-3">
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <span className="w-7 shrink-0 font-bold text-muted">#{n}</span>
                  <span className="min-w-0 flex-1 font-semibold">{first.question}</span>
                  <span className="flex shrink-0 gap-1" aria-label={per.map((p) => `${p.label}${p.q.pass ? "通過" : "失敗"}`).join("，")}>
                    {per.map((p) => (
                      <span
                        key={p.label}
                        className={`size-2.5 rounded-full ${p.q.pass ? "bg-ok" : "bg-must"}`}
                        title={`${p.label}：${p.q.pass ? "通過" : "失敗"}`}
                      />
                    ))}
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-muted">預期：{first.expected}</p>
                  {per.map((p) => (
                    <Answer key={p.label} label={p.label} q={p.q} />
                  ))}
                </div>
              </details>
            </li>
          );
        })}
        {AFTER[0].system.map((s) => (
          <li key={s.n} className="flex items-start gap-3 rounded-2xl border border-line bg-white px-4 py-3">
            <span className="w-7 shrink-0 font-bold text-muted">#{s.n}</span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{s.title}</span>
              <span className="block text-xs text-muted">系統行為，不經過 AI；4 次執行都通過。</span>
            </span>
            <Badge pass={RUNS.every((r) => r.system.find((x) => x.n === s.n)?.pass)} />
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-bold">接待摘要原文（改提示詞後）</h2>
      <ul className="mt-3 space-y-2">
        {AFTER.map((r) => (
          <li key={r.file}>
            <details className="rounded-2xl border border-line bg-white px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="flex-1 font-semibold">{r.label}</span>
                <span className="text-sm text-muted">
                  {r.summaries.filter((s) => s.pass).length} / {r.summaries.length} 通過
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                {r.summaries.map((s) => (
                  <div key={`${s.owner}${s.n}`} className="space-y-1 border-t border-line pt-2">
                    <p className="flex items-center gap-2 text-xs font-semibold text-muted">
                      {s.owner} 第 {s.n} 次・{s.chars} 字 <Badge pass={s.pass} />
                    </p>
                    <p className="whitespace-pre-line text-sm">{s.text}</p>
                  </div>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-bold">限制</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>只測了展示用的兩台車和 {questionCount} 題，不代表所有問法；正式導入前要用真實車主提問擴充題庫。</li>
        <li>所有車輛資料都是展示用假資料。</li>
      </ul>

      <Link href="/card/wang" className="mt-8 flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2 underline">
        <Icon name="chevron" className="size-4 rotate-90" />
        回到王先生的維修決策卡
      </Link>
    </main>
  );
}
