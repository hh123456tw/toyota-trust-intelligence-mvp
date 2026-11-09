// 部署前審查（#36）找到的答案檢查漏洞：主回答路徑（v37 也有）。分類器關閉，只測主回答。
import { describe, expect, it } from "vitest";
import { ask as realAsk, needsHuman, SYMPTOM_ANSWER } from "./ask";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const ask = (question: string, reply: object) => realAsk(wang, question, async () => JSON.stringify(reply), { router: false });

const BRAKE = { id: "item:brake-pad", conclusion: "必須更換" };
const BATTERY = { id: "item:battery", conclusion: "可延後" };
const brakeReply = (answer: string, extra: object[] = []) => ({
  answer,
  sources: ["item:brake-pad", ...extra.map((c) => (c as { id: string }).id)],
  escalate: false,
  itemConclusions: [BRAKE, ...extra],
});

describe("必須更換的項目：回答不能有安全保證或延後說法", () => {
  it.each([
    ["下一句沒點名項目的安全保證", "煞車必須更換。放心繼續開。"],
    ["下一句沒點名項目的延後", "煞車必須更換。不用今天換。"],
    ["同一句的「不過放心」", "前煞車來令片 2 mm，必須更換，不過放心繼續開。"],
    ["第一句就保證，項目在後面", "放心。煞車 2 mm，必須更換。"],
    ["下次再換也沒問題", "煞車必須更換，下次再換也沒問題。"],
    ["照常開", "煞車必須更換。照常開就好。"],
    ["今天不用換", "煞車必須更換。今天不用換。"],
    ["沒加引號的偏好名稱（11/9 87 題 #4）", "前煞車來令片量測 2 mm，結論是必須更換。定期追蹤，到時再換。"],
    ["不用擔心", "煞車必須更換。不用擔心。"],
    // Codex 再審（#36）：「換完」前面有「還沒」，講的是換之前。
    ["還沒換完也可以放心開", "煞車必須更換。還沒換完也可以放心開。"],
    ["換之前可以開", "煞車必須更換。換之前還是可以開。"],
    ["換完前放心", "煞車必須更換，換完前放心開沒關係。"],
    ["放心把車開回家（不是交給別人）", "煞車必須更換。可以放心把車開回家。"],
  ])("攔下：%s", async (_, answer) => {
    const r = await ask("煞車可以晚點換嗎", brakeReply(answer));
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toMatch(/^前煞車來令片是必須更換，回答卻/);
    expect(r.answer).not.toBe(answer);
  });

  it.each([
    ["後果的警告", "煞車必須更換。繼續開會有安全風險。"],
    ["不建議繼續開", "煞車必須更換，不建議繼續開。"],
    ["不能保證沒問題", "煞車必須更換，不能保證沒問題。"],
    ["不能延後", "煞車必須更換，不能延後。"],
    ["無法保證一定沒問題", "煞車必須更換。無法保證一定沒問題。"],
    ["換完之後才放心", "煞車必須更換，換完就可以放心開。"],
    ["其他項目下次保養再看", "煞車必須更換。其他項目下次保養再看。"],
    ["其他項目都沒問題", "煞車必須更換。其他項目都沒問題。"],
    ["說沒有資料（87 題 #25）", "煞車必須更換。這張卡上沒有下個月換比較省錢的資料。"],
    // Codex 再審（#36）誤攔：「開啟」不是開車；「放心交給專員」是請人處理。
    ["可以開啟卡片", "煞車必須更換。你可以開啟卡片查看量測。"],
    ["請放心交給專員處理", "煞車必須更換，請放心交給專員處理。"],
    ["放心讓技師檢查", "煞車必須更換，可以放心讓技師檢查。"],
    ["放心把車交給我們", "煞車必須更換，請放心把車交給我們。"],
  ])("通過：%s", async (_, answer) => {
    const r = await ask("煞車可以晚點換嗎", brakeReply(answer));
    expect(r.blockedReason).toBeUndefined();
    expect(r.answer).toBe(answer);
  });

  it("通過：延後說法講的是上一句的可延後項目", async () => {
    const answer = "煞車必須更換。電瓶可延後，3 個月後會提醒你回廠。下次再換也可以。";
    const r = await ask("煞車和電瓶呢", brakeReply(answer, [BATTERY]));
    expect(r.blockedReason).toBeUndefined();
  });

  it("通過：沒提到必須更換的項目時，「不用擔心」不算", async () => {
    const r = await ask("電瓶呢", { answer: "電瓶可延後，3 個月後會提醒你回廠，不用擔心。", sources: ["item:battery"], escalate: false, itemConclusions: [BATTERY] });
    expect(r.blockedReason).toBeUndefined();
  });
});

describe("抱怨上次檢查、拿外面價格比較：轉介專員（Fable 正式站實測）", () => {
  it("實測題：主回答照答、沒轉介 → 程式轉介專員", async () => {
    const q = "上次說 3.5 mm 還好，現在就要換，是不是沒檢查好？外面 1800 你們 3000 太貴";
    const r = await ask(q, brakeReply("前煞車來令片量測 2 mm，低於安全門檻 3 mm，結論是必須更換，示意費用 NT$3,000。"));
    expect(r.escalate).toBe(true);
  });

  it.each(["是不是沒檢查好", "上次不是說還好嗎", "你們騙我", "外面 1800 你們 3000", "別家比較便宜", "這樣太貴了", "上次明明說可以撐"])("轉介：%s", (q) => {
    expect(needsHuman(q)).toBe(true);
  });

  it.each(["價格多少", "會不會很貴？", "會不會太貴", "冷氣這次沒檢查嗎", "上次說電瓶幾 %", "外面下雨 3 點能牽車嗎", "哪一款比較便宜"])("反例：%s 不轉介", (q) => {
    expect(needsHuman(q)).toBe(false);
  });
});

describe("卡片外的症狀：回答不能猜原因（Fable 正式站實測）", () => {
  const q = "踩煞車方向盤會抖，碟盤翹了嗎？";
  it.each(["方向盤會抖可能是碟盤變形。", "這應該是碟盤的問題。", "碟盤變形了，要一起處理。"])("攔下改症狀固定句：%s", async (guess) => {
    const r = await ask(q, brakeReply(`前煞車來令片 2 mm，必須更換。${guess}`));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(SYMPTOM_ANSWER);
    expect(r.escalate).toBe(true);
  });

  it("反例：說不能判斷，通過", async () => {
    const answer = "前煞車來令片 2 mm，必須更換。卡片上不能判斷是不是碟盤的問題，可以按下面的按鈕請專員安排檢查。";
    const r = await ask(q, brakeReply(answer));
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(answer);
  });

  it("症狀固定句提到按鈕，不說已經在安排技師", () => {
    expect(SYMPTOM_ANSWER).toMatch(/按下面的按鈕/);
    expect(SYMPTOM_ANSWER).not.toMatch(/我會請技師/);
  });
});
