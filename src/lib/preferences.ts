// 車主偏好：只影響說明的重點、款式建議和回廠提醒的說法，不影響結論、安全門檻和價格（見 GLOSSARY.md）。
import type { Verdict } from "./rules";
import type { Vehicle } from "./vehicles";

// 處理方式的兩個選項：答案檢查、「依你的偏好」那一句都用這兩個常數，改字只改這裡。
export const HANDLING = { once: "今天一起換，少跑一趟", wait: "定期追蹤，到時再換" } as const;
// 11/8 改名前的舊選項。車主手機裡可能還存著，讀回時換成新名稱，不讓整份偏好退回預設。
export const RENAMED_HANDLING: Record<string, string> = { 一次處理完: HANDLING.once, 能等就等: HANDLING.wait };

// 偏好的題目和選項只定義在這裡：問卷（text）、API 驗證（options）、實測題目的「X改成Y」（label）共用。
// layer：long 是長期偏好（存車主檔，下次回廠沿用）；visit 是本次情況（只用這張工單）。全部可選。
export const PREFERENCE_QUESTIONS = [
  { key: "handling", layer: "long", label: "處理方式", text: "保養時你通常想今天一起換、少跑一趟，還是定期追蹤、到時再換？", options: [HANDLING.once, HANDLING.wait] },
  { key: "priority", layer: "long", label: "最在意", text: "選零件最在意什麼？", options: ["價格", "耐用度", "安靜和舒適"] },
  { key: "longTrip", layer: "visit", label: "近期長途行程", text: "接下來 3 個月有沒有長途行程或載家人出遊？", options: ["有", "沒有"] },
  { key: "recentIssue", layer: "visit", label: "最近有異常", text: "最近開車有沒有覺得哪裡怪怪的？", options: ["有", "沒有"] },
] as const;

type Question = (typeof PREFERENCE_QUESTIONS)[number];
export type PreferenceLayer = Question["layer"];
export const LAYER_KEYS = {
  long: PREFERENCE_QUESTIONS.filter((q) => q.layer === "long").map((q) => q.key),
  visit: PREFERENCE_QUESTIONS.filter((q) => q.layer === "visit").map((q) => q.key),
} as Record<PreferenceLayer, string[]>;
export type OwnerPreferences = { [Q in Question as Q["key"]]?: Q["options"][number] } & {
  // 只有最近有異常時可以附：車主自己的描述，只轉給技師。
  issueNote?: string;
};

const CHOICES: Record<string, readonly string[]> = Object.fromEntries(PREFERENCE_QUESTIONS.map((q) => [q.key, q.options]));
export const MAX_ISSUE_NOTE = 200;

// 和 applyMeasurements 同一種寫法：值來自瀏覽器，格式不對回傳 null，由 API 回錯誤；沒送就回傳原本的車輛資料。
export function applyPreferences(vehicle: Vehicle, raw: unknown): Vehicle | null {
  if (raw === undefined) return vehicle;
  const preferences = parsePreferences(raw);
  return preferences && { ...vehicle, preferences };
}

// 檢查偏好格式：API 和讀回瀏覽器保存的資料共用同一套規則。
export function parsePreferences(raw: unknown): OwnerPreferences | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prefs = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(prefs)) {
    if (key === "issueNote") {
      if (prefs.recentIssue !== "有" || typeof value !== "string" || value.length > MAX_ISSUE_NOTE) return null;
    } else if (!Object.hasOwn(CHOICES, key) || !CHOICES[key].includes(value as string)) {
      return null;
    }
  }
  return { ...prefs } as OwnerPreferences;
}

// 「依你的偏好」那一句：由規則產生，不經 AI；只加在可延後的項目。結論本身不看偏好。
export function preferenceNote(p: OwnerPreferences | undefined, verdict: Verdict): string | undefined {
  if (!p || verdict.conclusion !== "可延後") return undefined;
  const lines = [
    p.handling === HANDLING.wait && `可以先不換，${verdict.reminderMonths} 個月後提醒你回來複查。`,
    p.handling === HANDLING.once && "今天一起換，下次不用再跑一趟。",
    p.longTrip === "有" && "出發前可以請專員安排再測一次。",
  ].filter(Boolean);
  return lines.length ? lines.join("") : undefined;
}

// 拆成兩層存放。異常描述跟著「最近有異常」，屬於本次情況。API 和提示詞仍用合在一起的扁平格式。
export function splitPreferences(p: OwnerPreferences | undefined): Record<PreferenceLayer, OwnerPreferences | undefined> {
  if (!p) return { long: undefined, visit: undefined };
  const pick = (keys: string[]) => Object.fromEntries(Object.entries(p).filter(([k]) => keys.includes(k))) as OwnerPreferences;
  return { long: pick(LAYER_KEYS.long), visit: pick([...LAYER_KEYS.visit, "issueNote"]) };
}

const LABEL: Record<Question["key"], (v: string) => string> = {
  handling: (v) => v,
  priority: (v) => `最在意${v}`,
  longTrip: (v) => `近期${v}長途行程`,
  recentIssue: (v) => `最近${v}異常`,
};

// 「你的偏好」區塊顯示的答案，依題目順序；沒填的題目不顯示。給 layer 時只列那一層。
export function preferenceLabels(p: OwnerPreferences, layer?: PreferenceLayer): string[] {
  return PREFERENCE_QUESTIONS.filter((q) => !layer || q.layer === layer).flatMap((q) => {
    const v = p[q.key];
    return v ? [LABEL[q.key](v)] : [];
  });
}

// 接待摘要的偏好兩行：由規則產生，不交給 AI。和 preferenceSummaryLine 一樣只列有意義的項目，車主描述不寫進來。
export function preferenceLayerLines(p: OwnerPreferences | undefined): string[] {
  if (!p) return [];
  const long = [p.handling, p.priority && `最在意${p.priority}`].filter(Boolean);
  const visit = [p.longTrip === "有" && "近期有長途行程", p.recentIssue === "有" && "最近有異常，請技師確認"].filter(Boolean);
  return [long.length ? `長期偏好：${long.join("、")}` : "", visit.length ? `本次情況：${visit.join("、")}` : ""].filter(Boolean);
}

// 檢查結果摘要最後那一行：由規則產生，不交給 AI 寫。只列會影響專員怎麼開口的項目：
// 「沒有長途行程」「沒有異常」不列；有異常時只寫請技師確認。車主描述只轉給技師，不寫進摘要。
export function preferenceSummaryLine(p: OwnerPreferences | undefined): string {
  if (!p) return "";
  const labels = [p.handling, p.priority && `最在意${p.priority}`, p.longTrip === "有" && "近期有長途行程"].filter(Boolean);
  return (labels.length ? `車主偏好：${labels.join("、")}。` : "") + (p.recentIssue === "有" ? "車主提到最近有異常，請技師確認。" : "");
}
