import { describe, expect, it } from "vitest";
import { ANGRY_ANSWER, CRISIS_ANSWER, SYMPTOM_ANSWER, type AskResult } from "./ask";
import { answerIntake, currentQuestion, INTAKE_INTRO, intakeFlow, intakeSummary, pickSet, recap, safetyNote, SKIP, startIntake, type Intake } from "./intake";

const reply = (answer: string, router?: AskResult["trace"]["router"], extra: Partial<AskResult["trace"]> = {}) => ({
  answer,
  trace: { mentionedItems: [], data: [], aiSources: [], ...(router ? { router } : {}), ...extra },
});
const OUTSIDE = { category: "卡片外的車子問題", topic: "冷氣", used: true };

describe("pickSet：依問題文字選題組", () => {
  it.each([
    ["我冷氣不冷", "ac"],
    ["空調吹起來怪怪的", "ac"],
    ["開車時有異音", "noise"],
    ["底盤有怪聲", "noise"],
    ["引擎聲音很大", "noise"],
    ["轉彎有異響", "noise"],
    ["儀表板亮了一個燈", "light"],
    ["警示燈亮了", "light"],
    ["故障燈一直閃", "light"],
    // 煞車警示燈是安全燈（Codex 審查 #37）。
    ["手煞車燈亮了", "light"],
    ["煞車燈一直亮", "light"],
    ["車子沒冷氣了", "ac"],
  ])("「%s」選 %s", (q, id) => {
    expect(pickSet(q).id).toBe(id);
  });

  it.each([
    "冷氣團來了，車子會不會比較難發動",
    "音響的聲音好聽嗎",
    "喇叭沒有聲音",
    "我想買燈籠掛車上",
    "大燈不亮",
    "我不是問冷氣",
    "冷氣不冷，沒有異音",
  ])("反例「%s」不選冷氣以外的錯誤題組", (q) => {
    const id = pickSet(q).id;
    // 冷氣團、燈籠、聲音好聽、大燈都不算；最後一句的異音被否定，只剩冷氣。
    expect(id).toBe(q.startsWith("冷氣不冷") ? "ac" : "general");
  });

  it("同時提到亮燈和冷氣：先問亮燈（和行車安全較有關）", () => {
    expect(pickSet("冷氣不冷，儀表還亮警示燈").id).toBe("light");
  });

  it("沒有對應的主題用通用 3 題", () => {
    const set = pickSet("方向盤會抖");
    expect(set.id).toBe("general");
    expect(set.questions.map((q) => q.text)).toEqual(["是什麼時候開始的？", "有聽到異音、聞到怪味，或儀表亮燈嗎？", "會影響開車嗎？"]);
  });
});

describe("startIntake：哪些回答下面要接症狀登記", () => {
  it("卡片外的車子問題範本（主題詞已驗證）：用主題詞", () => {
    const intake = startIntake(reply("冷氣不在今天的檢查範圍…", OUTSIDE), "我冷氣不冷");
    expect(intake?.topic).toBe("冷氣");
    expect(intake?.set.id).toBe("ac");
    expect(INTAKE_INTRO).toBe("我先幫你把狀況記下來，技師看了會比較快。");
  });

  it("症狀固定句：沒有已驗證的主題詞，複述用「你描述的狀況」", () => {
    expect(startIntake(reply(SYMPTOM_ANSWER), "方向盤會抖")?.topic).toBe("你描述的狀況");
  });

  it("分類器判症狀：主題詞沒驗證過，不用", () => {
    const intake = startIntake(reply("…", { category: "症狀", topic: "底盤", used: false, reason: "分類器判症狀" }), "底盤有怪聲");
    expect(intake?.topic).toBe("你描述的狀況");
    expect(intake?.set.id).toBe("noise");
  });

  it.each([
    ["範本沒採用（主題詞沒過）", reply("…", { category: "卡片外的車子問題", topic: "冷氣", used: false, reason: "含卡片上的檢查項目" })],
    ["卡片內", reply("…", { category: "卡片內", topic: "", used: false, reason: "分類器判卡片內" })],
    ["閒聊", reply("…", { category: "閒聊", topic: "", used: true })],
    ["情緒", reply("…", { category: "情緒", topic: "", used: true })],
    ["分類器失敗", reply("…", { used: false, reason: "逾時" })],
    ["生氣轉介", reply(ANGRY_ANSWER, { category: "症狀", topic: "", used: false, reason: "分類器判症狀" })],
    ["危機訊息", reply(CRISIS_ANSWER, undefined, { crisis: true, noAI: true })],
    ["常見問題（沒有 trace）", { answer: SYMPTOM_ANSWER }],
  ])("%s不觸發", (_, r) => {
    expect(startIntake(r, "冷氣不冷")).toBeUndefined();
  });
});

const begin = (question: string, answer = SYMPTOM_ANSWER, router?: AskResult["trace"]["router"]) => startIntake(reply(answer, router), question)!;
const run = (intake: Intake, labels: string[]) => labels.reduce(answerIntake, intake);
const SAFETY = "這可能和行車安全有關，建議先不要長途行駛，等技師確認。";

describe("answerIntake：一次一題，按［先不用］就結束", () => {
  it("冷氣：依序問三題，答完沒有下一題", () => {
    let intake = begin("我冷氣不冷", "…", OUTSIDE);
    expect(currentQuestion(intake)?.text).toBe("是完全不冷，還是開一陣子才不冷？");
    expect(currentQuestion(intake)?.options.map((o) => o.label)).toEqual(["完全不冷", "開一陣子才不冷", "時好時壞"]);
    intake = answerIntake(intake, "完全不冷");
    expect(currentQuestion(intake)?.text).toBe("出風口的風量正常嗎？");
    intake = run(intake, ["變小", "有"]);
    expect(currentQuestion(intake)).toBeUndefined();
  });

  it("按［先不用］：停在那一題，不再問", () => {
    const intake = run(begin("我冷氣不冷"), ["完全不冷", SKIP]);
    expect(intake.answers).toEqual(["完全不冷"]);
    expect(currentQuestion(intake)).toBeUndefined();
  });

  it("不在選項裡的文字不算答案（不能偽造複述內容）", () => {
    const intake = answerIntake(begin("我冷氣不冷"), "可能是冷媒不足");
    expect(intake.answers).toEqual([]);
  });

  it("答完後再按不會多記", () => {
    const intake = run(begin("警示燈亮了"), ["紅色", "還亮著", "紅色"]);
    expect(intake.answers).toEqual(["紅色", "還亮著"]);
  });
});

describe("recap：複述句", () => {
  it("冷氣：主題詞加各題答案，沒有安全提醒", () => {
    const intake = run(begin("我冷氣不冷", "…", OUTSIDE), ["完全不冷", "變小", "有"]);
    expect(recap(intake)).toBe("好，我幫你記下了：冷氣，完全不冷，出風量變小，有聞到怪味。按下面的按鈕，專員會帶著這些資訊過來。");
    expect(intakeSummary(intake)).toBe("冷氣，完全不冷，出風量變小，有聞到怪味");
  });

  it("冷氣沒有風不算行車安全", () => {
    expect(recap(run(begin("我冷氣不冷"), ["完全不冷", "沒有風", "沒有"]))).not.toContain(SAFETY);
  });

  it("症狀沒有主題詞：用「你描述的狀況」", () => {
    const intake = run(begin("方向盤會抖"), ["開一陣子後", "都沒有", "還好，只是不舒服"]);
    expect(recap(intake)).toBe(
      "好，我幫你記下了：你描述的狀況，開一陣子後才出現，沒有異音、怪味或亮燈，開起來還好，只是不舒服。按下面的按鈕，專員會帶著這些資訊過來。",
    );
  });

  it.each([
    ["警示燈亮了", ["紅色", "已經熄了"]],
    ["警示燈亮了", ["黃色／橘色", "還亮著"]],
    ["底盤有怪聲", ["底盤", "煞車", "還好"]],
    ["底盤有怪聲", ["底盤", "轉彎", "有"]],
    ["方向盤會抖", ["不確定", "都沒有", "開起來怪怪的"]],
  ])("「%s」答 %j：加行車安全提醒", (question, labels) => {
    const text = recap(run(begin(question), labels));
    expect(text).toContain(SAFETY);
    expect(text.endsWith("按下面的按鈕，專員會帶著這些資訊過來。")).toBe(true);
  });

  it.each([
    ["警示燈亮了", ["黃色／橘色", "已經熄了"]],
    ["底盤有怪聲", ["前輪附近", "轉彎", "還好"]],
  ])("「%s」答 %j：不加安全提醒", (question, labels) => {
    expect(recap(run(begin(question), labels))).not.toContain(SAFETY);
  });

  it("先不用、一題都沒答：不複述，只提按鈕", () => {
    expect(recap(run(begin("我冷氣不冷"), [SKIP]))).toBe("好，先不記了。需要的話，可以按下面的按鈕請專員來說明。");
  });

  it("所有題組、所有選項組合：複述句不判斷原因", () => {
    for (const question of ["我冷氣不冷", "底盤有怪聲", "警示燈亮了", "方向盤會抖"]) {
      const combos = (i: number, intake: Intake): Intake[] => {
        const next = currentQuestion(intake);
        return next ? next.options.flatMap((o) => combos(i + 1, answerIntake(intake, o.label))) : [intake];
      };
      for (const done of combos(0, begin(question, "…", { ...OUTSIDE, topic: "冷氣" }))) {
        expect(recap(done)).not.toMatch(/可能是|因為|應該是|大概是|造成|導致/);
      }
    }
  });
});

// Codex 審查（#37）：原問題或已選答案有安全訊號，按［先不用］或中途改問也要顯示保守提醒（專員按鈕畫面照舊顯示）。
describe("safetyNote：先不用、中途改問也要提醒", () => {
  it.each(["機油紅燈亮", "車子在冒煙", "煞車有點煞不住"])("原問題有安全訊號（%s），一題都沒答就按［先不用］：照樣提醒", (q) => {
    const intake = run(begin(q), [SKIP]);
    expect(safetyNote(intake)).toBe(SAFETY);
    expect(recap(intake)).toContain(SAFETY);
    expect(intakeFlow(intake).steps).toContain("加上行車安全提醒");
  });

  it("已選紅色、還沒答完就改問別的（登記停在中途）：safetyNote 有值", () => {
    const intake = run(begin("儀表燈亮了"), ["紅色"]);
    expect(currentQuestion(intake)).toBeDefined();
    expect(safetyNote(intake)).toBe(SAFETY);
  });

  it.each(["紅色的車冷氣不冷", "大燈不亮", "冷氣不冷"])("反例：%s 沒有安全訊號，按［先不用］不提醒", (q) => {
    const intake = run(begin(q), [SKIP]);
    expect(safetyNote(intake)).toBeUndefined();
    expect(recap(intake)).not.toContain(SAFETY);
  });
});

describe("intakeFlow：流程紀錄", () => {
  it("列出每題答案，不呼叫 AI", () => {
    const intake = run(begin("警示燈亮了"), ["紅色", "還亮著"]);
    expect(intakeFlow(intake)).toEqual({
      title: "症狀登記（程式，不呼叫 AI）",
      steps: ["題組：儀表燈／警示燈", "是什麼顏色的燈？ → 紅色", "現在還亮著嗎？ → 還亮著", "加上行車安全提醒"],
      aiCalls: 0,
    });
  });

  it("按［先不用］：記下停在哪", () => {
    expect(intakeFlow(run(begin("我冷氣不冷"), [SKIP])).steps).toEqual(["題組：冷氣／空調", "車主按［先不用］結束，沒有回答"]);
  });
});
