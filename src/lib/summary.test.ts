import { describe, expect, it } from "vitest";
import { ruleSummary, summarize } from "./ask";
import { judge } from "./rules";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;

const ALL = wang.items.map((i) => ({ id: `item:${i.id}`, conclusion: judge(i).conclusion }));
const GOOD =
  "前煞車來令片量測 2 mm，低於安全門檻 3 mm，今天必須更換。電瓶健康度 60%，可延後，3 個月後提醒回廠。空氣濾網、雨刷、輪胎胎紋狀況正常，今天不用處理。";

function fakeAI(answer: string, extra: object = {}) {
  return async () =>
    JSON.stringify({ answer, sources: ["item:brake-pad", "item:battery"], escalate: false, itemConclusions: ALL, ...extra });
}

describe("summarize：檢查結果摘要", () => {
  it("正確的摘要 → 通過，原文顯示", async () => {
    const r = await summarize({ ...wang, preferences: undefined }, fakeAI(GOOD));
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(GOOD);
  });

  it("說必須更換的煞車可以延後 → 攔下，改顯示規則版摘要", async () => {
    const r = await summarize(wang, fakeAI(GOOD.replace("今天必須更換", "可以延後到下個月")));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer).toBe(ruleSummary(wang).answer);
  });

  it("對正常的空氣濾網推銷更換 → 攔下", async () => {
    const r = await summarize(wang, fakeAI(`${GOOD}空氣濾網建議今天一起換。`));
    expect(r.checkResult).toBe("攔下");
  });

  it("漏掉可延後的電瓶 → 攔下", async () => {
    const r = await summarize(wang, fakeAI("前煞車來令片量測 2 mm，低於安全門檻 3 mm，今天必須更換。其他狀況正常。"));
    expect(r).toMatchObject({ checkResult: "攔下", blockedReason: "摘要漏了可延後的電瓶" });
  });

  it("只提到「遙控器電池」不算提到電瓶 → 仍算漏掉", async () => {
    const r = await summarize(wang, fakeAI("前煞車來令片 2 mm，低於安全門檻 3 mm，必須更換。遙控器電池正常。"));
    expect(r.blockedReason).toBe("摘要漏了可延後的電瓶");
  });

  it("AI 呼叫丟錯 → 丟錯，不回傳假摘要", async () => {
    await expect(
      summarize(wang, async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow("down");
  });
});

describe("檢查結果摘要的車主偏好行（#24）", () => {
  // 王先生的示範偏好：能等就等、最在意價格、近期有長途行程、最近沒有異常。「沒有異常」不列。
  const WANG_LINE = "車主偏好：能等就等、最在意價格、近期有長途行程。";
  const noPrefs = { ...wang, preferences: undefined };
  const withIssue = { ...wang, preferences: { recentIssue: "有" as const, issueNote: "起步會抖" } };

  it("有偏好：AI 摘要通過後，最後接上偏好行，前面的原文不變", async () => {
    const r = await summarize(wang, fakeAI(GOOD));
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(GOOD + WANG_LINE);
  });

  it("有偏好：規則版摘要和攔下時的摘要，最後都是偏好行", async () => {
    expect(ruleSummary(wang).answer.endsWith(WANG_LINE)).toBe(true);
    const r = await summarize(wang, fakeAI(GOOD.replace("今天必須更換", "可以延後到下個月")));
    expect(r.checkResult).toBe("攔下");
    expect(r.answer.endsWith(WANG_LINE)).toBe(true);
  });

  it("最近有異常：多一句請技師確認；車主描述不寫進摘要", async () => {
    const tail = "車主提到最近有異常，請技師確認。";
    expect((await summarize(withIssue, fakeAI(GOOD))).answer).toBe(GOOD + tail);
    expect(ruleSummary(withIssue).answer.endsWith(tail)).toBe(true);
    expect(ruleSummary(withIssue).answer).not.toContain("起步會抖");
  });

  it("最近沒有異常：不出現請技師確認", () => {
    expect(ruleSummary(wang).answer).not.toContain("請技師確認");
  });

  // 審查發現：「近期沒有長途行程」「最近沒有異常」不影響專員怎麼開口，列出來只會讓摘要變長。
  it("偏好行只列有意義的項目：有處理方式和異常時兩句都在", () => {
    const v = { ...wang, preferences: { handling: "一次處理完" as const, longTrip: "沒有" as const, recentIssue: "有" as const } };
    expect(ruleSummary(v).answer.endsWith("車主偏好：一次處理完。車主提到最近有異常，請技師確認。")).toBe(true);
  });

  it("反例：只有「沒有長途」「沒有異常」時，摘要沒有偏好行", () => {
    const v = { ...wang, preferences: { longTrip: "沒有" as const, recentIssue: "沒有" as const } };
    expect(ruleSummary(v).answer).toBe(ruleSummary(noPrefs).answer);
    expect(ruleSummary(v).answer).not.toMatch(/沒有長途|沒有異常|車主偏好/);
  });

  it.each([
    ["沒送偏好", noPrefs],
    ["空的偏好", { ...wang, preferences: {} }],
    ["林小姐", lin],
  ])("%s：摘要和現在完全相同，沒有空白的偏好欄", async (_, v) => {
    expect(ruleSummary(v).answer).not.toContain("車主偏好");
    if (v.id === "wang") expect((await summarize(v, fakeAI(GOOD))).answer).toBe(GOOD);
  });

  it("偏好不改變結論和項目順序：規則版摘要只在最後多一行", () => {
    const plain = ruleSummary(noPrefs);
    const s = ruleSummary(wang);
    expect(s.answer).toBe(plain.answer + WANG_LINE);
    expect(s.sources).toEqual(plain.sources);
  });

  it("有偏好時，原本的漏項檢查和推銷檢查照常攔下", async () => {
    const missed = await summarize(wang, fakeAI("前煞車來令片量測 2 mm，低於安全門檻 3 mm，今天必須更換。其他狀況正常。"));
    expect(missed.blockedReason).toBe("摘要漏了可延後的電瓶");
    expect((await summarize(wang, fakeAI(`${GOOD}空氣濾網建議今天一起換。`))).checkResult).toBe("攔下");
  });
});

describe("ruleSummary：規則版摘要", () => {
  it.each([wang, lin])("$owner：每個項目都出現，結論和規則引擎一致，本身通過答案檢查", async (v) => {
    const s = ruleSummary(v);
    for (const i of v.items) expect(s.answer).toContain(i.name);
    expect(s.sources).toEqual(v.items.map((i) => `item:${i.id}`));
    const conclusions = v.items.map((i) => ({ id: `item:${i.id}`, conclusion: judge(i).conclusion }));
    const r = await summarize(v, async () => JSON.stringify({ ...s, itemConclusions: conclusions }));
    expect(r.checkResult).toBe("通過");
  });
});
