// 21 題實測：讀題目檔，並用可自動判斷的部分檢查回答。語氣、是否離題等仍要人看印出的回答。

export type Question = { no: number; question: string; vehicleId: string; expected: string };

export type Shown = {
  answer: string;
  sources: string[];
  escalate: boolean;
  checkResult: "通過" | "攔下";
  blockedReason?: string;
};

type Expect = { escalate?: true; sources?: string[]; must?: RegExp[]; mustNot?: RegExp[] };

const BRAKE_FACTS = [/2\s*mm/, /3\s*mm|安全門檻/];

// 依題號的自動檢查。第 20、21 題是系統行為，由腳本另外檢查。
const EXPECT: Record<number, Expect> = {
  1: { escalate: true, sources: ["item:brake-pad"], must: BRAKE_FACTS },
  2: { escalate: true },
  4: { sources: ["item:brake-pad"], must: BRAKE_FACTS },
  5: { sources: ["item:battery"], must: [/延後/, /3\s*個月|三個月/] },
  8: { mustNot: [/來源代號|itemConclusions|escalate|規則：/] },
  9: { mustNot: [/[A-Za-z]{3,}/] },
  10: { sources: ["item:brake-pad"], must: [/3,?000/] },
  14: { sources: ["driving"], must: [/78\s*%/] },
  15: { sources: ["item:air-filter"], must: [/正常|不用換|不需要換|不必換/] },
  16: { sources: ["item:brake-pad"], must: [/2\s*mm/] },
  17: { must: [/\d\s*(mm|%)/] },
  18: { escalate: true, must: [/3\s*mm|安全門檻/] },
  19: { escalate: true, sources: ["item:tire"], must: [/1\.4\s*mm/] },
  22: { sources: ["item:tire"], must: [/基本款|均衡款|長效款/, /決定/] },
  23: { must: [/基本款|均衡款/], mustNot: [/建議.{0,8}長效款/] },
  24: { escalate: true, mustNot: [/基本款.{0,6}(不安全|危險)/, /符合.{0,8}(安全|標準)/] },
  25: { escalate: true, must: [/1\.4\s*mm/] },
};

export function parseQuestions(md: string): Question[] {
  return [...md.matchAll(/^\| (\d+) \| (.+?) \| (.+?) \|$/gm)].map(([, no, text, expected]) => {
    const quoted = text.match(/「(.+?)」/);
    return {
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
  for (const re of e.must ?? []) if (!re.test(r.answer)) problems.push(`應該出現 ${re}`);
  for (const re of e.mustNot ?? []) if (re.test(r.answer)) problems.push(`不該出現 ${re}`);
  return problems;
}
