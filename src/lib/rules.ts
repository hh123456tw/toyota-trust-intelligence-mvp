// 規則引擎：唯一能決定結論的地方。AI 只讀取這裡的輸出，不能改變它。

import type { InspectionItem } from "./vehicles";

export type Conclusion = "必須更換" | "可延後" | "正常";

export type Verdict = {
  conclusion: Conclusion;
  reason: string;
  reminderMonths?: number;
};

const DEFAULT_REMINDER_MONTHS = 3;

export function judge(item: InspectionItem): Verdict {
  const rule = item.rule;

  if (rule.kind === "visual") {
    return item.visualOk
      ? { conclusion: "正常", reason: "技師目視檢查狀況良好。" }
      : {
          conclusion: "可延後",
          reason: "技師目視發現需留意。",
          reminderMonths: rule.reminderMonths,
        };
  }

  const m = item.measurement;
  if (!m) throw new Error(`${item.id} 缺少量測值`);

  if (item.safetyRelated && rule.mustBelow !== undefined && m.value < rule.mustBelow) {
    return {
      conclusion: "必須更換",
      reason: `量測 ${m.value} ${m.unit}，低於安全門檻 ${rule.mustBelow} ${m.unit}。`,
    };
  }

  if (m.value < rule.deferBelow) {
    return {
      conclusion: "可延後",
      reason:
        rule.mustBelow !== undefined
          ? `量測 ${m.value} ${m.unit}，低於建議值 ${rule.deferBelow} ${m.unit}，但還沒到安全門檻 ${rule.mustBelow} ${m.unit}。`
          : `量測 ${m.value} ${m.unit}，低於建議值 ${rule.deferBelow} ${m.unit}，還可以使用一段時間。`,
      reminderMonths: rule.reminderMonths ?? DEFAULT_REMINDER_MONTHS,
    };
  }

  return {
    conclusion: "正常",
    reason: `量測 ${m.value} ${m.unit}，高於建議值 ${rule.deferBelow} ${m.unit}。`,
  };
}
