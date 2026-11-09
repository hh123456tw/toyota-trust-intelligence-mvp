import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ask, RESPONSE_SCHEMA } from "./ask";
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
function fakeAI(main: object, router: object | string | Error) {
  const calls: { system: string; user: string }[] = [];
  const call = async (system: string, user: string) => {
    calls.push({ system, user });
    if (system.startsWith(MAIN_HEAD)) return JSON.stringify(main);
    if (router instanceof Error) throw router;
    return typeof router === "string" ? router : JSON.stringify(router);
  };
  return Object.assign(call, { calls });
}
const route = (category: string, reply: string) => ({ category, reply });

const AC_REPLY = "冷氣今天沒有檢查，我不能判斷。可以按下面的按鈕請專員來看看。";
const CHAT_REPLY = "辛苦了，先在客休室休息一下。有這台車今天檢查結果的問題，都可以問我。";

describe("主回答提示詞和 schema 鎖定（v37，cbfe4da）", () => {
  it("SYSTEM_PROMPT 和 RESPONSE_SCHEMA 的 sha256 不變", async () => {
    const ai = fakeAI(NO_DATA, route("閒聊", CHAT_REPLY));
    await ask(wang, "今天天氣如何", ai);
    const main = ai.calls.find((c) => c.system.startsWith(MAIN_HEAD))!;
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    expect(sha(main.system)).toBe("89ed8084463edb2ac9c3ffdedc41365d62cb81c58be97c74cb1669f53a8e6371");
    expect(sha(JSON.stringify(RESPONSE_SCHEMA))).toBe("681e5e9818083c091e49fa2f35edde3ab484b8858125928edf750eba388c1668");
  });
});

describe("分類器和主回答平行呼叫", () => {
  it("一題呼叫 AI 兩次：主回答一次、分類器一次，分類器只拿到項目名稱", async () => {
    const ai = fakeAI(NO_DATA, route("卡片外的車子問題", AC_REPLY));
    await ask(wang, "我冷氣不冷", ai);
    expect(ai.calls).toHaveLength(2);
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
      return JSON.stringify(system.startsWith(MAIN_HEAD) ? NO_DATA : route("閒聊", CHAT_REPLY));
    };
    await ask(wang, "今天天氣如何", ai);
    expect(started).toBe(2);
  });
});

describe("換用候選回答：條件全部成立才換", () => {
  it("卡片外的車子問題 + 主回答沒有資料 → 用候選回答，轉介專員", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", AC_REPLY)));
    expect(r.answer).toBe(AC_REPLY);
    expect(r.escalate).toBe(true);
    expect(r.checkResult).toBe("通過");
    expect(r.trace.router).toEqual({ category: "卡片外的車子問題", used: true });
  });

  it("閒聊 + 主回答離題拒絕 → 用候選回答，不轉介專員", async () => {
    const r = await ask(wang, "我今天好累喔", fakeAI(OFF_TOPIC, route("閒聊", CHAT_REPLY)));
    expect(r.answer).toBe(CHAT_REPLY);
    expect(r.escalate).toBe(false);
  });

  it("反例：卡片內的問題被分類器判卡片外 → 仍用主回答（v37 固定句）", async () => {
    const r = await ask(wang, "電瓶的保固是多久？", fakeAI(NO_DATA, route("卡片外的車子問題", "電瓶的保固我不能判斷，可以按下面的按鈕請專員來。")));
    expect(r.answer).not.toMatch(/保固我不能判斷/);
    expect(r.trace.router).toEqual({ category: "卡片外的車子問題", used: false, reason: "問題提到卡片上的檢查項目" });
  });

  it("反例：主回答有實際內容 → 不換", async () => {
    const r = await ask(wang, "我冷氣不冷，電瓶呢", fakeAI(BATTERY, route("卡片外的車子問題", AC_REPLY)));
    expect(r.answer).toBe(BATTERY.answer);
  });

  it("反例：主回答有實際內容、問題沒提到項目 → 不換，理由是主回答有實際內容", async () => {
    const r = await ask(wang, "今天要付多少", fakeAI(BATTERY, route("閒聊", CHAT_REPLY)));
    expect(r.answer).toBe(BATTERY.answer);
    expect(r.trace.router).toEqual({ category: "閒聊", used: false, reason: "主回答有實際內容" });
  });

  it("反例：分類器判症狀、越權要求、卡片內 → 不換", async () => {
    for (const category of ["症狀", "越權要求", "卡片內"]) {
      const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route(category, AC_REPLY)));
      expect(r.answer).not.toBe(AC_REPLY);
      expect(r.trace.router?.used).toBe(false);
    }
  });

  it("反例：主回答被攔下 → 不換", async () => {
    const bad = { answer: "這張卡上沒有這項資料，費用 NT$99,999", sources: [], escalate: false, itemConclusions: [] };
    const r = await ask(wang, "我冷氣不冷", fakeAI(bad, route("卡片外的車子問題", AC_REPLY)));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).not.toBe(AC_REPLY);
    expect(r.trace.router?.reason).toBe("主回答被攔下");
  });

  it("反例：問題描述症狀 → 不換，用 v37 症狀固定句", async () => {
    const r = await ask(wang, "開車時有怪聲", fakeAI(NO_DATA, route("卡片外的車子問題", "怪聲今天沒有檢查，可以按下面的按鈕請專員來。")));
    expect(r.answer).toMatch(/不能判斷原因/);
  });

  it.each([
    ["數字", "冷氣今天沒有檢查，大概 3 天可以修好。"],
    ["國字數字", "冷氣今天沒有檢查，大概三天後可以安排。"],
    ["價格", "冷氣檢查要新台幣五百元，可以請專員來。"],
    ["原因", "冷氣不冷可能是冷媒不足，可以按下面的按鈕請專員來。"],
    ["原因（造成）", "這通常是濾網髒了造成的，可以請專員來。"],
    ["時間承諾", "冷氣今天沒有檢查，專員馬上過來幫你看。"],
    ["說已通知", "冷氣今天沒有檢查，我已經通知專員了。"],
    ["重複", "冷氣今天沒有檢查，冷氣今天沒有檢查，可以請專員來。"],
    ["提到卡片項目", "冷氣和電瓶今天都沒有檢查，可以請專員來。"],
    ["空白", "  "],
  ])("反例：候選回答有%s → 不換", async (_, reply) => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", reply)));
    expect(r.answer).not.toBe(reply);
    expect(r.trace.router?.used).toBe(false);
    expect(r.trace.router?.reason).toMatch(/^候選回答沒通過檢查/);
    expect(r.escalate).toBe(true);
  });

  it("反例：閒聊的候選回答提到專員 → 不換（閒聊不顯示按鈕）", async () => {
    const r = await ask(wang, "我今天好累喔", fakeAI(OFF_TOPIC, route("閒聊", "辛苦了，有需要可以請專員來陪你聊。")));
    expect(r.answer).toBe(OFF_TOPIC.answer);
  });

  it("負面情境：「時間」「原因」的近似字不誤擋（今天沒有檢查、不能判斷原因）", async () => {
    const ok = "冷氣今天沒有檢查，我不能判斷原因。可以按下面的按鈕請專員來。";
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", ok)));
    expect(r.answer).toBe(ok);
  });
});

describe("分類器失敗：當作沒有候選回答，用主回答", () => {
  it.each([
    ["呼叫丟錯", new Error("Gemini 503")],
    ["不是 JSON", "not json"],
    ["類別不在清單", JSON.stringify({ category: "其他", reply: AC_REPLY })],
    ["缺少 reply", JSON.stringify({ category: "閒聊" })],
  ])("%s → v37 的回答，整題不失敗", async (_, router) => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, router));
    expect(r.answer).toMatch(/冷氣不在今天的檢查項目/);
    expect(r.trace.router).toEqual({ used: false, reason: "分類器失敗或回應無法解析" });
  });

  it("主回答失敗 → 照 v37 丟錯（分類器成功也一樣）", async () => {
    const ai = async (system: string) => (system.startsWith(MAIN_HEAD) ? "not json" : JSON.stringify(route("閒聊", CHAT_REPLY)));
    await expect(ask(wang, "今天天氣如何", ai)).rejects.toThrow();
  });
});

describe("流程紀錄", () => {
  it("顯示分類器類別、採用候選回答、AI 呼叫 2 次", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, route("卡片外的車子問題", AC_REPLY)));
    const f = askFlow("我冷氣不冷", 200, r, {});
    expect(f.aiCalls).toBe(2);
    expect(f.steps).toContain("分類器：卡片外的車子問題");
    expect(f.steps).toContain("候選回答：採用");
  });

  it("沒採用時寫原因", async () => {
    const r = await ask(wang, "今天要付多少", fakeAI(BATTERY, route("閒聊", CHAT_REPLY)));
    const f = askFlow("今天要付多少", 200, r, {});
    expect(f.steps).toContain("候選回答：沒採用（主回答有實際內容）");
  });

  it("分類器失敗也寫出來", async () => {
    const r = await ask(wang, "我冷氣不冷", fakeAI(NO_DATA, "x"));
    expect(askFlow("我冷氣不冷", 200, r, {}).steps).toContain("分類器：失敗");
  });

  it("連線失敗（502）時 AI 呼叫算 2 次", () => {
    expect(askFlow("q", 502, { error: "x" }, {}).aiCalls).toBe(2);
  });
});
