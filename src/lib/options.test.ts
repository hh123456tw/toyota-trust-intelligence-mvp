import { describe, expect, it } from "vitest";
import { cardContext } from "./answers";
import { ask, optionAnswer, summarize } from "./ask";
import { applyMeasurements, cardItems, cardProps, currentMeasurements, measurementError, withMeasurement } from "./card";
import { choiceKey, handover, needsOptionPick, pruneChoices } from "./handover";
import { vehicles } from "./vehicles";

const lin = vehicles.find((v) => v.id === "lin")!;
const wang = vehicles.find((v) => v.id === "wang")!;
const tireOf = (items = lin.items) => cardItems(items).find((i) => i.id === "tire")!;

describe("必須更換的風險和產品清單", () => {
  it("必須更換的項目顯示不換的風險", () => {
    expect(tireOf().risk).toContain("打滑");
    expect(cardItems(wang.items).find((i) => i.id === "brake-pad")!.risk).toContain("煞車距離");
  });

  it("產品由低價排到高價", () => {
    const prices = tireOf().options!.map((o) => o.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices.length).toBeGreaterThan(1);
  });

  it("反例：不是必須更換時，沒有風險、清單，也就沒有折扣", () => {
    const normal = tireOf(withMeasurement(lin.items, "tire", 6));
    expect(normal.verdict.conclusion).toBe("正常");
    expect(normal.risk).toBeUndefined();
    expect(normal.options).toBeUndefined();

    const deferrable = tireOf(withMeasurement(lin.items, "tire", 2));
    expect(deferrable.verdict.conclusion).toBe("可延後");
    expect(deferrable.risk).toBeUndefined();
    expect(deferrable.options).toBeUndefined();
  });

  it("更換範圍：輪胎、煞車都寫清楚一次換多少，AI 也拿得到", () => {
    expect(tireOf().replaceScope).toContain("一對");
    expect(cardItems(wang.items).find((i) => i.id === "brake-pad")!.replaceScope).toContain("一組");
    expect(JSON.stringify(cardContext(lin))).toContain("前輪左右一對");
  });

  it("王先生的輪胎可延後：顯示四輪一起換，使用紀錄寫原廠胎", () => {
    const tire = cardItems(wang.items).find((i) => i.id === "tire")!;
    expect(tire.verdict.conclusion).toBe("可延後");
    expect(tire.replaceScope).toContain("四輪");
    expect(tire.history).toContain("原廠胎");
    expect(JSON.stringify(cardContext(wang))).toContain("原廠胎，交車後沒換過");
  });

  it("反例：目前不用換的項目不顯示更換範圍", () => {
    expect(cardItems(withMeasurement(wang.items, "tire", 6)).find((i) => i.id === "tire")!.replaceScope).toBeUndefined();
    expect(cardItems(lin.items).find((i) => i.id === "brake-pad")!.replaceScope).toBeUndefined();
  });

  it("通用：王先生的輪胎降到必須更換，一樣有風險和清單，價格是四輪", () => {
    const tire = cardItems(withMeasurement(wang.items, "tire", 1)).find((i) => i.id === "tire")!;
    expect(tire.verdict.conclusion).toBe("必須更換");
    expect(tire.risk).toContain("打滑");
    expect(tire.options!.map((o) => o.price)).toEqual([11200, 12800, 16800]);
    expect(tire.price).toBe(11200);
  });

  it("反例：王先生的輪胎可延後時，卡片和 AI 都沒有清單", () => {
    expect(cardItems(wang.items).find((i) => i.id === "tire")!.options).toBeUndefined();
    expect(JSON.stringify(cardContext(wang))).not.toContain("長效款");
  });

  it("反例：沒有產品資料的必須更換項目，不產生清單", () => {
    expect(cardItems(wang.items).find((i) => i.id === "brake-pad")!.options).toBeUndefined();
  });

  it("AI 拿得到款式和規格，拿不到折扣", () => {
    const context = JSON.stringify(cardContext(lin));
    expect(context).toContain("長效款");
    expect(context).toContain("濕地抓地");
    for (const word of ["優惠", "7,200", "11/30"]) expect(context).not.toContain(word);
  });

  it("反例：不是必須更換時，AI 也拿不到款式", () => {
    const normal = { ...lin, items: withMeasurement(lin.items, "tire", 6) };
    expect(JSON.stringify(cardContext(normal))).not.toContain("長效款");
  });
});

describe("交車說明帶入車主選的款式", () => {
  const items = cardItems(lin.items);
  const tire = items.find((i) => i.id === "tire")!;
  const key = choiceKey(tire);
  const note = (choices: Record<string, "today">, picked: Record<string, string>) =>
    handover(items, choices, lin.routine, lin.nextServiceKm, picked).done.find((d) => d.item?.id === "tire")!.note;

  it("授權後寫款式和價格", () => {
    expect(note({ [key]: "today" }, { [key]: "basic" })).toContain("基本款 NT$5,600");
  });

  it("反例：只點選、還沒授權，不寫款式", () => {
    expect(note({}, { [key]: "basic" })).toContain("款式待車主確認");
    expect(note({}, { [key]: "basic" })).not.toContain("基本款");
  });

  it("反例：沒選或選了不存在的款式，不寫款式", () => {
    expect(note({}, {})).toContain("款式待車主確認");
    expect(note({ [key]: "today" }, { [key]: "不存在" })).toContain("款式待車主確認");
  });

  it("反例：沒有款式的項目，備註不變", () => {
    const wangItems = cardItems(wang.items);
    const done = handover(wangItems, {}, wang.routine, wang.nextServiceKm).done.find((d) => d.item?.id === "brake-pad")!;
    expect(done.note).toBe("已低於安全門檻，今天更換");
  });

  it("要先選款才能授權；沒有款式的項目不用選", () => {
    expect(needsOptionPick(tire)).toBe(true);
    expect(needsOptionPick(tire, "不存在")).toBe(true);
    expect(needsOptionPick(tire, "basic")).toBe(false);
    expect(needsOptionPick(cardItems(wang.items).find((i) => i.id === "brake-pad")!)).toBe(false);
  });

  it("結論改變後，選過的款式被清掉，改回來也不復活", () => {
    const changed = cardItems(withMeasurement(lin.items, "tire", 6));
    expect(pruneChoices({ [key]: "basic" }, changed)).toEqual({});
  });
});

describe("價格資料", () => {
  it("price 是最低款的價格，AI 和檢查結果摘要講的「起」才對得上清單", () => {
    for (const v of vehicles) for (const i of v.items) {
      if (i.options) expect(i.price).toBe(Math.min(...i.options.map((o) => o.price)));
    }
  });

  it("AI 拿到的費用寫「起（依款式）」", () => {
    const tire = cardContext(lin).檢查項目.find((x) => x.來源代號 === "item:tire")!;
    expect(tire.示意費用).toBe("NT$5,600 起（依款式）");
  });

  it("反例：輪胎改成可延後時，費用不寫「起」", () => {
    const deferrable = { ...lin, items: withMeasurement(lin.items, "tire", 2) };
    const tire = cardContext(deferrable).檢查項目.find((x) => x.來源代號 === "item:tire")!;
    expect(tire.示意費用).toBe("NT$5,600");
  });
});

describe("問價格由程式照清單回答；沒有優惠資料", () => {
  const forbidAI = async (): Promise<string> => {
    throw new Error("不應該呼叫 AI");
  };

  it("問價格：列出每一款，不呼叫 AI，不轉專員", async () => {
    const r = await ask(lin, "輪胎多少錢？", forbidAI);
    for (const price of ["NT$5,600", "NT$6,400", "NT$8,400"]) expect(r.answer).toContain(price);
    expect(r.trace.noAI).toBe(true);
    expect(r.escalate).toBe(false);
  });

  it("反例：只問優惠不走清單（沒有優惠資料）", () => {
    for (const q of ["均衡款有優惠嗎？", "現在有優惠嗎？", "輪胎有打折嗎？"]) expect(optionAnswer(lin, q)).toBeUndefined();
  });

  it("議價：列出清單，也轉專員", () => {
    expect(optionAnswer(lin, "輪胎多少錢，可以算便宜一點嗎")!.escalate).toBe(true);
  });

  it("問價格順便問優惠：照清單列價格，不出現優惠", () => {
    const r = optionAnswer(lin, "輪胎多少錢，會不會有優惠？")!;
    expect(r.answer).toContain("NT$5,600");
    expect(r.answer).not.toMatch(/優惠中|原價|11\/30/);
  });

  it("反例：同時問價格和安全，安全優先，不走清單", () => {
    expect(optionAnswer(lin, "輪胎便宜但安全嗎？")).toBeUndefined();
    expect(optionAnswer(lin, "基本款便宜，會不會打滑？")).toBeUndefined();
    expect(optionAnswer(lin, "不換輪胎比較便宜嗎？")).toBeUndefined();
  });

  it("反例：問哪款適合、問風險、問別的項目，都不走清單", () => {
    expect(optionAnswer(lin, "哪一款輪胎比較適合我？")).toBeUndefined();
    expect(optionAnswer(lin, "基本款安全嗎？")).toBeUndefined();
    expect(optionAnswer(lin, "輪胎不換會怎樣？")).toBeUndefined();
    expect(optionAnswer(lin, "電瓶有打折嗎？")).toBeUndefined();
    expect(optionAnswer(lin, "長效的電瓶多少錢")).toBeUndefined();
  });

  it("反例：問延後走安全流程，不被清單蓋掉", () => {
    expect(optionAnswer(lin, "輪胎可以下個月再換嗎？比較便宜嗎")).toBeUndefined();
  });

  it("反例：輪胎不是必須更換時，不走清單", () => {
    const normal = { ...lin, items: withMeasurement(lin.items, "tire", 6) };
    expect(optionAnswer(normal, "輪胎多少錢？")).toBeUndefined();
    expect(optionAnswer(wang, "輪胎多少錢？")).toBeUndefined();
  });
});

describe("AI 依需求建議款式：程式檢查", () => {
  const TIRE = [{ id: "item:tire", conclusion: "必須更換" }];
  const askWith = (answer: string, recommendedOption = "", vehicle = lin) =>
    ask(vehicle, "我常跑高速，該選哪一款輪胎？", async () =>
      JSON.stringify({ answer, sources: ["item:tire", "driving"], escalate: false, itemConclusions: TIRE, recommendedOption }),
    );
  const GOOD = "你多半跑高速長途，建議長效款，費用 NT$8,400，預估壽命較長。最後還是由你決定。";

  it("依用車情況建議、價格正確：通過", async () => {
    const r = await askWith(GOOD, "長效款");
    expect(r.checkResult).toBe("通過");
    expect(r.answer).toBe(GOOD);
  });

  it("分情況說明、沒有建議特定一款：通過", async () => {
    expect((await askWith("多半市區可以看基本款，常跑長途可以看長效款，由你決定。")).checkResult).toBe("通過");
  });

  it("反例：建議清單上沒有的款式，攔下", async () => {
    const r = await askWith("建議頂級款，比較耐用。", "頂級款");
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toContain("不在清單上");
  });

  it("反例：recommendedOption 和回答對不上，攔下", async () => {
    expect((await askWith("建議基本款。", "長效款")).checkResult).toBe("攔下");
  });

  it("反例：用優惠當理由，攔下", async () => {
    expect((await askWith("建議均衡款，現在有優惠。", "均衡款")).checkResult).toBe("攔下");
  });

  it("反例：亂報款式價格、用 AI 不該知道的原價，攔下", async () => {
    expect((await askWith("建議長效款，費用 NT$3,900。", "長效款")).checkResult).toBe("攔下");
    expect((await askWith("建議均衡款，原本 NT$7,200。", "均衡款")).checkResult).toBe("攔下");
  });

  it("反例：說其他款不安全、一定要選，攔下", async () => {
    expect((await askWith("基本款不安全，建議長效款。", "長效款")).checkResult).toBe("攔下");
    expect((await askWith("你一定要選長效款。", "長效款")).checkResult).toBe("攔下");
  });

  it("反例：AI 自己說款式符合安全標準，攔下（卡片沒有這項資料）", async () => {
    const r = await askWith("基本款規格符合安全標準，由你決定。");
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toContain("安全資料");
    expect((await askWith("基本款胎噪 72 dB，安全上沒問題。")).checkResult).toBe("攔下");
  });

  it("近似詞：說基本款規格、胎噪高一點，不是施壓，通過", async () => {
    expect((await askWith("基本款胎噪 72 dB，長效款胎噪 69 dB，建議長效款。", "長效款")).checkResult).toBe("通過");
  });

  describe("預算", () => {
    const askBudget = (answer: string, recommendedOption: string, question = "我預算有限，輪胎選哪款？") =>
      ask(lin, question, async () =>
        JSON.stringify({ answer, sources: ["item:tire"], escalate: false, itemConclusions: TIRE, recommendedOption }),
      );

    it("預算有限建議最低價：通過", async () => {
      expect((await askBudget("預算有限可以選基本款，由你決定。", "基本款")).checkResult).toBe("通過");
    });

    it("預算有限但兼顧用途選中間款：通過", async () => {
      expect((await askBudget("常跑高速又想省，可以看均衡款，由你決定。", "均衡款", "預算不多但常跑高速，選哪款？")).checkResult).toBe("通過");
    });

    it("反例：預算有限卻建議最貴的款式，攔下", async () => {
      const r = await askBudget("建議長效款，由你決定。", "長效款");
      expect(r.checkResult).toBe("攔下");
      expect(r.blockedReason).toContain("預算有限");
    });

    it("反例：問便宜又安全，卻建議最貴的款式，攔下", async () => {
      expect((await askBudget("建議長效款，由你決定。", "長效款", "輪胎便宜但安全嗎？")).checkResult).toBe("攔下");
    });

    it("反例：「預算不是問題」不算預算有限，建議最貴款通過", async () => {
      expect((await askBudget("建議長效款，由你決定。", "長效款", "預算不是問題，輪胎選哪款？")).checkResult).toBe("通過");
    });

    it("款式建議被攔下時轉專員，不回常見問題", async () => {
      const r = await askBudget("建議長效款，由你決定。", "長效款");
      expect(r.answer).toContain("服務專員");
      expect(r.escalate).toBe(true);
    });

    it("反例：沒提預算時，建議較貴的款式不算違規", async () => {
      expect((await askBudget("建議長效款，由你決定。", "長效款", "我常跑高速，選哪款？")).checkResult).toBe("通過");
    });
  });

  it("反例：只講款式名稱也不能說可以延後", async () => {
    const r = await askWith("長效款可延後更換。", "長效款");
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toContain("延後");
    expect((await askWith("基本款可以撐到下個月再換。", "基本款")).checkResult).toBe("攔下");
  });

  it("反例：款式和金額要配對，別款的價格也不行", async () => {
    const r = await askWith("建議長效款，費用 NT$5,600。", "長效款");
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toContain("長效款");
    expect((await askWith("長效款 NT$6,400。", "長效款")).checkResult).toBe("攔下");
  });

  it("同一句有項目起價和款式價格：通過", async () => {
    const r = await askWith("輪胎 NT$5,600 起，可選長效款 NT$8,400，由你決定。", "長效款");
    expect(r.blockedReason).toBeUndefined();
  });

  it("多款並列、各自正確的金額：通過", async () => {
    expect((await askWith("基本款 NT$5,600，長效款 NT$8,400，建議長效款，由你決定。", "長效款")).blockedReason).toBeUndefined();
  });

  it("反例：這台車沒有清單卻建議款式，攔下", async () => {
    const r = await askWith("建議長效款。", "長效款", wang);
    expect(r.checkResult).toBe("攔下");
  });

  it("反例：檢查結果摘要不能建議款式", async () => {
    const r = await summarize(lin, async () =>
      JSON.stringify({ answer: "輪胎胎紋必須更換。建議長效款。", sources: ["item:tire"], escalate: false, itemConclusions: TIRE, recommendedOption: "長效款" }),
    );
    expect(r.checkResult).toBe("攔下");
  });
});

describe("技師改值後，AI 看到同一份資料", () => {
  it("改過的值會進到 AI 的卡片資料，結論重算", () => {
    const v = applyMeasurements(wang, { tire: 1 })!;
    const tire = cardContext(v).檢查項目.find((x) => x.來源代號 === "item:tire")!;
    expect(tire.量測).toBe("1 mm");
    expect(tire.結論).toBe("必須更換");
    expect(JSON.stringify(cardContext(v))).toContain("長效款");
  });

  it("畫面送來的值和原本一樣時，資料不變（備註、CCA 都留著）", () => {
    expect(applyMeasurements(wang, currentMeasurements(cardItems(wang.items)))).toBe(wang);
    expect(applyMeasurements(wang, undefined)).toBe(wang);
  });

  it("把必須更換的煞車改好：AI 看到正常，清單和風險都不見", () => {
    const v = applyMeasurements(wang, { "brake-pad": 8 })!;
    const brake = cardContext(v).檢查項目.find((x) => x.來源代號 === "item:brake-pad")!;
    expect(brake.結論).toBe("正常");
  });

  it("反例：格式不對一律拒絕", () => {
    for (const bad of [null, "1", 1, [1], { tire: "1" }, { tire: Number.NaN }, { tire: -1 }, { tire: 1001 }, { 不存在: 1 }]) {
      expect(applyMeasurements(wang, bad)).toBeNull();
    }
  });

  it("反例：超出合理範圍的量測值，API 也拒絕", () => {
    expect(applyMeasurements(wang, { tire: 30.1 })).toBeNull();
    expect(applyMeasurements(wang, { battery: 100.1 })).toBeNull();
    expect(applyMeasurements(wang, { tire: 30 })).not.toBeNull();
    expect(applyMeasurements(wang, { battery: 100 })).not.toBeNull();
  });

  it("技師輸入：邊界值可以，空白和超出範圍回錯誤訊息", () => {
    for (const ok of ["0", "1.4", "30"]) expect(measurementError("mm", ok)).toBeNull();
    for (const ok of ["0", "100"]) expect(measurementError("%", ok)).toBeNull();
    for (const empty of ["", "   "]) expect(measurementError("mm", empty)).toBe("請輸入數值");
    for (const bad of ["-0.1", "30.1", "9999", "1e5", "abc", "Infinity"]) expect(measurementError("mm", bad)).toBe("請輸入 0 到 30 mm");
    for (const bad of ["-5", "100.1"]) expect(measurementError("%", bad)).toBe("請輸入 0 到 100 %");
  });

  it("保固狀態：王先生的 AI 資料有保固到期說明，林小姐沒有設定就給 null", () => {
    expect(cardContext(wang).保固).toBe("車齡剛滿 5 年，延長保證剛到期");
    expect(cardContext(lin).保固).toBeNull();
  });

  it("反例：目視項目沒有量測值，不能改", () => {
    const visual = wang.items.find((i) => !i.measurement)!;
    expect(applyMeasurements(wang, { [visual.id]: 1 })).toBeNull();
  });
});

describe("實測抓到的誤攔", () => {
  const TIRE = [{ id: "item:tire", conclusion: "必須更換" }];
  const reply = (answer: string, itemConclusions = TIRE) => async () =>
    JSON.stringify({ answer, sources: ["item:tire"], escalate: true, itemConclusions });

  it("輪胎的回答提到「煞車距離」，不等於建議換正常的煞車皮", async () => {
    const r = await ask(lin, "輪胎可以延後嗎？", reply("輪胎量測為 1.4 mm，已低於安全門檻 1.6 mm，無法延後。胎紋不足會使煞車距離變長，建議盡快更換。"));
    expect(r.blockedReason).toBeUndefined();
  });

  it("反例：真的建議換正常的煞車皮，還是要攔", async () => {
    const r = await ask(lin, "輪胎可以延後嗎？", reply("輪胎無法延後。前煞車來令片也建議今天換。"));
    expect(r.checkResult).toBe("攔下");
    expect(r.blockedReason).toContain("前煞車來令片");
  });

  it("「若延後更換會降低煞車效能」是在講風險，不是說可以延後", async () => {
    const r = await ask(wang, "煞車下個月再換可以嗎？", async () =>
      JSON.stringify({
        answer: "前煞車來令片量測只有 2 mm，已經低於安全門檻 3 mm，若延後更換可能會在行駛中降低煞車效能，建議這次就更換。",
        sources: ["item:brake-pad"],
        escalate: true,
        itemConclusions: [{ id: "item:brake-pad", conclusion: "必須更換" }],
      }),
    );
    expect(r.blockedReason).toBeUndefined();
  });

  it("反例：說若延後也沒關係，還是要攔", async () => {
    const r = await ask(wang, "煞車下個月再換可以嗎？", async () =>
      JSON.stringify({
        answer: "前煞車來令片若延後更換也沒關係。",
        sources: ["item:brake-pad"],
        escalate: true,
        itemConclusions: [{ id: "item:brake-pad", conclusion: "必須更換" }],
      }),
    );
    expect(r.checkResult).toBe("攔下");
  });
});

describe("另一台車的款式提示", () => {
  it("王先生的卡提示林小姐的輪胎有款式可選", () => {
    expect(cardProps(wang).others.find((o) => o.id === "lin")!.optionHint).toBe("林小姐的輪胎胎紋要換，有 3 款可選");
  });

  it("反例：王先生沒有必須更換且有款式的項目，林小姐的卡不提示", () => {
    expect(cardProps(lin).others.find((o) => o.id === "wang")!.optionHint).toBeUndefined();
  });
});
