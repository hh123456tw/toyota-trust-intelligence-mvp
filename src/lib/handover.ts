// 交車說明和專員建議說法：都由規則引擎的結論直接組成，不呼叫 AI。

import type { CardItem } from "./card";
import type { Conclusion } from "./rules";
import { formatPrice } from "./vehicles";

export type Choice = "today" | "defer";

// 車主選擇的鍵：項目＋結論。技師改值讓結論改變後，舊的選擇就對不上，不會被沿用。
export const choiceKey = (item: CardItem) => `${item.id}:${item.verdict.conclusion}`;

// 結論改變時刪掉該項的舊選擇；否則 60% → 80% → 60% 這種往返會讓舊選擇復活。
export function pruneChoices<T>(choices: Record<string, T>, items: CardItem[]): Record<string, T> {
  const live = new Set(items.map(choiceKey));
  return Object.fromEntries(Object.entries(choices).filter(([k]) => live.has(k)));
}

// 有款式可選時，要先選一款才能授權。
export const needsOptionPick = (item: CardItem, picked?: string) =>
  !!item.options && !item.options.some((o) => o.id === picked);

export type Handover = {
  // 今天完成：定期保養項目（沒有 item）、車主已授權的必須更換、車主選今天換的可延後項目。
  done: { name: string; note: string; item?: CardItem }[];
  // 待車主授權：必須更換但車主還沒按「今天授權處理」。不替車主寫成今天完成。
  pending: { name: string; note: string; item: CardItem }[];
  // 今天延後：可延後且車主選延後。
  deferred: { item: CardItem; months: number }[];
  // 尚未選擇：可延後且車主還沒選；沒選就用預設的提醒月數。
  undecided: { item: CardItem; months: number }[];
  // 目前不用換：結論為正常的項目。
  fine: CardItem[];
  reminders: string[];
};

export function handover(
  items: CardItem[],
  choices: Record<string, Choice>,
  routine: string[],
  nextServiceKm: number,
  picked: Record<string, string> = {},
): Handover {
  const by = (c: Conclusion) => items.filter((i) => i.verdict.conclusion === c);
  const chose = (c: Choice) => (i: CardItem) => choices[choiceKey(i)] === c;
  const pickedNote = (item: CardItem) => {
    if (!item.options) return "";
    const key = choiceKey(item);
    const o = choices[key] === "today" ? item.options.find((x) => x.id === picked[key]) : undefined;
    return o ? `（${o.name} ${formatPrice(o.price)}）` : "（款式待車主確認）";
  };
  const withMonths = (item: CardItem) => ({ item, months: item.verdict.reminderMonths! });
  const today = by("可延後").filter(chose("today"));
  const deferred = by("可延後").filter(chose("defer")).map(withMonths);
  const undecided = by("可延後").filter((i) => !choices[choiceKey(i)]).map(withMonths);
  return {
    done: [
      ...routine.map((name) => ({ name, note: "定期保養" })),
      ...by("必須更換")
        .filter(chose("today"))
        .map((item) => ({ name: item.name, note: `已低於安全門檻，今天更換${pickedNote(item)}`, item })),
      ...today.map((item) => ({ name: item.name, note: "車主選擇今天一併更換", item })),
    ],
    pending: by("必須更換")
      .filter((i) => !chose("today")(i))
      .map((item) => ({ name: item.name, note: `已低於安全門檻，待車主授權，專員會當面確認${pickedNote(item)}`, item })),
    deferred,
    undecided,
    fine: by("正常"),
    reminders: [
      ...[...deferred, ...undecided].map((d) => `${d.months} 個月後${d.item.name}複查`),
      `約 ${nextServiceKm.toLocaleString()} km 後定期保養`,
    ],
  };
}

// 專員向車主說明時的建議說法，順序：必須更換 → 可延後 → 正常。
export function staffLine(items: CardItem[]): string {
  const names = (c: Conclusion) =>
    items
      .filter((i) => i.verdict.conclusion === c)
      .map((i) => i.name)
      .join("、");
  const [must, defer, fine] = [names("必須更換"), names("可延後"), names("正常")];
  return [must && `今天優先處理${must}。`, defer && `${defer}可以延後。`, fine && `${fine}目前不用換。`].join("");
}
