import type { RouterCategory } from "./ask";
import { DANGER } from "./askShared";
import type { FlowEntry } from "./flow";

// 症狀登記：卡片外的車子問題或症狀，用依主題的固定題組一題一題問，最後複述並轉專員。
// 句子全由程式組，不呼叫 AI、不做診斷。只在瀏覽器執行，所以不能 import ask.ts 的值（會把提示詞打包進前端）；型別用 import type，共用的值放 askShared.ts。

// phrase：複述時用的說法。safety：選了就加行車安全提醒。
type Option = { label: string; phrase: string; safety?: true };
type Question = { text: string; options: Option[] };
export type IntakeSet = { id: "ac" | "noise" | "light" | "general"; name: string; questions: Question[] };

const q = (text: string, options: (Option | [string, string])[]): Question => ({
  text,
  options: options.map((o) => (Array.isArray(o) ? { label: o[0], phrase: o[1] } : o)),
});

const SETS: IntakeSet[] = [
  {
    id: "light",
    name: "儀表燈／警示燈",
    questions: [
      q("是什麼顏色的燈？", [{ label: "紅色", phrase: "亮的是紅色的燈", safety: true }, ["黃色／橘色", "亮的是黃色或橘色的燈"], ["其他", "亮的是其他顏色的燈"]]),
      q("現在還亮著嗎？", [{ label: "還亮著", phrase: "現在還亮著", safety: true }, ["已經熄了", "現在已經熄了"]]),
    ],
  },
  {
    id: "noise",
    name: "異音／聲音",
    questions: [
      q("聲音大概在哪裡？", [["前輪附近", "聲音在前輪附近"], ["引擎室", "聲音在引擎室"], ["底盤", "聲音在底盤"], ["不確定", "不確定聲音在哪裡"]]),
      q("什麼時候會響？", [["轉彎", "轉彎時會響"], { label: "煞車", phrase: "煞車時會響", safety: true }, ["加速", "加速時會響"], ["一直都有", "一直都有聲音"]]),
      q("開起來有沒有怪怪的？", [{ label: "有", phrase: "開起來怪怪的", safety: true }, ["還好", "開起來還好"]]),
    ],
  },
  {
    id: "ac",
    name: "冷氣／空調",
    questions: [
      q("是完全不冷，還是開一陣子才不冷？", [["完全不冷", "完全不冷"], ["開一陣子才不冷", "開一陣子才不冷"], ["時好時壞", "時好時壞"]]),
      q("出風口的風量正常嗎？", [["正常", "出風量正常"], ["變小", "出風量變小"], ["沒有風", "出風口沒有風"]]),
      q("有聞到怪味嗎？", [["有", "有聞到怪味"], ["沒有", "沒有怪味"]]),
    ],
  },
  {
    id: "general",
    name: "通用",
    questions: [
      q("是什麼時候開始的？", [["剛發動就這樣", "剛發動就這樣"], ["開一陣子後", "開一陣子後才出現"], ["一直都這樣", "一直都這樣"], ["不確定", "不確定什麼時候開始"]]),
      q("有聽到異音、聞到怪味，或儀表亮燈嗎？", [["有異音", "有聽到異音"], ["有怪味", "有聞到怪味"], ["有亮燈", "儀表有亮燈"], ["都沒有", "沒有異音、怪味或亮燈"]]),
      q("會影響開車嗎？", [{ label: "開起來怪怪的", phrase: "開起來怪怪的", safety: true }, ["還好，只是不舒服", "開起來還好，只是不舒服"], ["不確定", "不確定會不會影響開車"]]),
    ],
  },
];

// 題組對應的關鍵字，順序就是優先順序：亮燈、異音和行車安全較有關，先問。
// 燈：大燈、車燈、霧燈這類照明，和燈籠、燈泡不算儀表燈。煞車燈、手煞車燈算（煞車警示燈是安全燈，寧可多問）。
// 聲音：音響、喇叭、導航的聲音和「聲音好聽」不算異音。冷氣團是天氣。
const MATCH: Record<Exclude<IntakeSet["id"], "general">, RegExp> = {
  light: /煞車燈|(?<![大車頭尾霧向室讀路綠檯])燈(?![籠泡管飾])/,
  noise: /異音|怪聲|異響|(?<!(?:音響|喇叭|導航|音樂|廣播)[^，。？]{0,4})聲音(?![^，。？]{0,2}(?:好聽|不錯|太小))/,
  ac: /冷氣(?!團)|空調/,
};
// 否定說法「沒有異音」「不會亮燈」「我不是問冷氣」先拿掉，避免被選成那個題組。
// 「沒冷氣」「沒有冷氣」是冷氣壞了，不算否定。
const NEGATED = /(?:沒有|沒|不會|不再)(?:任何|什麼)?(?:異音|怪聲|異響|聲音|亮燈|燈亮)|(?:不是|並不是)在?(?:問|說|講)?(?:冷氣|空調|異音|怪聲|異響|聲音|燈)/g;

export function pickSet(question: string): IntakeSet {
  const text = question.replace(NEGATED, "");
  const id = (Object.keys(MATCH) as (keyof typeof MATCH)[]).find((k) => MATCH[k].test(text)) ?? "general";
  return SETS.find((s) => s.id === id)!;
}

export const INTAKE_INTRO = "我先幫你把狀況記下來，技師看了會比較快。";
// 和 ask.ts 的 SYMPTOM_ANSWER、ANGRY_ANSWER 同字；intake.test.ts 拿 ask.ts 的值測，改了會紅。
const SYMPTOM_ANSWER = "你描述的狀況，這張卡上沒有相關的檢查資料，不能判斷原因。可以按下面的按鈕，請專員安排技師檢查。";
const ANGRY_ANSWER = "聽起來你不太滿意，我請專員來跟你當面說明。可以按下面的按鈕。";
const DESCRIBED = "你描述的狀況";

// answers：已回答的選項文字。stopped：車主按［先不用］。urgent：原問題有安全訊號。
export type Intake = { topic: string; set: IntakeSet; answers: string[]; stopped: boolean; urgent: boolean };
type Reply = { answer: string; trace?: { crisis?: boolean; router?: { category?: string; topic?: string; used: boolean } } };

const OUTSIDE_CAR: RouterCategory = "卡片外的車子問題";
const SYMPTOM_CATEGORY: RouterCategory = "症狀";
// 原問題的安全訊號：紅燈、紅色的燈和危險徵兆（冒煙、煞不住…）。「紅色的車」不算。
const SAFETY_SIGNAL = new RegExp(`紅燈|紅色的?(?:燈|警示)|燈[^，。？?]{0,4}紅|${DANGER}`);

// 觸發：卡片外的車子問題範本（範本採用代表主題詞驗證過），或症狀（固定句或分類器判症狀）。危機、生氣轉介不觸發。
// shortcut: 生氣但主回答有內容時，前端分不出來（trace 沒有生氣旗標），分類器判症狀就會觸發；要擋再在 trace 加旗標。
export function startIntake(reply: Reply, question: string): Intake | undefined {
  const { trace } = reply;
  if (!trace || trace.crisis || reply.answer === ANGRY_ANSWER) return undefined;
  const router = trace.router;
  const outside = router?.used && router.category === OUTSIDE_CAR && router.topic;
  if (!outside && reply.answer !== SYMPTOM_ANSWER && router?.category !== SYMPTOM_CATEGORY) return undefined;
  return { topic: outside || DESCRIBED, set: pickSet(question), answers: [], stopped: false, urgent: SAFETY_SIGNAL.test(question) };
}

export const SKIP = "先不用";
const SAFETY_NOTE = "這可能和行車安全有關，建議先不要長途行駛，等技師確認。";

export const currentQuestion = (intake: Intake) => (intake.stopped ? undefined : intake.set.questions[intake.answers.length]);

// 只收目前這題的選項文字，其他文字不記，複述句才不會出現選項以外的內容。
export function answerIntake(intake: Intake, label: string): Intake {
  const question = currentQuestion(intake);
  if (!question) return intake;
  if (label === SKIP) return { ...intake, stopped: true };
  return question.options.some((o) => o.label === label) ? { ...intake, answers: [...intake.answers, label] } : intake;
}

const picked = (intake: Intake) => intake.answers.map((label, i) => intake.set.questions[i].options.find((o) => o.label === label)!);
// 原問題有安全訊號，或選了安全相關選項：答完、按［先不用］、中途改問都要提醒（Codex 審查 #37）。
export const safetyNote = (intake: Intake) => (intake.urgent || picked(intake).some((o) => o.safety) ? SAFETY_NOTE : undefined);

// 給「已通知服務專員」那行：主題詞加各題答案。
export const intakeSummary = (intake: Intake) => [intake.topic, ...picked(intake).map((o) => o.phrase)].join("，");

// 複述只照抄選項的說法，不說原因。
export function recap(intake: Intake): string {
  const safety = safetyNote(intake) ?? "";
  if (!intake.answers.length) return `好，先不記了。${safety}需要的話，可以按下面的按鈕請專員來說明。`;
  return `好，我幫你記下了：${intakeSummary(intake)}。${safety}按下面的按鈕，專員會帶著這些資訊過來。`;
}

export function intakeFlow(intake: Intake): FlowEntry {
  const answered = intake.answers.map((a, i) => `${intake.set.questions[i].text} → ${a}`);
  return {
    title: "症狀登記（程式，不呼叫 AI）",
    steps: [
      `題組：${intake.set.name}`,
      ...answered,
      ...(intake.stopped ? [answered.length ? "車主按［先不用］結束" : "車主按［先不用］結束，沒有回答"] : []),
      ...(safetyNote(intake) ? ["加上行車安全提醒"] : []),
    ],
    aiCalls: 0,
  };
}
