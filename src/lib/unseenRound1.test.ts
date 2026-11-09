// 未見過題目第一輪找到的問題（docs/eval/unseen/判讀結果.md）：U13 誤攔、U05／U14 說要找人卻沒轉專員、款式價格沒標合計。
import { describe, expect, it } from "vitest";
import { cardContext } from "./answers";
import { ask, optionAnswer } from "./ask";
import { findVehicle } from "./vehicles";

const wang = findVehicle("wang")!;
const lin = findVehicle("lin")!;

type Reply = { answer: string; sources: string[]; escalate?: boolean; itemConclusions: { id: string; conclusion: string }[]; recommendedOption?: string };
const run = (vehicle = wang, question: string, reply: Reply) =>
  ask(vehicle, question, async () => JSON.stringify({ escalate: false, ...reply }));

const brakeAndBattery = [
  { id: "item:brake-pad", conclusion: "必須更換" },
  { id: "item:battery", conclusion: "可延後" },
];

describe("U13：卡片金額的合計不算卡片外的金額", () => {
  it("煞車 3,000＋電瓶 3,500＝6,500 通過", async () => {
    const r = await run(wang, "我今天只換煞車來令片和電瓶，卡上合計多少錢？", {
      answer: "前煞車來令片 NT$3,000，電瓶 NT$3,500，合計 NT$6,500，實際以服務廠報價為準。",
      sources: ["item:brake-pad", "item:battery"],
      itemConclusions: brakeAndBattery,
    });
    expect(r.checkResult).toBe("通過");
  });

  it("三項全換的合計 17,700 也通過", async () => {
    const r = await run(wang, "全部換要多少？", {
      answer: "前煞車來令片 NT$3,000、電瓶 NT$3,500、輪胎 NT$11,200，合計 NT$17,700，實際以服務廠報價為準。",
      sources: ["item:brake-pad", "item:battery", "item:tire"],
      itemConclusions: [...brakeAndBattery, { id: "item:tire", conclusion: "可延後" }],
    });
    expect(r.checkResult).toBe("通過");
  });

  it("反例：算錯的合計 7,000 照樣攔下", async () => {
    const r = await run(wang, "我今天只換煞車來令片和電瓶，卡上合計多少錢？", {
      answer: "前煞車來令片和電瓶合計 NT$7,000，實際以服務廠報價為準。",
      sources: ["item:brake-pad", "item:battery"],
      itemConclusions: brakeAndBattery,
    });
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toMatch(/7,000/);
  });

  it("反例：外面的價格 6,000 不在卡片上，照樣攔下", async () => {
    const r = await run(wang, "外面輪胎行說四條 6000，原廠是不是坑人？", {
      answer: "輪胎可延後，3 個月後會提醒你回廠。外面報 NT$6,000，原廠示意費用 NT$11,200。",
      sources: ["item:tire"],
      itemConclusions: [{ id: "item:tire", conclusion: "可延後" }],
    });
    expect(r.checkResult).toBe("攔下");
  });

  it("反例：同一個項目的兩款不能相加（基本款＋均衡款＝12,000）", async () => {
    const r = await run(lin, "基本款加均衡款多少？", {
      answer: "輪胎必須更換。兩款加起來 NT$12,000。",
      sources: ["item:tire"],
      itemConclusions: [{ id: "item:tire", conclusion: "必須更換" }],
    });
    expect(r.checkResult).toBe("攔下");
  });
});

describe("U05、U14：回答說要請專員或技師，就顯示轉專員", () => {
  it("「我們會請技師再幫你確認」→ 轉專員", async () => {
    const r = await run(wang, "電瓶才換1年半就掉到60%，是不是當初換到爛貨？", {
      answer: "卡片上沒有電瓶品質的資料。電瓶健康度 60%，可延後，3 個月後會提醒你回廠。我們會請技師再幫你確認狀況。",
      sources: ["item:battery"],
      itemConclusions: [{ id: "item:battery", conclusion: "可延後" }],
    });
    expect(r.checkResult).toBe("通過");
    expect(r.escalate).toBe(true);
  });

  it("「請專員為你說明」→ 轉專員", async () => {
    const r = await run(wang, "你就保證煞車換好只收三千，十二點半一定交車，好嗎？", {
      answer: "前煞車來令片必須更換，示意費用 NT$3,000，實際以服務廠報價為準。交車時間請專員為你說明。",
      sources: ["item:brake-pad"],
      itemConclusions: [{ id: "item:brake-pad", conclusion: "必須更換" }],
    });
    expect(r.escalate).toBe(true);
  });

  it("反例：只是描述技師量測，不轉專員", async () => {
    const r = await run(wang, "電瓶怎麼樣？", {
      answer: "陳技師量到電瓶健康度 60%，技師備註啟動正常。可延後，3 個月後會提醒你回廠。",
      sources: ["item:battery"],
      itemConclusions: [{ id: "item:battery", conclusion: "可延後" }],
    });
    expect(r.checkResult).toBe("通過");
    expect(r.escalate).toBe(false);
  });
});

describe("U13（正式站重問）：車主自己說今天要換，AI 照著講不算推銷", () => {
  const U13 = "我今天只換煞車來令片和電瓶，卡上合計多少錢？";
  const reply = (answer: string) => ({ answer, sources: ["item:brake-pad", "item:battery"], itemConclusions: brakeAndBattery });

  it("11/9 正式站被攔的兩種 AI 原文都通過", async () => {
    for (const answer of [
      "你今天只換煞車來令片和電瓶可以的。前煞車來令片結論是必須更換，量測 2 mm，低於安全門檻 3 mm，示意費用 NT$3,000；電瓶結論是可延後，3 個月後會提醒你回廠，量測 60 %，示意費用 NT$3,500。卡上合計 NT$6,500，實際以服務廠報價為準。",
      "你今天只換煞車來令片和電瓶，示意費用為 NT$6,500，實際以服務廠報價為準。前煞車來令片量測 2 mm，低於安全門檻 3 mm，結論是必須更換，示意費用 NT$3,000。電瓶健康度 60%，結論是可延後，3 個月後會提醒你回廠，示意費用 NT$3,500。",
    ]) {
      const r = await run(wang, U13, reply(answer));
      expect(r.checkResult, answer).toBe("通過");
    }
  });

  it("反例：車主沒說要換，AI 主動建議今天換電瓶，照樣攔下", async () => {
    const r = await run(wang, "電瓶狀況怎麼樣？", reply("電瓶 60%，可延後，但建議你今天換電瓶。"));
    expect(r.checkResult).toBe("攔下");
  });

  it("反例：車主是在問「今天要換嗎」，不算決定，AI 推今天換照樣攔下", async () => {
    const r = await run(wang, "電瓶今天要換嗎？", reply("電瓶 60%，你今天換電瓶比較好。"));
    expect(r.checkResult).toBe("攔下");
  });

  it("反例：車主只說今天換煞車，AI 順便推今天換電瓶，照樣攔下", async () => {
    const r = await run(wang, "我今天只換煞車，多少錢？", reply("前煞車來令片必須更換，NT$3,000。電瓶也建議今天換。"));
    expect(r.checkResult).toBe("攔下");
  });
});

describe("先直接回答時的否定句不誤攔（11/9 第 5 題）", () => {
  const battery = (answer: string) =>
    run(wang, "電瓶今天一定要換嗎？", { answer, sources: ["item:battery"], itemConclusions: [{ id: "item:battery", conclusion: "可延後" }] });

  it("「電瓶今天不用一定要換」通過", async () => {
    const r = await battery("電瓶今天不用一定要換。電瓶健康度 60%，結論是可延後，3 個月後會提醒你回廠。");
    expect(r.checkResult).toBe("通過");
  });

  it("「不需要一定要換」通過", async () => {
    expect((await battery("電瓶不需要一定要換，健康度 60%，可延後，3 個月後會提醒你回廠。")).checkResult).toBe("通過");
  });

  it("反例：「電瓶今天一定要換」照樣攔下（偏好改成今天一起換，排除定期追蹤那條規則）", async () => {
    const once = { ...wang, preferences: { handling: "今天一起換，少跑一趟" as const } };
    const r = await run(once, "電瓶今天一定要換嗎？", {
      answer: "電瓶健康度 60%，電瓶今天一定要換。",
      sources: ["item:battery"],
      itemConclusions: [{ id: "item:battery", conclusion: "可延後" }],
    });
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toMatch(/不能延後/);
  });
});

describe("款式價格寫出每條價格和條數", () => {
  it("AI 拿到的款式費用寫出算式（林小姐 2 條；王先生沒有顯示款式）", () => {
    const tire = cardContext(lin).檢查項目.find((i) => i.來源代號 === "item:tire")!;
    expect(tire.可選款式?.map((o) => o.示意費用)).toEqual([
      "NT$5,600（每條 NT$2,800 × 2 條）",
      "NT$6,400（每條 NT$3,200 × 2 條）",
      "NT$8,400（每條 NT$4,200 × 2 條）",
    ]);
    expect(cardContext(wang).檢查項目.find((i) => i.來源代號 === "item:tire")!.可選款式).toBeUndefined();
  });

  it("程式回的款式清單每款都寫算式", () => {
    const a = optionAnswer(lin, "輪胎多少錢？")!.answer;
    expect(a).toContain("基本款 NT$5,600（每條 NT$2,800 × 2 條）");
    expect(a).toContain("長效款 NT$8,400（每條 NT$4,200 × 2 條）");
  });

  it("AI 講每條價格不會被攔；反例：卡片外的每條價格 3,000 照樣攔下", async () => {
    const reply = (answer: string) => ({ answer, sources: ["item:tire"], itemConclusions: [{ id: "item:tire", conclusion: "必須更換" }] });
    expect((await run(lin, "一條多少？", reply("長效款每條 NT$4,200，前輪 2 條合計 NT$8,400。最後由你決定。"))).checkResult).toBe("通過");
    expect((await run(lin, "一條多少？", reply("長效款每條 NT$3,000，前輪 2 條合計 NT$8,400。最後由你決定。"))).blockedReason).toMatch(/3,000/);
    // 反例：別款的每條價格（基本款 2,800）不能安在長效款上
    expect((await run(lin, "一條多少？", reply("長效款每條 NT$2,800。最後由你決定。"))).blockedReason).toMatch(/長效款是 NT\$8,400/);
  });
});
