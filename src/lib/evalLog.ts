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
      const [sources, escalate, check] = line.slice(5).split("｜");
      current.sources = sources;
      current.escalate = escalate === "專員：true";
      current.check = (check ?? "").replace("答案檢查：", "");
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
