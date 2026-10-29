import { describe, expect, it } from "vitest";
import { cardContext } from "./answers";
import { amounts, ask, ruleSummary } from "./ask";
import { cardItems, withMeasurement } from "./card";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const BRAKE = [{ id: "item:brake-pad", conclusion: "必須更換" }];

function fakeAI(answer: string) {
  return async () => JSON.stringify({ answer, sources: ["item:brake-pad"], escalate: false, itemConclusions: BRAKE });
}

describe("決策卡的示意費用", () => {
  it("必須更換、可延後顯示價格；正常不顯示", () => {
    const price = Object.fromEntries(cardItems(wang.items).map((i) => [i.id, i.price]));
    expect(price).toEqual({ "brake-pad": 3000, battery: 3500, "air-filter": undefined, wiper: undefined, tire: undefined });
  });

  it("技師改值變正常 → 價格消失；改回 → 價格再出現", () => {
    const brake = (items: typeof wang.items) => cardItems(items).find((i) => i.id === "brake-pad")!;
    const fixed = withMeasurement(wang.items, "brake-pad", 6);
    expect(brake(fixed).price).toBeUndefined();
    expect(brake(withMeasurement(fixed, "brake-pad", 2)).price).toBe(3000);
  });

  it("給 AI 的卡片資料只含卡片上看得到的價格", () => {
    const ctx = Object.fromEntries(cardContext(wang).檢查項目.map((i) => [i.名稱, i.示意費用]));
    expect(ctx).toMatchObject({ 前煞車來令片: "NT$3,000", 電瓶: "NT$3,500", 空氣濾網: null });
  });
});

describe("amounts：抓出回答裡的金額", () => {
  it.each(["NT$3000", "NT$ 3,000", "3,000 元", "3000塊", "3000 塊錢", "新台幣 3,000", "3 千元", "$3,000"])("「%s」→ 3000", (t) => {
    expect(amounts(t)).toEqual([3000]);
  });

  it.each(["里程 58,200 km", "量測 2 mm、健康度 60%", "3 個月後回廠", "大約 2 天", "左右 2 塊來令片都磨了", "2026-09-25 檢查"])(
    "反例「%s」不是金額",
    (t) => {
      expect(amounts(t)).toEqual([]);
    },
  );
});

describe("答案檢查：金額", () => {
  it.each(["前煞車來令片示意費用 NT$3,000。", "煞車大約 3000 元，價格無法調整。", "煞車 3000 塊，今天要換。"])(
    "引用卡片上的價格「%s」→ 通過",
    async (answer) => {
      expect((await ask(wang, "煞車多少錢？", fakeAI(answer))).checkResult).toBe("通過");
    },
  );

  it("金額不在卡片上（NT$1,500）→ 攔下", async () => {
    const r = await ask(wang, "煞車多少錢？", fakeAI("煞車可以算你 NT$1,500。"));
    expect(r).toMatchObject({ checkResult: "攔下", blockedReason: "回答提到的金額 NT$1,500 不在卡片上" });
  });

  it("正常項目的價格不在卡片上（輪胎 NT$12,000）→ 攔下", async () => {
    const r = await ask(wang, "煞車多少錢？", fakeAI("煞車 NT$3,000，輪胎一起換要 12,000 元。"));
    expect(r.blockedReason).toBe("回答提到的金額 NT$12,000 不在卡片上");
  });

  it("里程、量測值、月數不誤擋", async () => {
    const r = await ask(wang, "煞車怎樣？", fakeAI("里程 58,200 km，煞車量測 2 mm，低於安全門檻 3 mm，今天要換。電瓶 60%，3 個月後提醒。"));
    expect(r.checkResult).toBe("通過");
  });

  it("規則版接待摘要帶價格，本身通過金額檢查", () => {
    const s = ruleSummary(wang).answer;
    expect(s).toContain("NT$3,000");
    expect(amounts(s)).toEqual([3000, 3500]);
  });
});
