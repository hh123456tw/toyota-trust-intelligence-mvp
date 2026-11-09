// 在原廠做的差別（示意）：只寫可查證的事實，正式內容待和泰確認。
// 不和外面的保養廠比較價格或品質。保固年限只寫官網查得到的（和泰官網〈愛車保證〉https://www.toyota.com.tw/owner_guarantee.aspx，2026-11-08 查）。
// 卡片在可延後的項目顯示，AI 用來源代號 dealer:<id> 引用。

export type DealerFact = { id: string; title: string; text: string };

export const DEALER_FACTS: DealerFact[] = [
  {
    id: "record",
    title: "保養紀錄延續",
    text: "這次的量測會留在原廠的保養紀錄，下次回廠時技師看得到，可以和這次比較變化（示意）。",
  },
  {
    id: "parts-warranty",
    title: "原廠零件保固",
    // 輪胎、電瓶官網另列條件，不能套用「一年或 20,000 公里」。
    text: "在原廠更換的有費正廠零件，一般有一年或 20,000 公里的零件保證，以先到者為準。電瓶、輪胎另有條件：國產電瓶 12 個月或 20,000 公里；原廠輪胎自更換日起 3 年內製造品質不良，依剩餘胎紋比例補償（和泰官網）。",
  },
];

export const dealerSource = (f: DealerFact) => `dealer:${f.id}`;

export function dealerFactLabel(key: string): string | undefined {
  const fact = DEALER_FACTS.find((f) => dealerSource(f) === key);
  return fact && `在原廠做的差別（示意）：${fact.title}`;
}
