// 在原廠做的差別（示意）：只寫可查證的事實，正式內容待和泰確認。
// 不和外面的保養廠比較價格或品質，也不寫保固年限等沒查證的數字。
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
    text: "在原廠更換的原廠零件有零件保固，保固條件以服務廠說明為準（示意）。",
  },
];

export const dealerSource = (f: DealerFact) => `dealer:${f.id}`;

export function dealerFactLabel(key: string): string | undefined {
  const fact = DEALER_FACTS.find((f) => dealerSource(f) === key);
  return fact && `在原廠做的差別（示意）：${fact.title}`;
}
