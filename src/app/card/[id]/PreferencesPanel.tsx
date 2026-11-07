"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  cleanPreferences,
  readPreferences,
  savePreferences,
  storedPreferences,
  subscribePreferences,
  type StoredPreferences,
} from "@/lib/preferenceStore";
import { MAX_ISSUE_NOTE, PREFERENCE_QUESTIONS, preferenceLabels, type OwnerPreferences } from "@/lib/preferences";

// 卡片頁和技師頁共用：同一支手機讀同一份保存的偏好，改了兩邊一起更新（另一個分頁改的也會更新）。
// stored 可能是「skipped」；preferences 是實際要用的偏好，跳過或沒填時是 undefined。
export function useOwnerPreferences(vehicleId: string, fallback: OwnerPreferences | undefined) {
  // 伺服器端沒有瀏覽器保存，先用預設；載入後換成這支手機存的值。
  const raw = useSyncExternalStore(subscribePreferences, () => readPreferences(vehicleId), () => null);
  const stored = useMemo(() => storedPreferences(raw, fallback), [raw, fallback]);
  return {
    stored,
    preferences: typeof stored === "object" ? stored : undefined,
    save: (v: OwnerPreferences | "skipped") => savePreferences(vehicleId, v),
  };
}

const CHIP = "min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors";

// 4 題點選（題目在 PREFERENCE_QUESTIONS）。不問系統已經知道的事（例如行車摘要的短程比例）。
export default function PreferencesPanel(props: {
  value: StoredPreferences;
  saved: OwnerPreferences | undefined;
  onSave: (v: OwnerPreferences | "skipped") => void;
}) {
  const { value, saved, onSave } = props;
  const [draft, setDraft] = useState<OwnerPreferences | null>(null);

  return (
    <section aria-label="你的偏好" className="mx-4 mt-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold">你的偏好</h2>

      {draft ? (
        <form
          className="mt-2 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(cleanPreferences(draft));
            setDraft(null);
          }}
        >
          <p className="text-sm text-muted">約 1 分鐘，每題都可以跳過。</p>
          {PREFERENCE_QUESTIONS.map((q) => (
            <fieldset key={q.key}>
              <legend className="text-sm font-semibold">{q.text}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...q.options, undefined].map((o) => {
                  const on = draft[q.key] === o;
                  return (
                    <button
                      key={o ?? "skip"}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft({ ...draft, [q.key]: o })}
                      className={`${CHIP} ${on ? "border-ink bg-ink text-white" : "border-line bg-white"} ${o ? "" : "font-medium text-muted"}`}
                    >
                      {o ?? "跳過這題"}
                    </button>
                  );
                })}
              </div>
              {q.key === "recentIssue" && draft.recentIssue === "有" && (
                <label className="mt-2 block text-sm">
                  <span className="text-muted">哪裡怪怪的？（選填，會轉給技師）</span>
                  <textarea
                    value={draft.issueNote ?? ""}
                    maxLength={MAX_ISSUE_NOTE}
                    rows={2}
                    onChange={(e) => setDraft({ ...draft, issueNote: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-line bg-paper px-3 py-2 outline-none focus:border-ink-2 focus:bg-white"
                  />
                </label>
              )}
            </fieldset>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                // 沒填過的人跳過：記下來，不再跳出邀請。已有偏好的人跳過：維持原本的偏好。
                if (!saved) onSave("skipped");
                setDraft(null);
              }}
              className={`${CHIP} border-line bg-white`}
            >
              跳過
            </button>
            <button type="submit" className={`${CHIP} border-ink bg-ink text-white`}>
              完成
            </button>
          </div>
        </form>
      ) : saved ? (
        <>
          <ul className="mt-2 flex flex-wrap gap-2">
            {preferenceLabels(saved).map((l) => (
              <li key={l} className="rounded-full bg-paper px-3 py-1 text-sm font-medium">
                {l}
              </li>
            ))}
          </ul>
          {preferenceLabels(saved).length === 0 && <p className="mt-1 text-sm text-muted">每題都跳過了。</p>}
          {saved.recentIssue === "有" && (
            <p role="status" className="mt-2 rounded-xl bg-defer-soft px-3 py-2.5 text-sm font-semibold text-defer">
              已記下，會請技師確認（示意）
              {saved.issueNote && <span className="mt-1 block font-normal break-words text-ink">你說：{saved.issueNote}</span>}
            </p>
          )}
          <button type="button" onClick={() => setDraft(saved)} className={`${CHIP} mt-2 border-line bg-white`}>
            修改
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm">{value === "skipped" ? "你跳過了偏好問卷，卡片照常顯示。" : "等待時花 1 分鐘，告訴我們你的偏好。"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setDraft({})} className={`${CHIP} border-ink bg-ink text-white`}>
              {value === "skipped" ? "填偏好" : "開始填"}
            </button>
            {value !== "skipped" && (
              <button type="button" onClick={() => onSave("skipped")} className={`${CHIP} border-line bg-white`}>
                跳過
              </button>
            )}
          </div>
        </>
      )}

      <p className="mt-3 text-xs text-muted">
        偏好只用在這張決策卡，不拿去做行銷；只存在這支手機的瀏覽器（示意）。只調整說明的方式，結論、安全門檻和價格不變。
      </p>
    </section>
  );
}
