// 車主偏好：只影響說明的重點、款式建議和回廠提醒的說法，不影響結論、安全門檻和價格（見 GLOSSARY.md）。
import type { Verdict } from "./rules";
import type { Vehicle } from "./vehicles";

// 偏好的題目和選項只定義在這裡：問卷（text）、API 驗證（options）、實測題目的「X改成Y」（label）共用。
// 處理方式、最在意是長期偏好；近期長途行程、最近有異常是本次情境。全部可選。
export const PREFERENCE_QUESTIONS = [
  { key: "handling", label: "處理方式", text: "這次想一次處理完，還是能等就等？", options: ["一次處理完", "能等就等"] },
  { key: "priority", label: "最在意", text: "選零件最在意什麼？", options: ["價格", "耐用度", "安靜和舒適"] },
  { key: "longTrip", label: "近期長途行程", text: "接下來 3 個月有沒有長途行程或載家人出遊？", options: ["有", "沒有"] },
  { key: "recentIssue", label: "最近有異常", text: "最近開車有沒有覺得哪裡怪怪的？", options: ["有", "沒有"] },
] as const;

type Question = (typeof PREFERENCE_QUESTIONS)[number];
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
    p.handling === "能等就等" && `可以先不換，${verdict.reminderMonths} 個月後提醒你回來複查。`,
    p.handling === "一次處理完" && "今天一起換，下次不用再跑一趟。",
    p.longTrip === "有" && "出發前可以請專員安排再測一次。",
  ].filter(Boolean);
  return lines.length ? lines.join("") : undefined;
}

// 「你的偏好」區塊顯示的答案，依題目順序；沒填的題目不顯示。
export function preferenceLabels(p: OwnerPreferences): string[] {
  return [
    p.handling,
    p.priority && `最在意${p.priority}`,
    p.longTrip && `近期${p.longTrip}長途行程`,
    p.recentIssue && `最近${p.recentIssue}異常`,
  ].filter((s): s is string => !!s);
}

// 接待摘要最後那一行：由規則產生，不交給 AI 寫。只列會影響專員怎麼開口的項目：
// 「沒有長途行程」「沒有異常」不列；有異常時只寫請技師確認。車主描述只轉給技師，不寫進摘要。
export function preferenceSummaryLine(p: OwnerPreferences | undefined): string {
  if (!p) return "";
  const labels = [p.handling, p.priority && `最在意${p.priority}`, p.longTrip === "有" && "近期有長途行程"].filter(Boolean);
  return (labels.length ? `車主偏好：${labels.join("、")}。` : "") + (p.recentIssue === "有" ? "車主提到最近有異常，請技師確認。" : "");
}
