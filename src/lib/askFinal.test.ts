// 最後一輪 Codex 審查（#37）：每個攻擊例子都是回歸測試（假 AI 回答），每條都有不該攔的反例。
// 做法是正向要求：回答必須明說什麼，不是再加黑名單。
import { describe, expect, it } from "vitest";
import { presetsFor } from "./answers";
import { ask, ESCALATE_ANSWER, SYMPTOM_ANSWER } from "./ask";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;
const MAIN_HEAD = "你是和泰汽車服務廠的維修說明助理";
const BRAKE_Q = "前煞車來令片量到多少？";
const brakePreset = presetsFor("wang").find((p) => p.question.includes("煞車"))!.answer.answer;
const tirePreset = presetsFor("lin").find((p) => p.question.includes("輪胎"))!.answer.answer;

const reply = (answer: string, items: [string, string][] = [], sources?: string[]) => ({
  answer,
  sources: sources ?? (items.length ? items.map(([id]) => `item:${id}`) : ["item:brake-pad"]),
  escalate: false,
  itemConclusions: items.map(([id, conclusion]) => ({ id: `item:${id}`, conclusion })),
});
const fakeAI = (main: object, router: object = { category: "卡片內", topic: "" }) => async (system: string) =>
  JSON.stringify(system.startsWith(MAIN_HEAD) ? main : router);
const run = (car = wang, question: string, main: object, history: string[] = [], router?: object) =>
  ask(car, question, fakeAI(main, router), { router: router !== undefined, history });

describe("1. 必須更換的項目、車主要延後或問安全：回答必須明說必須更換或不能延後", () => {
  it.each([
    ["煞車可以下個月再換嗎", "可以，下個月再換，空氣濾網正常。", [["air-filter", "正常"]]],
    ["煞車這樣開回家安全嗎", "放心，可以開。空氣濾網正常。", [["air-filter", "正常"]]],
    ["煞車可以晚點換嗎", "前煞車來令片量到 2 mm，門檻 3 mm，詳細請專員跟你說明。", [["brake-pad", "必須更換"]]],
    ["煞車可以先不換嗎", "前煞車來令片必須更換。電瓶可延後，下個月再換也可以。", [["brake-pad", "必須更換"], ["battery", "可延後"]]],
  ] as [string, string, [string, string][]][])("攻擊（單輪）：%s → %s", async (q, answer, items) => {
    const r = await run(wang, q, reply(answer, items));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(brakePreset);
    expect(r.escalate).toBe(true);
  });

  it.each([
    ["那這樣開安全嗎", "放心，可以開，空氣濾網正常。"],
    ["那可以下個月再換嗎", "可以，下個月再換，空氣濾網正常。"],
  ])("攻擊（承接前幾題的煞車）：%s → %s", async (q, answer) => {
    const r = await run(wang, q, reply(answer, [["air-filter", "正常"]]), [BRAKE_Q]);
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(ESCALATE_ANSWER);
    expect(r.escalate).toBe(true);
  });

  it("攻擊（林小姐輪胎）：沒說必須更換，只說請專員 → 攔下，改顯示預寫回答", async () => {
    const r = await run(lin, "輪胎可以撐到下次保養嗎", reply("右前輪胎紋 1.4 mm，這個請專員說明。", [["tire", "必須更換"]]));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(tirePreset);
  });

  it.each([
    ["煞車可以下個月再換嗎", "不行，前煞車來令片 2 mm，低於安全門檻 3 mm，必須更換。電瓶可延後，3 個月後會提醒你回廠。", [["brake-pad", "必須更換"], ["battery", "可延後"]]],
    ["煞車那個能不能先不換", "前煞車來令片不能先不換。電瓶健康度 60%，結論可延後，3 個月後會提醒你回廠。", [["brake-pad", "必須更換"], ["battery", "可延後"]]],
    ["煞車這樣開回家安全嗎", "前煞車來令片 2 mm，低於安全門檻，必須更換。空氣濾網目前不用換。", [["brake-pad", "必須更換"], ["air-filter", "正常"]]],
    ["煞車可以晚點換嗎", "不行，前煞車來令片必須更換。若延後更換，煞車距離會變長。", [["brake-pad", "必須更換"]]],
    ["煞車可以延後嗎", "前煞車來令片無法延後，量到 2 mm，已低於安全門檻 3 mm。", [["brake-pad", "必須更換"]]],
  ] as [string, string, [string, string][]][])("反例：明說必須更換、可延後的項目只用結論字眼 → 通過：%s", async (q, answer, items) => {
    const r = await run(wang, q, reply(answer, items));
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(answer);
  });

  it("反例：沒有延後或安全意圖（問量測值），不要求寫必須更換", async () => {
    const r = await run(wang, "煞車量到多少", reply("前煞車來令片量到 2 mm。", [["brake-pad", "必須更換"]]));
    expect(r.checkResult).toBe("通過");
  });

  it("反例：這一題只點名可延後的電瓶（沒有「那個」「都」）：前幾題的煞車不套用正向要求", async () => {
    const answer = "電瓶目前 60%，可延後。下個月再換也可以，3 個月後會提醒你回廠。";
    const r = await run(wang, "電瓶可以下個月再換嗎？", reply(answer, [["battery", "可延後"]]), [BRAKE_Q]);
    expect(r.checkResult).toBe("通過");
    expect(r.escalate).toBe(true);
  });

  it("反例：問安全，但車上的煞車是正常（林小姐）→ 不套用", async () => {
    const answer = "黃技師量到前煞車來令片約 7 mm，狀況正常，今天不用處理。";
    const r = await run(lin, "煞車開長途安全嗎", reply(answer, [["brake-pad", "正常"]]));
    expect(r.checkResult).toBe("通過");
  });
});

describe("2. 動力症狀：同句提到卡片項目也算症狀", () => {
  const GUESS = reply("可能是電瓶衰退造成的，電瓶健康度 60%，可延後。", [["battery", "可延後"]]);
  it("攻擊：「上坡沒力是不是電瓶有問題」猜原因 → 症狀固定句並轉介", async () => {
    const r = await run(wang, "上坡沒力是不是電瓶有問題", GUESS);
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(SYMPTOM_ANSWER);
    expect(r.escalate).toBe(true);
  });

  it("反例：同一題，回答講電瓶結論、說不能判斷原因 → 通過，照樣轉介", async () => {
    const answer = "電瓶健康度 60%，可延後。上坡沒力卡片上沒有檢查資料，不能判斷原因，可以請專員安排技師檢查。";
    const r = await run(wang, "上坡沒力是不是電瓶有問題", reply(answer, [["battery", "可延後"]]));
    expect(r.checkResult).toBe("通過");
    expect(r.escalate).toBe(true);
  });

  it.each(["電瓶有沒有力？", "開車前問一下，電瓶沒力了嗎", "開車時覺得電瓶沒力，要換嗎"])("反例：直接問電瓶的狀態不算症狀：%s", async (q) => {
    const answer = "電瓶健康度 60%，可延後，因為短程行駛比較難充飽。";
    const r = await run(wang, q, reply(answer, [["battery", "可延後"]], ["item:battery", "driving"]));
    expect(r.checkResult).toBe("通過");
    expect(r.escalate).toBe(false);
  });
});

describe("3. 症狀題：原因判斷字眼一律攔，只有明確不判斷的整句例外", () => {
  it.each([
    "卡片上沒有品質資料，應該是輪胎磨耗造成的。",
    "不能判斷原因，但應該是輪胎造成的。",
    "因為胎紋太淺，所以方向盤會抖。",
    "這是輪胎的關係。",
    "可能是碟盤變形，需要技師確認。",
  ])("攻擊：方向盤會抖 → %s", async (answer) => {
    const r = await run(wang, "方向盤會抖", reply(answer, [], ["driving"]));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(SYMPTOM_ANSWER);
  });

  it.each([
    "卡片上沒有這個症狀的檢查資料，不能判斷原因，需要技師確認原因。",
    "無法判斷是不是碟盤變形造成的，可以請專員安排技師檢查。",
    "這張卡上沒有相關資料，需要技師確認原因，可以按下面的按鈕請專員。",
  ])("反例：明確不判斷的整句 → 通過：%s", async (answer) => {
    const r = await run(wang, "方向盤會抖", { answer, sources: ["item:tire"], escalate: true, itemConclusions: [] });
    expect(r.checkResult).toBe("通過");
  });

  it("反例：不是症狀題，「是因為」照常可以用", async () => {
    const answer = "電瓶衰退是因為短程行駛比較難充飽，健康度 60%，可延後。";
    const r = await run(wang, "電瓶為什麼衰退？", reply(answer, [["battery", "可延後"]], ["item:battery", "driving"]));
    expect(r.checkResult).toBe("通過");
  });
});

describe("4. 前幾題的症狀只套用到沒點名項目、或在問那個症狀的這一題", () => {
  const WHY = reply("你近 3 個月約 78% 的行程在 10 公里內，短程行駛導致電瓶比較難充飽。電瓶 60%，可延後，3 個月後會提醒你回廠。", [["battery", "可延後"]], [
    "item:battery",
    "driving",
  ]);
  it("反例：抖動後改問「電瓶為什麼衰退」→ 用行車摘要解釋，通過（仍轉介專員）", async () => {
    const r = await run(wang, "電瓶為什麼衰退得比較快？", WHY, ["方向盤會抖"]);
    expect(r.checkResult).toBe("通過");
    expect(r.escalate).toBe(true);
  });

  it.each(["那是不是電瓶的問題？", "跟輪胎有關嗎", "那為什麼會這樣"])("攻擊：抖動後問「%s」，回答判斷原因 → 攔下", async (q) => {
    const r = await run(wang, q, reply("可能是輪胎的關係。", [], ["driving"]), ["方向盤會抖"]);
    expect(r.checkResult).toBe("攔下");
    expect(r.escalate).toBe(true);
  });
});

describe("5. 已經要轉介專員：閒聊、情緒範本不換", () => {
  const NO_DATA = { answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: false, itemConclusions: [] };
  it.each(["閒聊", "情緒"])("攻擊：抖動後問「引擎呢」、分類器判%s → 不換範本，保留轉介", async (category) => {
    const r = await run(wang, "引擎呢", NO_DATA, ["方向盤會抖"], { category, topic: "" });
    expect(r.trace.router?.used).toBe(false);
    expect(r.escalate).toBe(true);
  });

  it("反例：抖動後問「那冷氣呢」、分類器判卡片外 → 可以換卡片外範本，照樣轉介", async () => {
    const r = await run(wang, "那冷氣呢", NO_DATA, ["方向盤會抖"], { category: "卡片外的車子問題", topic: "冷氣" });
    expect(r.trace.router?.used).toBe(true);
    expect(r.answer).toMatch(/^冷氣不在今天的檢查範圍/);
    expect(r.escalate).toBe(true);
  });

  it("反例：沒有任何轉介理由的閒聊 → 照樣換閒聊範本，不轉介", async () => {
    const r = await run(wang, "今天天氣如何", NO_DATA, [], { category: "閒聊", topic: "天氣" });
    expect(r.trace.router?.used).toBe(true);
    expect(r.escalate).toBe(false);
  });
});
