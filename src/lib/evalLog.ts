// 解析 docs/eval/raw/ 的真實 AI 實測紀錄（npm run eval:21 的輸出），給 /eval 頁顯示。

export type QuestionResult = {
  n: number;
  pass: boolean;
  question: string;
  expected: string;
  answer: string;
  sources: string;
  escalate: boolean;
  check: string;
  problems: string[];
  // AI 回應秒數；11/5 之前的紀錄沒有這欄。
  seconds?: number;
  // 被答案檢查攔下時，AI 原本寫的回答（answer 是車主實際看到的替換回答）。
  aiAnswer?: string;
};

// 第 20、21 題測系統行為，不經過 AI，紀錄裡只有 ✓／× 那一行。
export type SystemResult = { n: number; pass: boolean; title: string };

export type SummaryResult = { owner: string; n: number; pass: boolean; chars: number; text: string };

export type EvalRun = {
  questions: QuestionResult[];
  system: SystemResult[];
  summaries: SummaryResult[];
  passed: number;
  total: number;
};

const QUESTION = /^#(\d+) (通過|失敗)｜(.+)$/;
const SYSTEM = /^ ([✓×]) scripts\/eval21\.eval\.ts > .+ > #(\d+) (.+?) \d+ms$/;
const SUMMARY = /^(\S+) #(\d+)｜(通過|失敗)｜(\d+) 字$/;
const TOTAL = /^\s+Tests\s+(?:(\d+) failed \| )?(\d+) passed \((\d+)\)$/;

// 紀錄裡的原因是測試用的正規表示式（例如「應該出現 /3\s*個月|三個月/」），改寫成一般人看得懂的話。
const plainRegex = (re: string) =>
  re
    .replace(/\(\?<?[!=][^)]*\)/g, "") // 前後文條件
    .replace(/\\s\*/g, " ")
    .replace(/\\d/g, "數字")
    .replace(/\\(.)/g, "$1")
    .replace(/\(\?:[^()]*\)\?/g, "") // 可有可無的整組
    .replace(/[^()|\]]\?/g, "") // 可有可無的單字
    .replace(/\[(.)[^\]]*\]/g, "$1")
    .replace(/\((?:\?:)?([^()|]*)[^()]*\)/g, "$1")
    .replace(/\{\d+,?\d*\}|\.\{0,\d+\}/g, "…")
    .split("|")
    .join("」或「");

export function readable(problem: string): string {
  let m: RegExpMatchArray | null;
  if ((m = problem.match(/^應該出現 \/(.+)\/$/))) return `回答沒有提到「${plainRegex(m[1])}」`;
  if ((m = problem.match(/^不該出現 \/(.+)\/$/))) return `回答出現了不該說的話（「${plainRegex(m[1])}」）`;
  if ((m = problem.match(/^被攔下：(.+)$/))) return `答案檢查攔下：${m[1]}`;
  if ((m = problem.match(/^缺少來源 (.+)$/))) return `沒有附上來源 ${m[1]}`;
  if (problem === "應該出現「請專員來說明」") return "應該出現「請專員來說明」按鈕，但沒有";
  return problem;
}

export type Verdict = { tag: "檢查擋對了" | "誤攔" | "驗收太嚴" | "AI 說錯" | "待人工判讀"; why: string };

// 講保養週期（「每 48 個月才需要更換」）是說明，不是推銷；同一段又叫車主現在換就不算。
const SCHEDULE = /每\s*[\d,.一二兩三四五六七八九十百千萬]+\s*(?:個月|年|萬?\s*(?:公里|km))|依[^，,。]{0,6}(?:週期|周期|手冊)/;
const NOW = /(?:今天|現在|馬上|立刻)[^，,。]{0,4}換/;
const REFUSES_DEFER = /不能延後|無法延後|不可以?延後|不能等|無法[^，,。]{0,8}再換/;
// 這些攔下理由來自 AI 回傳的欄位（建議的款式、列出的結論），是確定的事實，不是猜字面。
const STRUCTURAL = /預算有限，卻建議最貴|卻沒有列出它的結論|的結論應為|不在清單上|回答卻沒有提到/;

// 沒過的題目分類。只用紀錄裡看得到的內容判斷；規則判斷不了就標「待人工判讀」。
// passesNow：用目前的驗收字詞重新檢查同一個回答會不會通過（驗收放寬後，舊的失敗就是驗收太嚴）。
export function classify(q: QuestionResult, passesNow: boolean): Verdict {
  const blocked = q.problems.find((p) => p.startsWith("被攔下："))?.slice(4);
  if (blocked !== undefined) {
    const ai = q.aiAnswer ?? "";
    if (/正常，回答卻建議更換/.test(blocked) && SCHEDULE.test(ai) && !NOW.test(ai))
      return { tag: "誤攔", why: "回答提到保養週期，被誤判成推銷" };
    if (/必須更換，回答卻說可以延後/.test(blocked) && REFUSES_DEFER.test(ai))
      return { tag: "誤攔", why: "回答其實說了不能延後，被誤判成說可以延後" };
    if (STRUCTURAL.test(blocked)) return { tag: "檢查擋對了", why: blocked };
    return { tag: "待人工判讀", why: `答案檢查攔下：${blocked}` };
  }
  const why = q.problems.map(readable).join("；");
  if (passesNow) return { tag: "驗收太嚴", why: `意思對，只是寫法和驗收字詞不同：${why}` };
  // 說了不該說的話、漏附來源或沒轉專員，看紀錄就能確定。漏了必須字詞可能只是換了說法，要人看。
  if (q.problems.length && q.problems.every((p) => /^(?:不該出現|缺少來源|應該出現「請專員)/.test(p))) return { tag: "AI 說錯", why };
  return { tag: "待人工判讀", why };
}

// JSON 解析失敗或沒有 answer 時保留原文，不丟掉也不崩潰。
function aiAnswerOf(text: string): string {
  try {
    const answer = JSON.parse(text)?.answer;
    if (typeof answer === "string") return answer;
  } catch {}
  return text;
}

export function parseEvalLog(log: string): EvalRun {
  const lines = log.replace(/\r\n?/g, "\n").split("\n");
  const run: EvalRun = { questions: [], system: [], summaries: [], passed: 0, total: 0 };
  let current: QuestionResult | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpMatchArray | null;

    if ((m = line.match(QUESTION))) {
      current = {
        n: Number(m[1]), pass: m[2] === "通過", question: m[3],
        expected: "", answer: "", sources: "", escalate: false, check: "", problems: [],
      };
      run.questions.push(current);
    } else if (current && line.startsWith("  預期：")) {
      current.expected = line.slice(5).replace(/\*\*/g, "");
    } else if (current && line.startsWith("  回答：")) {
      current.answer = line.slice(5);
    } else if (current && line.startsWith("  來源：")) {
      const [sources, escalate, check, latency] = line.slice(5).split("｜");
      current.sources = sources;
      current.escalate = escalate === "專員：true";
      current.check = (check ?? "").replace("答案檢查：", "");
      const sec = latency?.match(/^AI 回應：([\d.]+) 秒$/);
      if (sec) current.seconds = Number(sec[1]);
    } else if (current && line.startsWith("  AI 原回答：")) {
      // 被攔下時紀錄會接 AI 原本的 JSON（多行），讀到「問題：」、空行或下一題為止。
      const body = [line.slice("  AI 原回答：".length)];
      while (i + 1 < lines.length && lines[i + 1].trim() !== "" && !lines[i + 1].startsWith("  問題：") && !QUESTION.test(lines[i + 1]))
        body.push(lines[++i]);
      current.aiAnswer = aiAnswerOf(body.join("\n"));
    } else if (current && line.startsWith("  問題：")) {
      current.problems.push(line.slice(5));
    } else if ((m = line.match(SYSTEM))) {
      const n = Number(m[2]);
      // 有 stdout 的題目已經從 #N 那行記下來；這裡只收沒有 stdout 的系統題。
      if (!run.questions.some((q) => q.n === n)) {
        run.system.push({ n, pass: m[1] === "✓", title: m[3] });
      }
    } else if ((m = line.match(SUMMARY))) {
      current = null;
      const text: string[] = [];
      while (i + 1 < lines.length && lines[i + 1].trim() !== "") text.push(lines[++i]);
      run.summaries.push({
        owner: m[1], n: Number(m[2]), pass: m[3] === "通過", chars: Number(m[4]), text: text.join("\n"),
      });
    } else if ((m = line.match(TOTAL))) {
      run.passed = Number(m[2]);
      run.total = Number(m[3]);
    }
  }
  return run;
}
