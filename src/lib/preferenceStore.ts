// 車主偏好存在這支手機的瀏覽器（示意）；正式版才存進和泰系統。
import { MAX_ISSUE_NOTE, parsePreferences, type OwnerPreferences } from "./preferences";

// 問卷草稿：跳過的題目是 undefined。整理後只留有答案的欄位，描述只在有異常時保留。
export function cleanPreferences(draft: OwnerPreferences): OwnerPreferences {
  const { issueNote, ...answers } = draft;
  const p = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined)) as OwnerPreferences;
  const note = issueNote?.trim().slice(0, MAX_ISSUE_NOTE);
  if (p.recentIssue === "有" && note) p.issueNote = note;
  return p;
}

// 林小姐按「跳過」：記下來，重新整理後不再跳出邀請。
export type StoredPreferences = OwnerPreferences | "skipped" | undefined;

const keyOf = (vehicleId: string) => `owner-preferences:${vehicleId}`;
// 這次開著的頁面寫過的值。瀏覽器不能存檔（無痕、被封鎖）時，卡片仍照改過的值顯示。
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

// 給 useSyncExternalStore 用：回傳字串，同樣內容就是同一個快照。
export function readPreferences(vehicleId: string): string | null {
  const key = keyOf(vehicleId);
  if (memory.has(key)) return memory.get(key)!;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function savePreferences(vehicleId: string, value: OwnerPreferences | "skipped") {
  const key = keyOf(vehicleId);
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    globalThis.localStorage?.setItem(key, raw);
  } catch {
    // 存不了就只留在這次的頁面；重新整理後回到預設。
  }
  listeners.forEach((l) => l());
}

export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// 讀回保存的字串。沒存過或資料壞了就用預設，卡片照常顯示。
export function storedPreferences(raw: string | null, fallback: OwnerPreferences | undefined): StoredPreferences {
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === "skipped") return value;
    return parsePreferences(value) ?? fallback;
  } catch {
    return fallback;
  }
}
