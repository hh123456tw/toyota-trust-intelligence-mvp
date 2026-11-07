import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { parseEvalLog, type QuestionResult } from "@/lib/evalLog";
import { preferenceSummaryLine } from "@/lib/preferences";
import { findVehicle } from "@/lib/vehicles";
import Icon from "../Icon";

export const metadata: Metadata = { title: "真實 AI 實測紀錄｜Trust Intelligence" };

// 建置時讀 repo 裡的原始紀錄，頁面是靜態的；紀錄不見就建置失敗，不顯示假數字。頁面上的數字一律從紀錄算。
const load = (file: string) => parseEvalLog(readFileSync(join(process.cwd(), "docs/eval/raw", file), "utf-8"));
const FINAL = "2026-11-08_pref_final_run";

const RUNS = [
  // 10/30 免費版發現第 5 題的問題、改了提示詞（簡報講稿用到這次）；11/7 加入車主偏好後第一輪的第 1 次；最後是 11/8 審查修正後的 3 次。
  { file: "2026-10-30_run0_before-prompt-fix.log", label: "10/30 改提示詞前" },
  { file: "2026-11-07_pref_before-fix_run1.log", label: "11/7 修正前" },
  ...[1, 2, 3].map((n) => ({ file: `${FINAL}${n}.log`, label: `第 ${n} 次` })),
].map((r) => ({ ...r, ...load(r.file) }));

// 加入車主偏好後的每一輪（每輪 3 次）。
const ROUNDS = [
  { name: "11/7 第一輪（修正前）", prefix: "2026-11-07_pref_before-fix_run" },
  { name: "11/7 第二輪", prefix: "2026-11-07_pref_fix1_run" },
  { name: "11/7 第三輪（審查前）", prefix: "2026-11-07_pref_run" },
  { name: "11/8 審查修正後", prefix: FINAL },
].map((r) => {
  const runs = [1, 2, 3].map((n) => load(`${r.prefix}${n}.log`));
  const sum = (f: (x: (typeof runs)[number]) => number) => runs.reduce((n, x) => n + f(x), 0);
  return {
    ...r,
    aiPassed: sum((x) => x.questions.filter((q) => q.pass).length),
    aiTotal: sum((x) => x.questions.length),
    summaryPassed: sum((x) => x.summaries.filter((s) => s.pass).length),
    summaryTotal: sum((x) => x.summaries.length),
  };
});

const AFTER = RUNS.slice(2);
const failedAfter = AFTER.flatMap((r) => r.questions.filter((q) => !q.pass).map((q) => ({ label: r.label, q })));
// 檢查結果摘要字數：王先生的摘要最後接規則產生的偏好行，AI 寫的部分 = 合計 − 偏好行。
const wangLine = preferenceSummaryLine(findVehicle("wang")!.preferences);
const range = (xs: number[]) => `${Math.min(...xs)}–${Math.max(...xs)}`;
const wangChars = AFTER.flatMap((r) => r.summaries.filter((s) => s.owner === "王先生").map((s) => s.chars));
const linChars = AFTER.flatMap((r) => r.summaries.filter((s) => s.owner === "林小姐").map((s) => s.chars));
const over120 = wangChars.filter((c) => c > 120).length;
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
        2026-11-08 加入車主偏好、依審查修正答案檢查後，模型 gemini-3.5-flash-lite（付費版，和正式站相同）。真的 AI 每次回答都不一樣，所以同一份題目連跑多次，用通過率說話。
        王先生的車用預設偏好（能等就等、最在意價格、下週載家人長途）。「10/30 改提示詞前」和「11/7 修正前」是之前沒全過的紀錄，留著說明修了什麼。
        下面每一題的回答都是 AI 的原文，取自原始紀錄。
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">真實 Gemini 追問（審查修正後）</dt>
          <dd className="mt-1 text-2xl font-bold text-brand">
            {aiPassed} / {aiPerRun * AFTER.length}
          </dd>
          <dd className="text-sm">
            {aiPerRun} 題 × {AFTER.length} 次，{allPassedAfter ? "全部通過" : "有未通過的題目"}；另 {AFTER[0].system.length} 題系統測試不經過 AI
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <dt className="text-xs text-muted">檢查結果摘要（審查修正後）</dt>
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
              <th className="py-2 pr-3 font-semibold">檢查結果摘要</th>
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
      <h2 className="mt-10 text-lg font-bold">加入車主偏好後的每一輪</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-semibold">輪次（各 3 次）</th>
              <th className="py-2 pr-3 font-semibold">真實 Gemini 追問</th>
              <th className="py-2 font-semibold">檢查結果摘要</th>
            </tr>
          </thead>
          <tbody>
            {ROUNDS.map((r) => (
              <tr key={r.prefix} className="border-b border-line">
                <td className="py-2 pr-3 font-semibold">{r.name}</td>
                <td className="py-2 pr-3">
                  {r.aiPassed} / {r.aiTotal}
                </td>
                <td className="py-2">
                  {r.summaryPassed} / {r.summaryTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 list-disc space-y-1 rounded-xl bg-defer-soft py-2 pr-3 pl-7 text-sm text-defer">
        <li>
          第一輪：第 25 題被答案檢查誤攔，AI 說「輪胎無法下個月再換」是對的，檢查卻把它當成說可以延後。第 27 題自動檢查通過，但人看原文發現 AI 對選了能等就等的王先生說「建議在出遠門前處理」，像在推銷。
          修正答案檢查，提示詞改成有長途行程時說「出發前可以請專員安排再測一次」。
        </li>
        <li>第二輪：第 12 題 AI 引用原廠事實時提到煞車，卻沒列出煞車的結論，被答案檢查攔下（檢查是對的）。提示詞補上這條。</li>
        <li>第三輪：第 23 題林小姐說預算有限，AI 還建議最貴的長效款，被答案檢查攔下（檢查是對的），沒有修。</li>
        <li>
          審查修正：程式審查發現答案檢查還有漏攔和誤攔（例如「電瓶建議下個月換」被誤攔、「外面的保養廠比原廠貴」沒攔到、「無法等到下個月再換」被誤攔）。改成先看處理的時間、比較的主詞和否定詞，每條規則都補上該攔和不該攔的測試，再重跑 3 次。
        </li>
        <li>10/30 改提示詞前：第 5 題結論正確，但漏講「3 個月後回廠提醒」，提示詞補上回廠提醒月數。</li>
      </ul>
      <div className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm text-muted">
        {failedAfter.length === 0 ? (
          <p>審查修正後的 3 次，真實 Gemini 追問全部通過。</p>
        ) : (
          <>
            <p>審查修正後的 3 次中，沒過的有：</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {failedAfter.map(({ label, q }) => (
                <li key={`${label}${q.n}`}>
                  {label}第 {q.n} 題「{q.question}」：{q.problems.map(readable).join("；")}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-1">
          題目是修正時用過的題目，所以這 3 次是回歸驗證，不代表所有問法。平均時間含 Gemini 忙碌（429）時的重試；中位數比較接近平常的速度。
        </p>
      </div>

      <h2 className="mt-10 text-lg font-bold">逐題結果（點開看 AI 原文）</h2>
      <p className="mt-1 text-xs text-muted">右邊的圓點依序是：{RUNS.map((r) => r.label).join("、")}（後來新增的題目，早期那幾次沒有跑）。綠色通過，紅色失敗。</p>
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
              <span className="block text-xs text-muted">系統行為，不經過 AI；右邊是 {RUNS.length} 次執行合起來的結果。</span>
            </span>
            <Badge pass={RUNS.every((r) => r.system.find((x) => x.n === s.n)?.pass)} />
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-bold">檢查結果摘要原文（審查修正後）</h2>
      <p className="mt-1 text-sm text-muted">
        王先生的摘要最後多一行「{wangLine}」，由規則產生（{wangLine.length} 字），不交給 AI 寫；「沒有異常」這類不影響專員開口的項目不列。
        加上這行後合計 {range(wangChars)} 字，{wangChars.length} 次中有 {over120} 次超過提示詞要求的 120 字；AI 寫的部分是{" "}
        {range(wangChars.map((c) => c - wangLine.length))} 字。林小姐沒有偏好，沒有這一行，{range(linChars)} 字。
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
