// 車主偏好：只影響說明的重點、款式建議和回廠提醒的說法，不影響結論、安全門檻和價格（見 GLOSSARY.md）。
import type { Verdict } from "./rules";
import type { Vehicle } from "./vehicles";

// 處理方式、最在意是長期偏好；近期長途行程、最近有異常是本次情境。全部可選。
export type OwnerPreferences = {
  handling?: "一次處理完" | "能等就等";
  priority?: "價格" | "耐用度" | "安靜和舒適";
  longTrip?: "有" | "沒有";
  recentIssue?: "有" | "沒有";
  // 只有最近有異常時可以附：車主自己的描述，只轉給技師。
  issueNote?: string;
};

const CHOICES: Record<Exclude<keyof OwnerPreferences, "issueNote">, readonly string[]> = {
  handling: ["一次處理完", "能等就等"],
  priority: ["價格", "耐用度", "安靜和舒適"],
  longTrip: ["有", "沒有"],
  recentIssue: ["有", "沒有"],
};
const MAX_ISSUE_NOTE = 200;

// 和 applyMeasurements 同一種寫法：值來自瀏覽器，格式不對回傳 null，由 API 回錯誤；沒送就回傳原本的車輛資料。
export function applyPreferences(vehicle: Vehicle, raw: unknown): Vehicle | null {
  if (raw === undefined) return vehicle;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prefs = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(prefs)) {
    if (key === "issueNote") {
      if (prefs.recentIssue !== "有" || typeof value !== "string" || value.length > MAX_ISSUE_NOTE) return null;
    } else if (!(key in CHOICES) || !CHOICES[key as keyof typeof CHOICES].includes(value as string)) {
      return null;
    }
  }
  return { ...vehicle, preferences: { ...prefs } as OwnerPreferences };
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
