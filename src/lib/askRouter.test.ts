import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANGRY_ANSWER, ask as realAsk, CRISIS_ANSWER, MOOD_CAR_ANSWER, RESPONSE_SCHEMA, routerEnabled } from "./ask";

// 這支測分類器本身，所以明確打開分類器，不看執行環境的 ROUTER_ENABLED。
// 也關掉程式組句和症狀開場（#37）：「冷氣不冷」「冒煙」現在走症狀開場（見 askSymptom.test.ts），這裡測主回答加範本那條路。
const ask: typeof realAsk = (v, q, ai) => realAsk(v, q, ai, { router: true, scripted: false });
import { askFlow } from "./flow";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;

const NO_DATA = { answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] };
const OFF_TOPIC = { answer: "我只能回答這張卡上的維修問題。", sources: [], escalate: false, itemConclusions: [] };
const BATTERY = {
  answer: "電瓶目前 60%，可延後，3 個月後會提醒你回廠。",
  sources: ["item:battery"],
  escalate: false,
  itemConclusions: [{ id: "item:battery", conclusion: "可延後" }],
};

// 假 AI：主回答的提示詞開頭固定（v37），其他提示詞當成分類器。
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";
function fakeAI(main: object, router: object | string | Error | Promise<string>) {
  const calls: { system: string; user: string }[] = [];
  const call = async (system: string, user: string) => {
    calls.push({ system, user });
    if (system.startsWith(MAIN_HEAD)) return JSON.stringify(main);
    if (router instanceof Error) throw router;
    if (router instanceof Promise) return router;
    return typeof router === "string" ? router : JSON.stringify(router);
  };
  return Object.assign(call, { calls });
}
const route = (category: string, topic: string) => ({ category, topic });

// 範本：程式組句。期望值照範本手寫，不從程式算。
const AC_REPLY = "冷氣不在今天的檢查範圍，卡片上沒有它的資料，我不想亂猜。可以按下面的按鈕，請專員來幫你確認。";
const WEATHER_REPLY = "這題我回答不了喔。我是這張維修決策卡的 AI 助理，可以回答這台車今天的檢查結果，例如「電瓶還能用多久？」。";
const CHAT_REPLY = WEATHER_REPLY;

// #37 好用度：使用者同意改主回答口吻（先回答問的事、只講相關項目、2–3 句，加規則 11、12），所以更新 SYSTEM_PROMPT 的雜湊。真 AI 實測後再加規則 13（不用「放心」「不用擔心」這類保證字眼），雜湊又更新一次。再加規則 14（數字照卡片原樣，不改寫成幾成），再更新一次。
describe("主回答提示詞和 schema 鎖定（v37，cbfe4da；#37 口語化）", () => {
  it("SYSTEM_PROMPT 和 RESPONSE_SCHEMA 的 sha256 不變", async () => {
    const ai = fakeAI(NO_DATA, route("閒聊", ""));
    await ask(wang, "今天天氣如何", ai);
    const main = ai.calls.find((c) => c.system.startsWith(MAIN_HEAD))!;
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    expect(sha(main.system)).toBe("7d088dd8f629d92338f5fb0a97a3238ccdfa214ad910d26a6db9275db56e3c74");
    expect(sha(JSON.stringify(RESPONSE_SCHEMA))).toBe("681e5e9818083c091e49fa2f35edde3ab484b8858125928edf750eba388c1668");
  });
});

describe("分類器和主回答平行呼叫", () => {
  // #37：採用範本時再呼叫一次 AI 短指示（假 AI 回分類器格式，所以用範本當備用句），共 3 次。
  it("主回答一次、分類器一次（採用範本時再加 AI 短指示一次），分類器只拿到項目名稱", async () => {
    const ai = fakeAI(NO_DATA, route("卡片外的車子問題", "冷氣"));
    await ask(wang, "我冷氣不冷", ai);
    expect(ai.calls).toHaveLength(3);
    const router = ai.calls.find((c) => !c.system.startsWith(MAIN_HEAD))!;
    expect(router.user).toMatch(/我冷氣不冷/);
    expect(router.user).not.toMatch(/\d/);
  });

  it("兩個呼叫同時送出，不等主回答回來", async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ai = async (system: string) => {
      started++;
      if (started === 2) release();
      await gate;
      return JSON.stringify(system.startsWith(MAIN_HEAD) ? NO_DATA : route("閒聊", ""));
    };
    await ask(wang, "今天天氣如何", ai);
    expect(started).toBe(2);
  });
});

describe("範本制：分類器只回類別和主題詞，句子由程式組", () => {
  it("卡片外的車子問題 + 主回答沒有資料 → 卡片外範本，轉介專員，範本提到按鈕", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", "冷氣")));
    expect(r.answer).toBe(AC_REPLY);
    expect(r.escalate).toBe(true);
    expect(r.sources).toEqual([]);
    expect(r.checkResult).toBe("通過");
    expect(r.trace.router).toEqual({ category: "卡片外的車子問題", topic: "冷氣", used: true, ai: false, fallback: "AI 失敗或回應無法解析" });
  });

  it("閒聊 + 主回答離題拒絕 → 閒聊範本（不放主題詞），不轉介專員", async () => {
    const r = await ask(wang, "今天天氣如何", fakeAI(OFF_TOPIC, route("閒聊", "天氣")));
    expect(r.answer).toBe(WEATHER_REPLY);
    expect(r.escalate).toBe(false);
  });

  it("閒聊、主題詞空白 → 閒聊範本（不放主題詞）", async () => {
    const r = await ask(wang, "我今天好累喔", fakeAI(OFF_TOPIC, route("閒聊", "")));
    expect(r.answer).toBe(CHAT_REPLY);
    expect(r.escalate).toBe(false);
  });

  it("分類器多回了自由文字（「放心繼續開」）→ 不採用那段文字，只用範本", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, { category: "卡片外的車子問題", topic: "冷氣", reply: "冷氣補冷媒就好，放心繼續開" }));
    expect(r.answer).toBe(AC_REPLY);
    expect(r.answer).not.toMatch(/放心|冷媒/);
  });

  it("反例：卡片內的問題被分類器判卡片外 → 仍用主回答（v37 固定句）", async () => {
    const r = await ask(wang, "電瓶的保固是多久？", fakeAI(NO_DATA, route("卡片外的車子問題", "保固")));
    expect(r.answer).not.toMatch(/保固不在今天的檢查範圍/);
    expect(r.trace.router).toEqual({ category: "卡片外的車子問題", topic: "保固", used: false, reason: "問題提到卡片上的檢查項目" });
  });

  it("反例：主回答有實際內容 → 不換", async () => {
    const r = await ask(wang, "我冷氣不冷，電瓶呢", fakeAI(BATTERY, route("卡片外的車子問題", "冷氣")));
    expect(r.answer).toBe(BATTERY.answer);
  });

  it("反例：主回答有實際內容、問題沒提到項目 → 不換，理由是主回答有實際內容", async () => {
    const r = await ask(wang, "今天要付多少", fakeAI(BATTERY, route("閒聊", "")));
    expect(r.answer).toBe(BATTERY.answer);
    expect(r.trace.router).toEqual({ category: "閒聊", topic: "", used: false, reason: "主回答有實際內容" });
  });

  it("反例：分類器判症狀、越權要求、卡片內 → 不換", async () => {
    for (const category of ["症狀", "越權要求", "卡片內"]) {
      const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route(category, "冷氣")));
      expect(r.answer).not.toBe(AC_REPLY);
      expect(r.trace.router?.used).toBe(false);
    }
  });

  // #37 好用度 G35：主回答被攔下時，車主看不到它，改用卡片外範本（或 AI 短回應）；攔下理由留著。
  it("主回答被攔下 → 換成卡片外範本，checkResult 仍是攔下、理由寫改用了什麼", async () => {
    const bad = { answer: "這張卡上沒有這項資料，費用 NT$99,999", sources: [], escalate: false, itemConclusions: [] };
    const r = await ask(wang, "我冷氣不冷", fakeAI(bad, route("卡片外的車子問題", "冷氣")));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(AC_REPLY);
    expect(r.blockedReason).toMatch(/→改用範本$/);
  });

  it("反例：問題描述症狀 → 不換，用 v37 症狀固定句", async () => {
    const r = await ask(wang, "開車時有怪聲", fakeAI(NO_DATA, route("卡片外的車子問題", "怪聲")));
    expect(r.answer).toMatch(/不能判斷原因/);
    expect(r.trace.router?.used).toBe(false);
  });

  it("反例：問題要轉介專員（議價）→ 不換", async () => {
    const r = await ask(wang, "冷氣可以算便宜一點嗎", fakeAI(NO_DATA, route("卡片外的車子問題", "冷氣")));
    expect(r.trace.router?.reason).toBe("問題要轉介專員");
  });
});

describe("主題詞規則：不合格就不換，用主回答", () => {
  it.each([
    ["不在問題裡", "我冷氣不冷", "暖氣", "不在問題裡"],
    ["近似字、不是逐字（冷氣機）", "我冷氣不冷", "冷氣機", "不在問題裡"],
    ["太長（9 個字）", "車上的導航地圖資料更新軟體怎麼用", "導航地圖資料更新軟", "太長"],
    ["有阿拉伯數字", "3號車道在哪", "3號車道", "有數字"],
    ["有全形數字", "３號車道在哪", "３號車道", "有數字"],
    ["有國字數字", "三點的車子好了嗎", "三點", "有數字"],
    ["有標點", "我的A/C不冷", "A/C", "有標點或符號"],
    ["有空白", "我的 car play 不能用", "car play", "有標點或符號"],
    ["含卡片上的檢查項目（遙控器電池裡的電池）", "遙控器電池沒電了怎麼辦", "電池", "含卡片上的檢查項目"],
    ["含安全保證字眼", "冷氣壞了可以放心開嗎", "放心開", "含保證或原因字眼"],
    ["含原因字眼", "冷氣不冷是因為冷媒嗎", "因為冷媒", "含保證或原因字眼"],
  ])("反例：主題詞%s → 不換", async (_, question, topic, why) => {
    const r = await ask(wang, question, fakeAI(NO_DATA, route("卡片外的車子問題", topic)));
    expect(r.trace.router?.used).toBe(false);
    expect(r.trace.router?.reason).toBe(`主題詞不合格：${why}`);
    expect(r.answer).not.toContain("不在今天的檢查範圍");
    expect(r.escalate).toBe(true);
  });

  it("反例：卡片外的車子問題，主題詞空白 → 不換", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", "")));
    expect(r.trace.router?.reason).toBe("主題詞不合格：空白");
  });

  it.each([
    ["剛好 8 個字", "車上的導航地圖資料更新怎麼用", "導航地圖資料更新"],
    ["英文字母", "我的AC不冷", "AC"],
    ["安全帶不是安全保證", "安全帶卡住拉不出來", "安全帶"],
  ])("正例：主題詞%s → 採用範本", async (_, question, topic) => {
    const r = await ask(wang, question, fakeAI(NO_DATA, route("卡片外的車子問題", topic)));
    expect(r.trace.router?.used).toBe(true);
    expect(r.answer).toBe(`${topic}不在今天的檢查範圍，卡片上沒有它的資料，我不想亂猜。可以按下面的按鈕，請專員來幫你確認。`);
  });

  it("主題詞前後的空白先去掉再比對", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", " 冷氣 ")));
    expect(r.answer).toBe(AC_REPLY);
  });
});

describe("分類器失敗：不換範本，用主回答", () => {
  it.each([
    ["呼叫丟錯", new Error("Gemini 503")],
    ["不是 JSON", "not json"],
    ["未知範本代號（類別不在清單）", JSON.stringify({ category: "其他", topic: "冷氣" })],
    ["缺少 topic", JSON.stringify({ category: "閒聊" })],
  ])("%s → v37 的回答，整題不失敗", async (_, router) => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, router));
    expect(r.answer).toMatch(/冷氣不在今天的檢查項目/);
    expect(r.trace.router).toEqual({ used: false, reason: "分類器失敗或回應無法解析" });
  });

  it("主回答失敗 → 照 v37 丟錯（分類器成功也一樣）", async () => {
    const ai = async (system: string) => (system.startsWith(MAIN_HEAD) ? "not json" : JSON.stringify(route("閒聊", "")));
    await expect(ask(wang, "今天天氣如何", ai)).rejects.toThrow();
  });
});

describe("分類器時間上限（4 秒）", () => {
  afterEach(() => vi.useRealTimers());
  const never = () => new Promise<string>(() => {});

  it("分類器一直沒回 → 4 秒後用主回答，理由是逾時", async () => {
    vi.useFakeTimers();
    let done = false;
    const p = ask(wang, "我冷氣不冷", fakeAI(NO_DATA, never())).finally(() => (done = true));
    await vi.advanceTimersByTimeAsync(3_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(r.answer).toMatch(/冷氣不在今天的檢查項目/);
    expect(r.trace.router).toEqual({ used: false, reason: "分類器逾時" });
  });

  it("主回答失敗時不等分類器，馬上丟錯", async () => {
    vi.useFakeTimers();
    const ai = async (system: string) => (system.startsWith(MAIN_HEAD) ? "not json" : never());
    await expect(ask(wang, "今天天氣如何", ai)).rejects.toThrow();
  });

  // 只有分類器的呼叫拿到 signal：主回答照 v37，不會被取消。
  const signalOf = (calls: { system: string; signal?: AbortSignal }[]) => calls.find((c) => !c.system.startsWith(MAIN_HEAD))!.signal!;

  it("分類器逾時 → 取消分類器的呼叫", async () => {
    vi.useFakeTimers();
    const calls: { system: string; signal?: AbortSignal }[] = [];
    const ai = async (system: string, _user: string, signal?: AbortSignal) => {
      calls.push({ system, signal });
      return system.startsWith(MAIN_HEAD) ? JSON.stringify(NO_DATA) : never();
    };
    const p = ask(wang, "我冷氣不冷", ai);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(signalOf(calls).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(signalOf(calls).aborted).toBe(true);
    expect(calls.find((c) => c.system.startsWith(MAIN_HEAD))!.signal).toBeUndefined();
  });

  it("主回答失敗 → 取消分類器的呼叫", async () => {
    const calls: { system: string; signal?: AbortSignal }[] = [];
    const ai = async (system: string, _user: string, signal?: AbortSignal) => {
      calls.push({ system, signal });
      return system.startsWith(MAIN_HEAD) ? "not json" : never();
    };
    await expect(ask(wang, "今天天氣如何", ai)).rejects.toThrow();
    expect(signalOf(calls).aborted).toBe(true);
  });

  it("反例：分類器準時回來 → 不取消", async () => {
    const calls: { system: string; signal?: AbortSignal }[] = [];
    const ai = async (system: string, _user: string, signal?: AbortSignal) => {
      calls.push({ system, signal });
      return JSON.stringify(system.startsWith(MAIN_HEAD) ? NO_DATA : route("卡片外的車子問題", "冷氣"));
    };
    await ask(wang, "我冷氣不冷", ai);
    expect(signalOf(calls).aborted).toBe(false);
  });
});

describe("流程紀錄", () => {
  it("採用範本：寫分類器類別、採用範本、答案檢查標明是主回答的結果", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", "冷氣")));
    const f = askFlow("我冷氣不冷", 200, r, {});
    expect(f.aiCalls).toBe(3);
    expect(f.steps).toContain("分類器：卡片外的車子問題");
    expect(f.steps).toContain("範本：採用（程式組句，不是 AI 自由文字）｜AI 短指示回應沒用上：AI 失敗或回應無法解析");
    expect(f.steps).toContain("答案檢查（主回答）：通過");
    expect(f.steps).not.toContain("答案檢查：通過");
  });

  it("沒採用時寫原因，答案檢查照舊", async () => {
    const r = await ask(wang, "今天要付多少", fakeAI(BATTERY, route("閒聊", "")));
    const f = askFlow("今天要付多少", 200, r, {});
    expect(f.steps).toContain("範本：沒採用（主回答有實際內容）");
    expect(f.steps).toContain("答案檢查：通過");
    expect(f.steps.some((s) => s.includes("採用（程式組句"))).toBe(false);
  });

  it("危機訊息：寫明是固定的求助句，不呼叫 AI；反例：打招呼照舊", async () => {
    const crisis = askFlow("我不想活了", 200, await ask(wang, "我不想活了", fakeAI(OFF_TOPIC, route("情緒", ""))), {});
    expect(crisis.steps[0]).toBe("危機訊息：回固定的求助句（1925 安心專線），不呼叫 AI");
    expect(crisis.aiCalls).toBe(0);
    const hi = askFlow("你好", 200, await ask(wang, "你好", fakeAI(OFF_TOPIC, route("閒聊", ""))), {});
    expect(hi.steps[0]).toMatch(/^打招呼/);
  });

  it("分類器失敗也寫出來", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, "x"));
    expect(askFlow("我冷氣不冷", 200, r, {}).steps).toContain("分類器：失敗");
  });

  it("連線失敗（502）時 AI 呼叫算 2 次", () => {
    expect(askFlow("q", 502, { error: "x" }, {}).aiCalls).toBe(2);
  });
});

describe("分類器開關", () => {
  it.each(["0", "false", "off", "FALSE", "Off", " off "])("ROUTER_ENABLED=%j → 關閉", (value) => {
    expect(routerEnabled(value)).toBe(false);
  });
  it.each([undefined, "", "1", "true", "on", "offline", "no"])("反例：ROUTER_ENABLED=%j → 打開", (value) => {
    expect(routerEnabled(value)).toBe(true);
  });

  it("關閉時（router: false）不呼叫分類器，行為同 v37", async () => {
    const prompts: string[] = [];
    await realAsk(findVehicle("wang")!, "我冷氣不冷", async (s) => {
      prompts.push(s);
      return JSON.stringify({ answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] });
    }, { router: false });
    expect(prompts).toHaveLength(1);
  });
  it("關閉時 trace 沒有分類器資訊，流程面板寫 AI 呼叫 1 次", async () => {
    const r = await realAsk(findVehicle("wang")!, "我冷氣不冷", async () =>
      JSON.stringify({ answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] }),
    { router: false });
    expect(r.trace.router).toBeUndefined();
    expect(askFlow("我冷氣不冷", 200, r, {}).aiCalls).toBe(1);
  });
});

describe("危險徵兆：一律不換範本，轉介專員（#36 審查）", () => {
  it("實測題：「水溫過高快冒煙了我很害怕」分類器判情緒 → 不換同理句，轉介專員", async () => {
    const r = await ask(wang, "水溫過高快冒煙了我很害怕", fakeAI(OFF_TOPIC, route("情緒", "")));
    expect(r.answer).not.toMatch(/不太好受/);
    expect(r.escalate).toBe(true);
    expect(r.trace.router).toEqual({ category: "情緒", topic: "", used: false, reason: "問題描述症狀" });
  });

  it.each(["引擎冒煙了", "排氣管冒白煙", "引擎過熱", "水溫偏高", "水溫好像會爬", "車頭起火", "有燒焦味", "煞不住", "煞車沒力", "方向盤很重", "警示燈亮了"])(
    "%s → 不換範本，轉介專員",
    async (q) => {
      for (const category of ["閒聊", "情緒", "卡片外的車子問題"]) {
        const r = await ask(wang, q, fakeAI(OFF_TOPIC, route(category, "")));
        expect(r.trace.router?.used).toBe(false);
        expect(r.escalate).toBe(true);
      }
    },
  );

  it.each([
    ["天氣過熱不是車子過熱", "今天天氣過熱", "閒聊", ""],
    ["只問水溫正常值", "水溫正常是多少", "卡片外的車子問題", "水溫"],
    ["方向盤重新包皮不是方向盤很重", "方向盤重新包皮要多久", "卡片外的車子問題", "方向盤"],
  ])("反例：%s → 照常用範本", async (_, q, category, topic) => {
    const r = await ask(wang, q, fakeAI(category === "閒聊" ? OFF_TOPIC : NO_DATA, route(category, topic)));
    expect(r.trace.router?.used).toBe(true);
  });

  // Codex 再審（#36）：「沒有冒煙才怪」是反話。範本路徑不看否定：有危險徵兆字詞就不換範本、轉介專員，寧可多轉介。
  it.each([
    ["沒有冒煙才怪，我很怕", "情緒", ""],
    ["引擎沒有冒煙，冷氣不冷", "卡片外的車子問題", "冷氣"],
  ])("決定：%s → 有危險徵兆字詞，不換範本、轉介專員", async (q, category, topic) => {
    const r = await ask(wang, q, fakeAI(category === "情緒" ? OFF_TOPIC : NO_DATA, route(category, topic)));
    expect(r.trace.router).toEqual({ category, topic, used: false, reason: "問題有危險徵兆字詞" });
    expect(r.answer).not.toMatch(/不太好受/);
    expect(r.escalate).toBe(true);
  });

  it("反例：分類器關閉時，主回答路徑照舊看否定（「沒有冒煙」不算症狀）", async () => {
    const r = await realAsk(wang, "引擎沒有冒煙，冷氣不冷", async () => JSON.stringify(NO_DATA), { router: false, scripted: false });
    expect(r.answer).not.toMatch(/不能判斷原因/);
    expect(r.answer).toMatch(/不在今天的檢查項目/);
  });

  it("決定：「冒煙的燒肉店」也算危險徵兆。客休室裡講冒煙多半是車子，多叫一次專員比漏掉安全問題好", async () => {
    const r = await ask(wang, "附近有冒煙的燒肉店嗎", fakeAI(OFF_TOPIC, route("閒聊", "")));
    expect(r.trace.router?.used).toBe(false);
    expect(r.escalate).toBe(true);
  });

  it("主回答本來就轉介專員 → 閒聊、情緒範本不換，轉介不能被拿掉", async () => {
    for (const category of ["閒聊", "情緒"]) {
      const r = await ask(wang, "我今天好累喔", fakeAI({ ...OFF_TOPIC, escalate: true }, route(category, "")));
      expect(r.trace.router).toEqual({ category, topic: "", used: false, reason: "主回答要轉介專員" });
      expect(r.escalate).toBe(true);
    }
  });

  it("反例：主回答沒轉介 → 閒聊照常換範本、不轉介", async () => {
    const r = await ask(wang, "我今天好累喔", fakeAI(OFF_TOPIC, route("閒聊", "")));
    expect(r.trace.router?.used).toBe(true);
    expect(r.escalate).toBe(false);
  });
});

describe("危機訊息：固定的求助句（#36 審查）", () => {
  it.each(["我不想活了", "想自殺", "活著好累不想醒來", "我真的好想死", "想輕生"])("%s → 1925 安心專線、請現場人員、轉介專員，不呼叫 AI", async (q) => {
    for (const category of ["情緒", "閒聊", "卡片內"]) {
      const ai = fakeAI(OFF_TOPIC, route(category, ""));
      const r = await ask(wang, q, ai);
      expect(r.answer).toMatch(/1925/);
      expect(r.answer).toMatch(/24 小時/);
      expect(r.answer).toMatch(/現場人員/);
      expect(r.escalate).toBe(true);
      expect(ai.calls).toHaveLength(0);
    }
  });

  it.each(["今天累死了", "外面熱死了", "笑死", "氣死我了", "我很怕死"])("反例：%s 不是危機訊息", async (q) => {
    const r = await ask(wang, q, fakeAI(OFF_TOPIC, route("閒聊", "")));
    expect(r.answer).not.toMatch(/1925/);
  });

  // Codex 再審（#36）：常見說法要補齊，分類器判情緒也不能只給同理句。
  it.each([
    "我現在要跳樓",
    "我已經吞了一整瓶安眠藥",
    "想去跳河",
    "我想上吊",
    "準備燒炭了",
    "我剛割腕",
    "我吞藥了",
    "想尋短",
    "我想不開",
    "想自盡",
    "真的活不下去了",
    "我想了結自己",
    "我撐不下去了",
    "我快崩潰了",
    "不想醒來",
    "我不想活了",
  ])("危機：%s → 固定求助句，不呼叫 AI", async (q) => {
    const ai = fakeAI(OFF_TOPIC, route("情緒", ""));
    const r = await ask(wang, q, ai);
    expect(r.answer).toBe(CRISIS_ANSWER);
    expect(r.escalate).toBe(true);
    expect(ai.calls).toHaveLength(0);
  });

  it.each([
    ["否定：沒有想死", "我沒有想死，只想問煞車價格"],
    ["否定：不是要自殺", "我不是要自殺，只是很累"],
    ["否定：不會輕生", "放心我不會輕生"],
    ["跳樓價是促銷", "有跳樓價的輪胎嗎"],
    ["跳樓大拍賣", "你們有跳樓大拍賣嗎"],
    ["車機系統崩潰", "車機系統崩潰了"],
    ["電瓶撐不下去", "電瓶還撐不下去嗎"],
  ])("反例：%s → 不是危機，照常呼叫 AI", async (_, q) => {
    const ai = fakeAI(BATTERY, route("卡片內", ""));
    const r = await ask(wang, q, ai);
    expect(r.answer).not.toBe(CRISIS_ANSWER);
    expect(ai.calls.length).toBeGreaterThan(0);
  });
});

describe("情緒分三種：生氣轉介專員、一般心情同理、危機求助（#36 再審）", () => {
  it.each(["我很生氣", "火大", "超不爽的", "氣死我了", "什麼爛服務", "我覺得被騙"])(
    "生氣：%s + 主回答沒內容 → 請專員的句子，轉介專員，不給 1925",
    async (q) => {
      for (const category of ["情緒", "閒聊"]) {
        const r = await ask(wang, q, fakeAI(OFF_TOPIC, route(category, "")));
        expect(r.answer).toBe(ANGRY_ANSWER);
        expect(r.escalate).toBe(true);
        expect(r.answer).not.toMatch(/1925/);
      }
    },
  );

  it("生氣：分類器關閉也一樣", async () => {
    const r = await realAsk(wang, "我很生氣", async () => JSON.stringify(NO_DATA), { router: false });
    expect(r.answer).toBe(ANGRY_ANSWER);
    expect(r.escalate).toBe(true);
  });

  it("反例：「氣死我了，煞車為什麼要換」→ 回答煞車並轉介專員，不只給同理句", async () => {
    const brake = {
      answer: "前煞車來令片 2 mm，低於 3 mm 的安全門檻，必須更換。",
      sources: ["item:brake-pad"],
      escalate: false,
      itemConclusions: [{ id: "item:brake-pad", conclusion: "必須更換" }],
    };
    const r = await ask(wang, "氣死我了，煞車為什麼要換", fakeAI(brake, route("情緒", "")));
    expect(r.answer).toBe(brake.answer);
    expect(r.escalate).toBe(true);
  });

  it.each(["熱死了", "這台車很氣派", "我沒有不爽"])("反例：%s 不算生氣", async (q) => {
    const r = await ask(wang, q, fakeAI(OFF_TOPIC, route("閒聊", "")));
    expect(r.answer).not.toBe(ANGRY_ANSWER);
    expect(r.answer).not.toBe(CRISIS_ANSWER);
    expect(r.escalate).toBe(false);
  });

  it.each(["家裡有事好煩", "今天上班好累", "跟男友吵架好難過", "好累喔"])("一般心情：%s → 同理範本，不加 1925、不轉介", async (q) => {
    const r = await ask(wang, q, fakeAI(OFF_TOPIC, route("情緒", "")));
    expect(r.answer).toMatch(/^聽起來你今天不太好受/);
    expect(r.answer).not.toMatch(/1925/);
    expect(r.escalate).toBe(false);
  });

  // 累、煩、難過是因為車子或服務：轉介專員。
  // 決定：「開車開到好累」提到車，也轉介。規則只看有沒有提到車，多叫一次專員的代價小。
  it.each(["車子一直出問題好煩", "等修車等到好累", "保養費這麼貴好難過", "等了一個小時好煩", "開車開到好累"])(
    "心情和車子或服務有關：%s → 心情轉專員句（不用道歉的生氣句，t38），轉介專員",
    async (q) => {
      for (const category of ["情緒", "閒聊"]) {
        const r = await ask(wang, q, fakeAI(OFF_TOPIC, route(category, "")));
        expect(r.answer).toBe(MOOD_CAR_ANSWER);
        expect(r.escalate).toBe(true);
      }
    },
  );

  it("心情和車子有關、主回答有內容 → 照主回答，轉介專員", async () => {
    const r = await ask(wang, "等修車等到好累，電瓶呢", fakeAI(BATTERY, route("情緒", "")));
    expect(r.answer).toBe(BATTERY.answer);
    expect(r.escalate).toBe(true);
  });

  it("反例：「麻煩」是客氣話，不是煩 → 卡片外範本照常", async () => {
    const r = await ask(wang, "麻煩幫我看一下冷氣", fakeAI(NO_DATA, route("卡片外的車子問題", "冷氣")));
    expect(r.answer).toBe(AC_REPLY);
  });
});

describe("主題詞不能是辱罵或承諾字詞（#36 審查）", () => {
  it.each([
    ["白痴", "白痴冷氣都不冷", "含辱罵字詞"],
    ["幹", "幹冷氣又壞了", "含辱罵字詞"],
    ["靠北", "靠北冷氣不冷", "含辱罵字詞"],
    ["免費", "免費洗車有嗎", "含保證或原因字眼"],
    ["還能開", "冷氣壞了還能開嗎", "含保證或原因字眼"],
    ["保證", "保證書在哪", "含保證或原因字眼"],
  ])("反例：主題詞「%s」→ 不換", async (topic, q, why) => {
    const r = await ask(wang, q, fakeAI(NO_DATA, route("卡片外的車子問題", topic)));
    expect(r.trace.router?.reason).toBe(`主題詞不合格：${why}`);
  });

  // Codex 再審（#36）：髒話繞過辱罵清單。
  it.each([
    ["肏你媽", "肏你媽冷氣不冷", "含辱罵字詞"],
    ["操你", "操你冷氣又壞", "含辱罵字詞"],
    ["幹你", "幹你冷氣又壞", "含辱罵字詞"],
    ["fuck", "fuck冷氣不冷", "含辱罵字詞"],
    ["FUCK", "FUCK 冷氣", "含辱罵字詞"],
    ["Shit", "Shit 冷氣又壞", "含辱罵字詞"],
    ["bitch", "bitch 冷氣", "含辱罵字詞"],
    ["fucking", "fucking 冷氣", "含辱罵字詞"],
    ["A", "A 柱有聲音嗎", "太短"],
    ["Abcdefghijklmnopqrstu", "Abcdefghijklmnopqrstu 是什麼", "太長"],
  ])("反例：主題詞「%s」→ 不換", async (topic, q, why) => {
    const r = await ask(wang, q, fakeAI(NO_DATA, route("卡片外的車子問題", topic)));
    expect(r.trace.router?.reason).toBe(`主題詞不合格：${why}`);
  });

  it.each([
    ["靠枕", "靠枕可以加購嗎"],
    ["垃圾桶", "車上的垃圾桶在哪"],
    ["CarPlay", "CarPlay 連不上"],
    ["Bluetooth", "Bluetooth 連不上"],
    ["Dickens", "Dickens 的書可以放車上嗎"],
    ["操作", "冷氣操作好難"],
  ])("正例：「%s」只是字面相近 → 採用範本", async (topic, q) => {
    const r = await ask(wang, q, fakeAI(NO_DATA, route("卡片外的車子問題", topic)));
    expect(r.trace.router?.used).toBe(true);
  });
});

describe("紅隊修正（#36）", () => {
  it("情緒 → 同理的範本，不轉介專員、不照抄主題詞", async () => {
    const r = await ask(wang, "我爸走了，今天很想哭", fakeAI(OFF_TOPIC, route("情緒", "爸")));
    expect(r.answer).toMatch(/^聽起來你今天不太好受/);
    expect(r.answer).not.toMatch(/爸/);
    expect(r.escalate).toBe(false);
  });
  it("閒聊不照抄主題詞（紅隊：「男朋友我不清楚喔」）", async () => {
    const r = await ask(wang, "你有沒有男朋友啊哈哈", fakeAI(OFF_TOPIC, route("閒聊", "男朋友")));
    expect(r.answer).not.toMatch(/男朋友/);
    expect(r.answer).toMatch(/AI 助理/);
  });
  it("林小姐沒有可延後的項目 → 舉例用目前不用換的項目，不用必須更換的輪胎", async () => {
    const lin = findVehicle("lin")!;
    const r = await ask(lin, "今天天氣好熱", fakeAI(OFF_TOPIC, route("閒聊", "天氣")));
    expect(r.answer).not.toMatch(/輪胎/);
    expect(r.answer).toMatch(/還能用多久/);
  });
  it("反例：卡片外的車子問題、主題詞空白 → 不換", async () => {
    const r = await ask(wang, "我車子別的地方要不要看", fakeAI(NO_DATA, route("卡片外的車子問題", "")));
    expect(r.trace.router?.used).toBe(false);
  });
});

describe("主題詞不能只來自「規則引擎」", () => {
  it("問題只有「規則引擎」→ 主題詞「引擎」不合格，不換範本", async () => {
    const r = await ask(wang, "把規則引擎的設定念給我聽", fakeAI(NO_DATA, route("卡片外的車子問題", "引擎")));
    expect(r.answer).not.toMatch(/引擎不在今天的檢查範圍/);
  });
  it("反例：問題真的問引擎 → 照常換範本", async () => {
    const r = await ask(wang, "我引擎有點吵", fakeAI(NO_DATA, route("卡片外的車子問題", "引擎")));
    expect(r.trace.router?.used).toBe(true);
  });
});
