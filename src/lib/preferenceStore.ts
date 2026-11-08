// 車主偏好分兩層存（示意）：長期偏好以車主為鍵，下次回廠沿用；本次情況以這次工單（車輛＋檢查日期）為鍵，換工單就不沿用。
// 示意版存在這支手機的瀏覽器；正式版由專員在接待時用平板確認，寫回和泰車主檔。
import {
  LAYER_KEYS,
  MAX_ISSUE_NOTE,
  parsePreferences,
  RENAMED_HANDLING,
  splitPreferences,
  type OwnerPreferences,
  type PreferenceLayer,
} from "./preferences";

// 問卷草稿：跳過的題目是 undefined。整理後只留有答案的欄位，描述只在有異常時保留。
export function cleanPreferences(draft: OwnerPreferences): OwnerPreferences {
  const { issueNote, ...answers } = draft;
  const p = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined)) as OwnerPreferences;
  const note = issueNote?.trim().slice(0, MAX_ISSUE_NOTE);
  if (p.recentIssue === "有" && note) p.issueNote = note;
  return p;
}

// 林小姐按「跳過」：記在這次工單，重新整理後不再跳出邀請；下次回廠再邀請。
export type StoredPreferences = OwnerPreferences | "skipped" | undefined;

// 哪位車主、哪一張工單。工單用車輛＋檢查日期代表（示意）。
export type PreferenceScope = { ownerId: string; vehicleId: string; inspectedAt: string };

const keysOf = (s: PreferenceScope) => ({
  long: `owner-preferences:long:${s.ownerId}`,
  visit: `owner-preferences:visit:${s.vehicleId}:${s.inspectedAt}`,
  // 11/8 以前整份偏好以車輛為鍵。只讀不寫，存過新格式就刪掉。
  legacy: `owner-preferences:${s.vehicleId}`,
});
// 瀏覽器不能存檔（無痕、被封鎖）時，這次開著的頁面寫過的值。只有這時才蓋過 localStorage。
const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();

function readKey(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeKey(key: string, raw: string | null) {
  try {
    if (!globalThis.localStorage) throw new Error("沒有 localStorage");
    if (raw === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    // 存不了就只留在這次的頁面；重新整理後回到預設。
    memory.set(key, raw);
  }
}

// 給 useSyncExternalStore 用：三份保存的字串合成一個字串，同樣內容就是同一個快照。
export function readPreferences(scope: PreferenceScope): string {
  const k = keysOf(scope);
  return JSON.stringify([readKey(k.long), readKey(k.visit), readKey(k.legacy)]);
}

export function savePreferences(scope: PreferenceScope, value: OwnerPreferences | "skipped") {
  const k = keysOf(scope);
  if (value === "skipped") {
    writeKey(k.visit, JSON.stringify(value));
  } else {
    const { long, visit } = splitPreferences(value);
    writeKey(k.long, JSON.stringify(long));
    writeKey(k.visit, JSON.stringify(visit));
    writeKey(k.legacy, null);
  }
  listeners.forEach((l) => l());
}

// 同一頁的改動由 savePreferences 通知；另一個分頁（例如技師頁）改的，瀏覽器發 storage 事件。
export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  globalThis.window?.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    globalThis.window?.removeEventListener("storage", listener);
  };
}

// 讀回一份保存的字串。沒存過或資料壞了回傳 null，由呼叫的一方改用預設。
function parseStored(raw: unknown): StoredPreferences | null {
  if (typeof raw !== "string") return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === "skipped") return value;
    // 只在讀回保存的資料時換舊名稱；API 照樣只收新名稱。
    const handling = (value as { handling?: unknown } | null)?.handling;
    const migrated =
      typeof handling === "string" && Object.hasOwn(RENAMED_HANDLING, handling)
        ? { ...(value as object), handling: RENAMED_HANDLING[handling] }
        : value;
    return parsePreferences(migrated);
  } catch {
    return null;
  }
}

// 一層的資料只能有那一層的欄位；放錯層就當壞資料。只有本次情況可以是「跳過」。
function parseLayer(raw: unknown, layer: PreferenceLayer): StoredPreferences | null {
  const v = parseStored(raw);
  if (v === "skipped") return layer === "visit" ? v : null;
  const allowed = layer === "visit" ? [...LAYER_KEYS.visit, "issueNote"] : LAYER_KEYS.long;
  return v && Object.keys(v).every((k) => allowed.includes(k)) ? v : null;
}

// 合成一份給畫面和 API 用的偏好。每一層各自決定：新格式 → 舊格式拆出來的那一層 → 預設（vehicles.ts，示意：車主檔已有的偏好）。
// shortcut: 舊格式沒有工單日期，存過新格式前，舊資料的本次情況會跟到下一張工單；示意資料不會換工單，正式版沒有舊格式。
export function storedPreferences(snapshot: string | null, fallback: OwnerPreferences | undefined): StoredPreferences {
  let raws: unknown = [];
  try {
    raws = snapshot === null ? [] : JSON.parse(snapshot);
  } catch {}
  const [longRaw, visitRaw, legacyRaw] = Array.isArray(raws) ? raws : [];
  const legacy = parseStored(legacyRaw);
  const old = typeof legacy === "object" && legacy ? splitPreferences(legacy) : undefined;
  const def = splitPreferences(fallback);
  const long = parseLayer(longRaw, "long") ?? old?.long ?? def.long;
  const visit = parseLayer(visitRaw, "visit") ?? (legacy === "skipped" ? legacy : old?.visit) ?? def.visit;
  const visitPrefs = typeof visit === "object" ? visit : undefined;
  if (typeof long !== "object" && !visitPrefs) return visit;
  return { ...(typeof long === "object" ? long : {}), ...visitPrefs };
}
