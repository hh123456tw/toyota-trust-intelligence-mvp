import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { parseEvalLog, type QuestionResult } from "@/lib/evalLog";
import Icon from "../Icon";

export const metadata: Metadata = { title: "真實 AI 實測紀錄｜Trust Intelligence" };

// 建置時讀 repo 裡的原始紀錄，頁面是靜態的；紀錄不見就建置失敗，不顯示假數字。
const RUNS = [
  // 11/7 加入車主偏好（#25）：第一輪 run1 有誤攔，修正答案檢查和提示詞後重跑；最後 3 次在下面。中間那輪和其他日期的紀錄留在 docs/eval/raw。
  { file: "2026-11-07_pref_before-fix_run1.log", label: "修正前" },
  { file: "2026-11-07_pref_run1.log", label: "第 1 次" },
  { file: "2026-11-07_pref_run2.log", label: "第 2 次" },
  { file: "2026-11-07_pref_run3.log", label: "第 3 次" },
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
const mid = secs.length >> 1;
const medianSeconds = (secs.length % 2 ? secs[mid] : (secs[mid - 1] + secs[mid]) / 2).toFixed(1);

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
        2026-11-07 加入車主偏好後，模型 gemini-3.5-flash-lite（付費版，和正式站相同）。真的 AI 每次回答都不一樣，所以同一份題目連跑多次，用通過率說話。
        王先生的車用預設偏好（能等就等、最在意價格、下週載家人長途）。「修正前」是同一天第一輪的第 1 次，留著說明修了什麼。
        下面每一題的回答都是 AI 的原文，取自原始紀錄。
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">真實 Gemini 追問（修正後）</dt>
          <dd className="mt-1 text-2xl font-bold text-brand">
            {aiPassed} / {aiPerRun * AFTER.length}
          </dd>
          <dd className="text-sm">
            {aiPerRun} 題 × {AFTER.length} 次，{allPassedAfter ? "全部通過" : "有未通過的題目"}；另 {AFTER[0].system.length} 題系統測試不經過 AI
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">接待摘要（修正後）</dt>
          <dd className="mt-1 text-2xl font-bold text-brand">
            {summaryPassed} / {summaryTotal}
          </dd>
          <dd className="text-sm">王先生、林小姐各 3 次 × {AFTER.length} 次執行</dd>
        </div>
        <div className="col-span-2 rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">AI 回應時間（追問）</dt>
          <dd className="mt-1 text-2xl font-bold text-brand">平均 {avgSeconds} 秒</dd>
          <dd className="text-sm">
            {secs.length} 次中位數 {medianSeconds} 秒，最慢 {maxSeconds} 秒。維修結論由規則算出，不等 AI。
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
        修正前（第一輪 3 次，80 / 81 通過）有兩個問題。第 25 題被答案檢查誤攔：AI 說「輪胎無法下個月再換」是對的，檢查卻只認得「無法」緊接在延後字詞前面，把它當成說可以延後。
        第 27 題自動檢查通過，但人看原文發現 AI 對選了能等就等的王先生說「建議在出遠門前處理」，像在推銷，檢查只認「換」字沒攔到。
        修正：答案檢查認得「無法下個月再換」；能等就等時「建議…處理」也攔下，沒點名項目的句子承接上一句的項目；提示詞改成有長途行程時說「出發前可以請專員安排再測一次」。
        第二輪 3 次又有 1 次第 12 題沒過：AI 引用原廠事實時提到煞車，卻沒列出煞車的結論，被答案檢查攔下（檢查是對的）。提示詞補上這條後，才是上面這 3 次。
      </p>
      <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm text-muted">
        上面 3 次仍有 1 次沒過：第 2 次的第 23 題，林小姐說預算有限，AI 還建議最貴的長效款，被答案檢查攔下，車主看到的是請專員說明。這是 AI 說錯，檢查擋住了，沒有修。
        所有沒過的題目都沒有把必須更換說成可以延後，也沒有因偏好改變結論。題目是修正時用過的題目，所以這 3 次是回歸驗證，不代表所有問法。
        平均時間含 Gemini 忙碌（429）時的重試，最慢那次就是重試造成的；中位數比較接近平常的速度。
      </p>

      <h2 className="mt-10 text-lg font-bold">逐題結果（點開看 AI 原文）</h2>
      <p className="mt-1 text-xs text-muted">右邊的圓點依序是：修正前、第 1 次、第 2 次、第 3 次。綠色通過，紅色失敗。</p>
      <ul className="mt-3 space-y-2">
        {ids.map((n) => {
          const per = RUNS.flatMap((r) => {
            const q = r.questions.find((x) => x.n === n);
            return q ? [{ label: r.label, q }] : [];
          });
          const first = per[per.length - 1].q;
          return (
            <li key={n}>
              <details className="rounded-2xl border border-line bg-white px-4 py-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3">
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

      <h2 className="mt-10 text-lg font-bold">接待摘要原文（修正後）</h2>
      <p className="mt-1 text-sm text-muted">
        王先生的摘要最後多一行「車主偏好：…」，由規則產生（31 字），不交給 AI 寫。加上這行後合計 110–136 字，超過提示詞要求的 120 字；AI 寫的部分是 79–105 字，仍在 120 字內。林小姐沒有偏好，沒有這一行。
      </p>
      <ul className="mt-3 space-y-2">
        {AFTER.map((r) => (
          <li key={r.file}>
            <details className="rounded-2xl border border-line bg-white px-4 py-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3">
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
