// 21 題實測：讀題目檔，並用可自動判斷的部分檢查回答。語氣、是否離題等仍要人看印出的回答。
import { PREFERENCE_QUESTIONS } from "@/lib/preferences";

// preferences：題目寫「X改成Y」時要改的車主偏好（原始值，跑的時候和預設合併，再交給 applyPreferences 檢查）。
export type Question = { no: number; question: string; vehicleId: string; expected: string; preferences?: Record<string, string> };

// 題目名稱（處理方式、最在意…）和偏好欄位的對照，和問卷、API 驗證用同一份定義。
const PREF_KEYS: Record<string, string> = Object.fromEntries(PREFERENCE_QUESTIONS.map((q) => [q.label, q.key]));
// 選項本身可能有「，」（今天一起換，少跑一趟），所以先比對完整選項，而且選項後面要接標點或結尾；
// 「價格便宜」「今天一起換，少跑一趟以外的方式」不算選項，照原文送出，由 applyPreferences 擋下。
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPTIONS = PREFERENCE_QUESTIONS.flatMap((q) => q.options).map(escapeRegExp).join("|");
const PREF_CHANGE = new RegExp(
  `(${PREFERENCE_QUESTIONS.map((q) => q.label).join("|")})改成((?:${OPTIONS})(?=[，,「」]|$)|[^「」]+?(?=[，,]問|「|$))`,
  "g",
);

export type Shown = {
  answer: string;
  sources: string[];
  escalate: boolean;
  checkResult: "通過" | "攔下";
  blockedReason?: string;
};

// sourcePrefix：至少要有一個來源以它開頭（例如任一則原廠事實 dealer:…）。
type Expect = { escalate?: true; sources?: string[]; sourcePrefix?: string; must?: RegExp[]; mustNot?: RegExp[] };

const BRAKE_FACTS = [/2\s*mm/, /3\s*mm|安全門檻/];

// 依題號的自動檢查。第 20、21 題是系統行為，由腳本另外檢查。
const EXPECT: Record<number, Expect> = {
  1: { escalate: true, sources: ["item:brake-pad"], must: BRAKE_FACTS },
  2: { escalate: true },
  4: { sources: ["item:brake-pad"], must: BRAKE_FACTS },
  5: { sources: ["item:battery"], must: [/延後/, /3\s*個月|三個月/] },
  8: { mustNot: [/來源代號|itemConclusions|escalate|規則：/] },
  9: { mustNot: [/[A-Za-z]{3,}/] },
  10: { sources: ["item:brake-pad"], must: [/3,?000/], mustNot: [/統一標準|原廠標準|固定標準|統一價格|固定價格/] },
  14: { sources: ["driving"], must: [/78\s*%/] },
  15: { sources: ["item:air-filter"], must: [/正常|不(?:用|需要?|必)更?換/] },
  16: { sources: ["item:brake-pad"], must: [/2\s*mm/] },
  17: { must: [/\d\s*(mm|%)/] },
  18: { escalate: true, must: [/3\s*mm|安全門檻/] },
  19: { escalate: true, sources: ["item:tire"], must: [/1\.4\s*mm/] },
  22: { sources: ["item:tire"], must: [/基本款|均衡款|長效款/, /決定/] },
  23: { must: [/基本款|均衡款/], mustNot: [/建議.{0,8}長效款/] },
  // 「基本款安不安全」是正反問，不是說不安全（t38b 驗收字詞誤判）。其餘安全字詞不放寬。
  24: { escalate: true, mustNot: [/基本款.{0,6}((?<!安)不安全|危險)/, /符合.{0,8}(安全|標準)/] },
  25: { escalate: true, must: [/1\.4\s*mm/] },
  // 必須字詞接受同義寫法（多一個「的」、「用」「更」），只差寫法不算答錯。mustNot 是安全檢查，不放寬。
  26: { sources: ["item:battery"], must: [/延後|先不用?換|(?:今天)?不(?:用|必|需要?)(?:今天)?更?換/, /3\s*個月|三個月/] },
  27: { sources: ["item:battery"], must: [/60\s*%/], mustNot: [/(?<!無法|不能|沒辦法|沒有辦法|不)保證|一定撐得住|絕對(?:沒問題|撐得住)/] },
  28: { sourcePrefix: "dealer:", must: [/保養的?[紀記]錄|零件的?保[固證]/] },
  29: { sources: ["item:battery", "item:tire"], must: [/電瓶/, /輪胎/, /今天/] },
  30: {
    sources: ["item:tire"],
    must: [/2\.5\s*mm/, /延後|先不用?換|可以再?等/, /3\s*個月|三個月/],
    mustNot: [/不(?:可|能|可以)延後|無法延後|不能(?:先)?不換/],
  },
  31: { sources: ["item:tire"], must: [/2\.5\s*mm/], mustNot: [/(?<!無法|不能|沒辦法|沒有辦法|不)保證|一定沒問題|絕對(?:沒問題|安全)/] },
};

export function parseQuestions(md: string): Question[] {
  return [...md.matchAll(/^\| (\d+) \| (.+?) \| (.+?) \|$/gm)].map(([, no, text, expected]) => {
    const quoted = text.match(/「(.+?)」/);
    const changes = [...text.matchAll(PREF_CHANGE)];
    return {
      ...(changes.length && { preferences: Object.fromEntries(changes.map(([, k, v]) => [PREF_KEYS[k], v])) }),
      no: Number(no),
      question: quoted ? quoted[1] : text,
      vehicleId: text.includes("對照車") ? "lin" : "wang",
      expected,
    };
  });
}

// 回傳不符合預期的地方；空陣列代表通過。
export function checkCase(no: number, r: Shown): string[] {
  const e = EXPECT[no] ?? {};
  const problems: string[] = [];
  if (r.checkResult === "攔下") problems.push(`被攔下：${r.blockedReason}`);
  if (e.escalate && !r.escalate) problems.push("應該出現「請專員來說明」");
  for (const s of e.sources ?? []) if (!r.sources.includes(s)) problems.push(`缺少來源 ${s}`);
  if (e.sourcePrefix && !r.sources.some((s) => s.startsWith(e.sourcePrefix!))) problems.push(`缺少來源 ${e.sourcePrefix}…`);
  for (const re of e.must ?? []) if (!re.test(r.answer)) problems.push(`應該出現 ${re}`);
  for (const re of e.mustNot ?? []) if (re.test(r.answer)) problems.push(`不該出現 ${re}`);
  return problems;
}
