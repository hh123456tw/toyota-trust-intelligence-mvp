import { describe, expect, it } from "vitest";
import { ask } from "./ask";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;

const NO_DATA_REPLY = { answer: "這張卡上沒有這項資料，可以請專員說明", sources: [], escalate: true, itemConclusions: [] };
function fakeAI(reply: object = NO_DATA_REPLY) {
  let called = false;
  const call = async () => {
    called = true;
    return JSON.stringify(reply);
  };
  return Object.assign(call, { wasCalled: () => called });
}

describe("打招呼、問你是誰：程式直接自我介紹，不呼叫 AI", () => {
  it.each(["你好你是誰", "你好", "您好！", "嗨", "你是誰？", "請問你是誰", "你可以做什麼？", "hi"])("「%s」", async (q) => {
    const ai = fakeAI();
    const r = await ask(wang, q, ai);
    expect(ai.wasCalled()).toBe(false);
    expect(r.answer).toMatch(/AI 助理/);
    expect(r.escalate).toBe(false);
    expect(r.checkResult).toBe("通過");
    expect(r.trace.noAI).toBe(true);
  });

  it.each(["你好，電瓶還能用多久？", "你是誰決定要換煞車的？", "你好嗎我煞車要換嗎"])("反例：問句裡有其他內容「%s」→ 照常交給 AI", async (q) => {
    const ai = fakeAI({ answer: "煞車只剩 2 mm，今天要換。", sources: ["item:brake-pad"], escalate: true, itemConclusions: [{ id: "item:brake-pad", conclusion: "必須更換" }] });
    await ask(wang, q, ai);
    expect(ai.wasCalled()).toBe(true);
  });
});

describe("卡片外的車子問題：AI 回沒有資料時，程式換成像人的說法", () => {
  it("冷氣不冷 → 點名冷氣，說不在今天的檢查項目，請專員", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI());
    expect(r.answer).toMatch(/冷氣/);
    expect(r.answer).toMatch(/不在今天的檢查項目/);
    expect(r.answer).not.toMatch(/這張卡上沒有這項資料/);
    expect(r.escalate).toBe(true);
    expect(r.checkResult).toBe("通過");
  });

  it("遙控器沒電 → 點名遙控器", async () => {
    const r = await ask(wang, "遙控器電池沒電怎麼辦？", fakeAI());
    expect(r.answer).toMatch(/遙控器/);
    expect(r.escalate).toBe(true);
  });

  it("和車無關（明天會下雨嗎）→ 禮貌說明只能回答這台車的問題，不點名主題", async () => {
    const r = await ask(wang, "明天會下雨嗎？", fakeAI());
    expect(r.answer).toMatch(/這台車/);
    expect(r.answer).not.toMatch(/不在今天的檢查項目/);
    expect(r.answer).not.toMatch(/這張卡上沒有這項資料/);
  });

  it("反例：問題提到卡片上的項目，AI 卻回沒有資料 → 不能說它不在檢查項目", async () => {
    const r = await ask(wang, "電瓶的保固是多久？", fakeAI());
    expect(r.answer).not.toMatch(/不在今天的檢查項目/);
    expect(r.escalate).toBe(true);
  });

  it("反例：「登記」「開心」不算車子主題", async () => {
    const r = await ask(wang, "我今天很開心，要去登記結婚", fakeAI());
    expect(r.answer).not.toMatch(/不在今天的檢查項目/);
  });

  it("反例：AI 正常回答時不改寫", async () => {
    const answer = "電瓶健康度 60%，可以延後，3 個月後再檢查。";
    const r = await ask(wang, "電瓶還能用多久？", fakeAI({ answer, sources: ["item:battery"], escalate: false, itemConclusions: [{ id: "item:battery", conclusion: "可延後" }] }));
    expect(r.answer).toBe(answer);
  });

  it("反例：攔下時仍用原本的替代回答，不改寫", async () => {
    const r = await ask(wang, "我的冷氣有點不冷要不要修？", fakeAI({ answer: "這張卡上沒有這項資料，冷氣大概 3000 元。", sources: [], escalate: true, itemConclusions: [] }));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).not.toMatch(/不在今天的檢查項目/);
  });
});
