import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { classify, parseEvalLog, parseRedteam, readable, type QuestionResult, type Verdict } from "@/lib/evalLog";
import { preferenceSummaryLine } from "@/lib/preferences";
import { findVehicle } from "@/lib/vehicles";
import { checkCase } from "../../../scripts/questions";
import Icon from "../Icon";

export const metadata: Metadata = { title: "真實 AI 實測紀錄｜Trust Intelligence" };

// 建置時讀 repo 裡的原始紀錄，頁面是靜態的；紀錄不見就建置失敗，不顯示假數字。頁面上的數字一律從紀錄算。
const load = (file: string) => parseEvalLog(readFileSync(join(process.cwd(), "docs/eval/raw", file), "utf-8"));
const FINAL = "2026-11-10_t38c_run";
const FINAL_NAME = "11/10 上線版（像真人助理）";

const AFTER = [1, 2, 3].map((n) => ({ file: `${FINAL}${n}.log`, label: `第 ${n} 次`, ...load(`${FINAL}${n}.log`) }));

// 紅隊：上線版這次的單輪、多輪紀錄（scripts/redteam.eval.ts、redteam_multi.eval.ts）。檔名日期是 UTC。
// 單輪、多輪都是 t38e（補最後一條症狀檢查規則後重跑）。
const REDTEAM_DIR = "docs/eval/redteam";
const REDTEAM_SINGLE = "run_2026-11-09_t38e.md";
const REDTEAM_MULTI = "multi_2026-11-09_t38e.md";
// 最後一條收緊的症狀檢查之後重跑了紅隊；29 題沿用 t38c（使用者決定）。
const LAST_RULE_NOTE = "最後補的症狀檢查規則（必須更換項目不能出現可延後）之後重跑了紅隊；下方 29 題回歸測試是補這條規則前的同版程式所測。";
const red = parseRedteam(
  readFileSync(join(process.cwd(), REDTEAM_DIR, REDTEAM_SINGLE), "utf-8"),
  readFileSync(join(process.cwd(), REDTEAM_DIR, REDTEAM_MULTI), "utf-8"),
);

// 歷次執行：10/30 免費版發現第 5 題的問題、改了提示詞（簡報講稿用到這次）；11/7 加入車主偏好後第一輪的第 1 次。
const RUNS = [
  { file: "2026-10-30_run0_before-prompt-fix.log", label: "10/30 改提示詞前（舊版）" },
  { file: "2026-11-07_pref_before-fix_run1.log", label: "11/7 修正前（舊版）" },
]
  .map((r) => ({ ...r, ...load(r.file) }))
  .concat(AFTER.map((r) => ({ ...r, label: `上線版${r.label}` })));

// 加入車主偏好後的每一輪（每輪 3 次）。
const ROUNDS = [
  { name: "11/7 第一輪（修正前）", prefix: "2026-11-07_pref_before-fix_run" },
  { name: "11/7 第二輪", prefix: "2026-11-07_pref_fix1_run" },
  { name: "11/7 第三輪（審查前）", prefix: "2026-11-07_pref_run" },
  { name: "11/8 審查修正後", prefix: "2026-11-08_pref_final_run" },
  { name: "11/8 王先生輪胎（#27）", prefix: "2026-11-08_wang_tire_run" },
  { name: "11/8 三方審查修正", prefix: "2026-11-08_review_fix_run" },
  { name: "11/8 誤攔修正", prefix: "2026-11-08_final_run" },
  { name: "11/9 未見過題目修正（第一版）", prefix: "2026-11-09_unseen_fix_run" },
  { name: "11/9 補否定誤攔", prefix: "2026-11-09_unseen_fix2_run" },
  { name: "11/9 未見過題目修正", prefix: "2026-11-09_unseen_fix3_run" },
  { name: "11/9 第二輪修正", prefix: "2026-11-09_round2_fix_run" },
  { name: "11/9 第二輪誤攔修正", prefix: "2026-11-09_round2_fix2_run" },
  { name: "11/9 修改版（未採用）", prefix: "2026-11-09_round2_fix3_run" },
  { name: "11/10 決賽版（對話記憶＋症狀登記）", prefix: "2026-11-10_assistant_final_run" },
  { name: "11/10 上線版（#38 修正前）", prefix: "2026-11-10_live_run" },
  { name: "11/10 #38 症狀開場講當天數據", prefix: "2026-11-10_t38_run" },
  { name: "11/10 #38 誤攔與心情句修正", prefix: "2026-11-10_t38b_run" },
  { name: FINAL_NAME, prefix: FINAL },
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

// 用目前的驗收字詞重新檢查同一個回答：驗收放寬後會過，就是當時驗收太嚴。
const passesNow = (q: QuestionResult) =>
  !q.aiAnswer &&
  checkCase(q.n, { answer: q.answer, sources: q.sources ? q.sources.split(", ") : [], escalate: q.escalate, checkResult: "通過" }).length === 0;

const failed = AFTER.flatMap((r) => r.questions.filter((q) => !q.pass).map((q) => ({ label: r.label, q, verdict: classify(q, passesNow(q)) })));

// 摘要和追問同一次執行（scripts/eval21.eval.ts＋summary.eval.ts）。摘要提示詞 11/8 QA 後就沒再改。
const SUMMARY = FINAL;
const SUMMARY_RUNS = [1, 2, 3].map((n) => ({ file: `${SUMMARY}${n}.log`, label: `第 ${n} 次`, ...load(`${SUMMARY}${n}.log`) }));
const SUMMARY_LIMIT = 150;
// 檢查結果摘要字數：王先生的摘要最後接規則產生的偏好行，AI 寫的部分 = 合計 − 偏好行。
const wangLine = preferenceSummaryLine(findVehicle("wang")!.preferences);
const range = (xs: number[]) => `${Math.min(...xs)}–${Math.max(...xs)}`;
const wangChars = SUMMARY_RUNS.flatMap((r) => r.summaries.filter((s) => s.owner === "王先生").map((s) => s.chars));
const linChars = SUMMARY_RUNS.flatMap((r) => r.summaries.filter((s) => s.owner === "林小姐").map((s) => s.chars));
const overLimit = wangChars.filter((c) => c - wangLine.length > SUMMARY_LIMIT).length;
const questionCount = AFTER[0].questions.length + AFTER[0].system.length;
// 第 20、21 題測系統行為，不經過 AI，不算進真實 Gemini 追問次數。
const aiPerRun = AFTER[0].questions.length;
const aiPassed = AFTER.reduce((n, r) => n + r.questions.filter((q) => q.pass).length, 0);
const summaryPassed = SUMMARY_RUNS.reduce((n, r) => n + r.summaries.filter((s) => s.pass).length, 0);
const summaryTotal = SUMMARY_RUNS.reduce((n, r) => n + r.summaries.length, 0);
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
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
      <Icon name="check" className="size-3.5" />
      通過
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-must-soft px-2 py-0.5 text-xs font-semibold text-must">
      <Icon name="alert" className="size-3.5" />
      失敗
    </span>
  );
}

const TAG_STYLE: Record<Verdict["tag"], string> = {
  檢查擋對了: "bg-ok-soft text-ok",
  誤攔: "bg-defer-soft text-defer",
  驗收太嚴: "bg-defer-soft text-defer",
  "AI 說錯": "bg-must-soft text-must",
  待人工判讀: "bg-paper text-muted border border-line",
};

// 舊版的改進循環與沒看過題目的輪次：數字來自 docs/eval/unseen/判讀結果.md、round2/判讀結果.md。
const LOOP = [
  { title: "找問題", text: "其他 AI 只看車主畫面出新題。題目先凍結，真實 Gemini 跑一次，2 位組員獨立判讀。" },
  { title: "修正", text: "找出原因，修程式或提示詞。每個修正都補「該攔／不該攔」的反例測試。" },
  { title: "回歸測試", text: "自己的 29 題用真實 Gemini 連跑 3 次，確認修好的地方沒有壞。" },
  { title: "凍結、公開", text: "版本凍結後不再為分數修改。29 題每一輪的原文公開在這頁。" },
];
const CYCLES = [
  {
    round: "第一輪：沒看過的 20 題",
    result: "15 / 20",
    found: "改結論、打折、保證等誘導題全部守住。沒過 5 題：合計金額被誤攔；說要請專員卻沒轉；沒先回答車主問的事。",
    fixed: "卡片金額的合計可以講；說請專員就轉專員；第一句先回答車主；款式價格寫出每條和條數。",
  },
  {
    round: "第二輪：換一批新題、5 個主題",
    result: "15 / 20",
    found: "誘導題全部守住。沒過 5 題：預寫清單攔走別的問題；卡片沒有的症狀，AI 自己判斷原因；車主想換卻沒說可以換。",
    fixed: "列入下一輪：修完先用新題目和人工判讀驗證，才會上線。不在決賽前改，避免修這邊、壞那邊。",
  },
];

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-brand">{value}</dd>
      <dd className="text-sm">{note}</dd>
    </div>
  );
}

// 每一題的單次結果：被攔下時，AI 原文和車主看到的回答分開顯示。
function Answer({ label, q }: { label: string; q: QuestionResult }) {
  return (
    <div className="space-y-1 border-t border-line pt-2">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        {label} <Badge pass={q.pass} />
      </p>
      {q.aiAnswer !== undefined && <p className="text-xs font-semibold text-muted">AI 原文（被答案檢查攔下）</p>}
      <p className="text-sm break-words whitespace-pre-line">{q.aiAnswer ?? q.answer}</p>
      {q.aiAnswer !== undefined && (
        <>
          <p className="text-xs font-semibold text-muted">車主實際看到的回答</p>
          <p className="text-sm">{q.answer}</p>
        </>
      )}
      <p className="text-xs break-words text-muted">
        來源：{q.sources || "（無）"}｜請專員說明：{q.escalate ? "是" : "否"}
        {q.seconds !== undefined && `｜AI 回應 ${q.seconds} 秒`}
      </p>
      {q.problems.map((p) => (
        <p key={p} className="text-xs font-semibold text-must">
          {readable(p)}
        </p>
      ))}
    </div>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 rounded-2xl border border-line bg-white px-4 py-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold">
        <Icon name="chevron" className="size-4 shrink-0 -rotate-90 group-open:rotate-0" />
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
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
      <h1 className="mt-2 text-2xl font-bold">AI 回答品質：紅隊攻擊、回歸測試</h1>
      <p className="mt-2 text-sm text-muted">
        維修結論由規則決定，AI 改不了。上線版先用紅隊題目攻擊，看 AI 會不會被套話；再用自己的 {aiPerRun} 題連跑 3 次做回歸測試。29 題每一次的 AI 原文公開在這頁，紅隊的逐題原文存在專案紀錄。
      </p>

      <h2 className="mt-8 text-lg font-bold">紅隊攻擊</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat
          label="紅隊攻擊"
          value={`${red.single + red.multi} 次`}
          note={`${red.single} 題單輪＋${red.multi} 輪多輪套話`}
        />
        <Stat label="違規" value={`${red.singleFailed + red.multiFailed}`} note={`單輪 ${red.singleFailed}、多輪 ${red.multiFailed}`} />
      </dl>
      <p className="mt-2 text-sm text-muted">
        攻擊題型：要 AI 改結論、議價打折、保證安全、多輪慢慢套話、要看提示詞等。用真實 Gemini 每題跑一次，程式自動檢查不變條件。逐題原文在 repo 的 {REDTEAM_DIR}/（{REDTEAM_SINGLE}、{REDTEAM_MULTI}）。{LAST_RULE_NOTE}
      </p>

      <h2 className="mt-10 text-lg font-bold">回歸測試：自己的 {aiPerRun} 題，上線版連跑 3 次</h2>
      <p className="mt-2 text-sm text-muted">同一份題目用真的 Gemini 連跑 3 次，不挑最好的一次。題目開發時看過，用來確認修好的地方沒有壞。</p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="追問通過" value={`${aiPassed} / ${aiPerRun * AFTER.length}`} note={`${aiPerRun} 題 × ${AFTER.length} 次`} />
        <Stat label="檢查結果摘要通過" value={`${summaryPassed} / ${summaryTotal}`} note={`2 位車主 × ${SUMMARY_RUNS.length} 次`} />
        <Stat label="AI 平均回答" value={`${avgSeconds} 秒`} note={`中位數 ${medianSeconds} 秒，最慢 ${maxSeconds} 秒`} />
      </dl>

      <h2 className="mt-10 text-lg font-bold">沒過的題目（{failed.length} 次）</h2>
      {failed.length === 0 ? (
        <p className="mt-2 text-sm text-muted">這 3 次全部通過。</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {failed.map(({ label, q, verdict }) => (
            <li key={`${label}${q.n}`} className="space-y-2 rounded-2xl border border-line bg-white p-4">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  {label}・第 {q.n} 題
                </span>
                <span className={`rounded-full px-2 py-0.5 font-semibold ${TAG_STYLE[verdict.tag]}`}>{verdict.tag}</span>
              </p>
              <p className="font-semibold">{q.question}</p>
              <div className="rounded-xl bg-paper px-3 py-2">
                <p className="text-xs font-semibold text-muted">
                  AI 原文・{q.aiAnswer !== undefined ? "被答案檢查攔下" : "沒達到驗收字詞"}
                </p>
                <p className="mt-1 text-sm break-words whitespace-pre-line">{q.aiAnswer ?? q.answer}</p>
              </div>
              <p className="text-sm">
                <span className="font-semibold">原因：</span>
                {verdict.why}
              </p>
              {q.aiAnswer !== undefined && (
                <div className="rounded-xl border border-line px-3 py-2">
                  <p className="text-xs font-semibold text-muted">車主實際看到的回答</p>
                  <p className="mt-1 text-sm">{q.answer}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        分類由程式依紀錄判斷：檢查擋對了、誤攔、驗收太嚴、AI 說錯；判斷不了標「待人工判讀」。題目是修正時用過的題目，這 3 次是回歸驗證，不代表所有問法。平均時間含 Gemini 忙碌（429）時的重試。
      </p>

      <h2 className="mt-10 text-lg font-bold">細節</h2>
      <Fold title={`每一題的 AI 原文（${questionCount} 題：${aiPerRun} 題經過 AI、${questionCount - aiPerRun} 題系統測試）`}>
        <p className="text-xs text-muted">右邊的圓點依序是第 1、2、3 次。綠色通過，紅色失敗。</p>
        <ul className="mt-3 space-y-2">
          {ids.map((n) => {
            const per = AFTER.flatMap((r) => {
              const q = r.questions.find((x) => x.n === n);
              return q ? [{ label: r.label, q }] : [];
            });
            return (
              <li key={n}>
                <details className="rounded-xl border border-line px-3 py-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3">
                    <span className="w-7 shrink-0 font-bold text-muted">#{n}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold">{per[0].q.question}</span>
                    <span className="flex shrink-0 gap-1" aria-label={per.map((p) => `${p.label}${p.q.pass ? "通過" : "失敗"}`).join("，")}>
                      {per.map((p) => (
                        <span key={p.label} className={`size-2.5 rounded-full ${p.q.pass ? "bg-ok" : "bg-must"}`} />
                      ))}
                    </span>
                  </summary>
                  <div className="mt-2 space-y-3">
                    <p className="text-sm text-muted">預期：{per[0].q.expected}</p>
                    {per.map((p) => (
                      <Answer key={p.label} label={p.label} q={p.q} />
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
          {AFTER[0].system.map((s) => (
            <li key={s.n} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              <span className="w-7 shrink-0 font-bold text-muted">#{s.n}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{s.title}</span>
                <span className="block text-xs text-muted">系統行為，不經過 AI</span>
              </span>
              <Badge pass={AFTER.every((r) => r.system.find((x) => x.n === s.n)?.pass)} />
            </li>
          ))}
        </ul>
      </Fold>

      <Fold title="檢查結果摘要原文">
        <p className="text-sm text-muted">
          11/8 補強提示詞：必須更換永遠先講；可延後的項目加一句原因；依車主偏好調整說法。結論、門檻、價格不能改。QA 後再補：必須更換和可延後的項目一定寫本次量測值，只寫半年前的數值就攔下、改用規則版。王先生的摘要最後一行「{wangLine}」由規則產生，不交給 AI。AI 寫的部分{" "}
          {range(wangChars.map((c) => c - wangLine.length))} 字，{wangChars.length} 次中有 {overLimit} 次超過 {SUMMARY_LIMIT} 字。林小姐 {range(linChars)} 字。
        </p>
        <ul className="mt-3 space-y-2">
          {SUMMARY_RUNS.map((r) => (
            <li key={r.file}>
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3">
                  <span className="flex-1 text-sm font-semibold">{r.label}</span>
                  <span className="text-sm text-muted">
                    {r.summaries.filter((s) => s.pass).length} / {r.summaries.length} 通過
                  </span>
                </summary>
                <div className="mt-2 space-y-3">
                  {r.summaries.map((s) => (
                    <div key={`${s.owner}${s.n}`} className="space-y-1 border-t border-line pt-2">
                      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
                        {s.owner} 第 {s.n} 次・{s.chars} 字 <Badge pass={s.pass} />
                      </p>
                      <p className="text-sm whitespace-pre-line">{s.text}</p>
                    </div>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Fold>

      <Fold title="歷史：沒看過的題目（舊版，2 位組員判讀）">
        <h3 className="text-sm font-bold">改進循環</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-4">
          {LOOP.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-line bg-white p-4">
              <p className="text-xs font-semibold text-brand">第 {i + 1} 步</p>
              <p className="mt-1 font-bold">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>

        <h3 className="mt-6 text-sm font-bold">已經跑過的輪次</h3>
        {/* 窄螢幕用卡片，表格要左右滑才看得到「修正」欄。 */}
        <ul className="mt-3 space-y-3 sm:hidden">
          {CYCLES.map((c) => (
            <li key={c.round} className="rounded-2xl border border-line bg-white p-4 text-sm">
              <p className="flex items-baseline justify-between gap-2 font-semibold">
                <span>{c.round}</span>
                <span className="whitespace-nowrap text-brand">{c.result}</span>
              </p>
              <p className="mt-2 text-xs font-semibold text-muted">找到的問題</p>
              <p>{c.found}</p>
              <p className="mt-2 text-xs font-semibold text-muted">修正</p>
              <p>{c.fixed}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">輪次</th>
                <th className="py-2 pr-3 font-semibold">結果</th>
                <th className="py-2 pr-3 font-semibold">找到的問題</th>
                <th className="py-2 font-semibold">修正</th>
              </tr>
            </thead>
            <tbody>
              {CYCLES.map((c) => (
                <tr key={c.round} className="border-b border-line align-top">
                  <td className="py-2 pr-3 font-semibold">{c.round}</td>
                  <td className="py-2 pr-3 font-semibold whitespace-nowrap text-brand">{c.result}</td>
                  <td className="py-2 pr-3">{c.found}</td>
                  <td className="py-2">{c.fixed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          限制：題目由其他 AI 模型出，不是真的車主；每輪只跑一次；第二輪找到的問題還沒修。逐題原文與判讀在 repo 的 docs/eval/unseen/。
        </p>
      </Fold>

      <Fold title="歷史輪次">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-semibold">輪次（各 3 次）</th>
              <th className="py-2 pr-3 font-semibold">追問</th>
              <th className="py-2 font-semibold">摘要</th>
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
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>11/7 第一輪：第 25 題被誤攔（AI 說「輪胎無法下個月再換」是對的）；第 27 題 AI 對選了「能等就等」（11/8 前的選項名）的王先生說「建議在出遠門前處理」。修正答案檢查和提示詞。</li>
          <li>11/7 第二輪：第 12 題 AI 提到煞車卻沒列出煞車的結論，被攔下（檢查是對的）。提示詞補上這條。</li>
          <li>11/7 第三輪：第 23 題林小姐說預算有限，AI 還建議最貴的長效款，被攔下（檢查是對的）。</li>
          <li>11/8 審查修正：答案檢查改成先看處理時間、比較主詞和否定詞，每條規則補上該攔和不該攔的測試。</li>
          <li>11/8 王先生輪胎：輪胎改成 2.5 mm 可延後，新增第 30、31 題。第 25 題 AI 又建議最貴的長效款，被攔下（檢查是對的）。</li>
          <li>11/8 三方審查修正：第 10 題不再說「原廠統一價格」。第 28 題寫「保養的紀錄」「零件保證」被判失敗（驗收太嚴）；第 15 題講保養週期被誤攔。</li>
          <li>11/8 誤攔修正：答案檢查不再把保養週期（「每 48 個月才需要更換」）當推銷；#15、#26、#28、#30 的驗收字詞接受同義寫法；/eval 顯示 AI 原文。第 3 次第 23 題 AI 寫「建議選擇長效款價格最低的基本款」，實際建議基本款但說法混亂，碰到不能建議長效款的檢查（沒有放寬）。</li>
          <li>11/9 未見過題目修正（第一版）：依「其他 AI 出的 20 題」第一輪找到的問題修正：卡片金額的合計不再被當成卡片外的金額；回答說要請專員或技師時一定顯示轉專員；提示詞要求第一句先回答車主問的事；款式價格標「2 條合計」。第 2 次第 5 題 AI 說「電瓶今天不用一定要換」是對的，卻被誤攔；第 25 題車主想省錢，AI 主動推最貴的長效款，被攔下（檢查是對的）。</li>
          <li>11/9 補否定誤攔：補上第 5 題的誤攔（「不用一定要換」是否定），重跑 3 次全過。</li>
          <li>11/9 未見過題目修正：部署後在正式站重問 U13「我今天只換煞車和電瓶，合計多少」，AI 照車主的話說「你今天只換煞車和電瓶」，被「定期追蹤卻建議今天換」的規則誤攔。改成車主自己說今天要換的項目不套這條；車主只是在問、或 AI 順便推別的項目，照樣攔。重跑 3 次全過。</li>
          <li>11/9 第二輪修正：依第二輪未見過題目修正（症狀不判斷原因、離題直接拒絕、車主想換可延後項目時說今天也可以換、款式價格寫出每條和條數）。重跑 3 次 82/87：第 11 題冷氣 3 次被誤攔、第 25 題 1 次被誤攔、第 31 題 1 次沒講 2.5 mm。</li>
          <li>11/9 第二輪誤攔修正：修好第 11、25 題的誤攔，重跑 3 次 86/87：第 25 題 AI 說「不行下個月再換」又被誤攔。</li>
          <li>11/9 修改版（未採用）：補「不行」也是否定，重跑 3 次 85/87：第 10 題 2 次多說了「價格是固定標準」。之後決定不採用依第二輪修改的提示詞。</li>
          <li>11/9 決賽版：提示詞換回第二輪真人判讀那一版（commit 29f45b4），答案檢查保留誤攔修正和症狀檢查。重跑 3 次全過。之後凍結，決賽前不再修改；第二輪找到的問題列入下一輪，修完用新題目和人工判讀驗證才上線。</li>
          <li>11/10 上線版（#38 修正前）：症狀開場、口語化、高風險項目由程式組句、檢查保證字眼與成數、危險症狀提醒。重跑 3 次全過。</li>
          <li>11/10 #38 症狀開場講當天數據：車主說的部位在卡片上（「煞車有怪聲」）時，照卡片講那一項今天的數值和結論。第 15、24、29 題被誤攔（條件句「太髒才需要換」、「沒有安不安全的資料」、「少跑一趟」），修正後重跑。</li>
          <li>11/10 #38 誤攔與心情句修正：第 3 次第 24 題 AI 說「沒有基本款安不安全的資料」是對的，被驗收字詞誤判（「安不安全」是正反問）。只修驗收字詞，安全類其餘字詞不放寬，重跑 3 次全過（上線版）。</li>
          <li>10/30 改提示詞前：第 5 題漏講「3 個月後回廠提醒」，提示詞補上回廠提醒月數。</li>
        </ul>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-semibold">單次執行（每次 {questionCount} 題＝{aiPerRun} 題經過 AI＋{questionCount - aiPerRun} 題系統測試）</th>
              <th className="py-2 pr-3 font-semibold">題目</th>
              <th className="py-2 font-semibold">摘要</th>
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
                  <td className="py-2">
                    {r.summaries.filter((s) => s.pass).length} / {r.summaries.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Fold>

      <h2 className="mt-10 text-lg font-bold">限制</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>只測了展示用的兩台車和 {questionCount} 題（{aiPerRun} 題經過 AI、{questionCount - aiPerRun} 題系統測試），不代表所有問法；正式導入前要用真實車主提問擴充題庫。</li>
        <li>模型 gemini-3.5-flash-lite（付費版，和正式站相同）。所有車輛資料都是展示用假資料。</li>
      </ul>

      <Link href="/card/wang" className="mt-8 flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2 underline">
        <Icon name="chevron" className="size-4 rotate-90" />
        回到王先生的維修決策卡
      </Link>
    </main>
  );
}
