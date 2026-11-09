// 部署前審查（#36）找到的答案檢查漏洞：主回答路徑（v37 也有）。分類器關閉，只測主回答。
import { describe, expect, it } from "vitest";
import { ask as realAsk } from "./ask";
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
