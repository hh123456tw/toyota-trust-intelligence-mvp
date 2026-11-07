// 接待摘要：車主剛進廠、技師還沒檢查時給服務專員看（見 GLOSSARY.md）。由規則產生，不呼叫 AI，不含本次量測和結論。
import { PRICE_FIRST_MIN_QUESTIONS } from "./card";
import { preferenceSummaryLine } from "./preferences";
import { judge } from "./rules";
import type { Vehicle } from "./vehicles";

export function receptionSummary(vehicle: Vehicle): string[] {
  // 上次的結論：用同一套規則判定上次量測。只列可延後和必須更換，沒有上次量測的項目不列。
  const pending = vehicle.items.flatMap((item) => {
    const prev = item.previousMeasurement;
    if (!prev) return [];
    const { conclusion } = judge({ ...item, measurement: prev });
    const last = `上次${item.name} ${prev.value} ${prev.unit}`;
    if (conclusion === "可延後") return [`${last}，延後，這次要複查。`];
    if (conclusion === "必須更換") return [`${last}，已低於安全門檻，這次要確認。`];
    return [];
  });
  const record = vehicle.lastVisitRecord;
  const { period, shortTripRatio, weeklyStarts } = vehicle.drivingSummary;
  return [
    ...pending,
    pending.length ? "資料來源：保修紀錄的待修建議項目（示意）" : "",
    preferenceSummaryLine(vehicle.preferences),
    record
      ? `上次回廠時，在決策卡追問了 ${record.priceQuestions} 次費用（示意）。${record.priceQuestions >= PRICE_FIRST_MIN_QUESTIONS ? "先講價格。" : ""}`
      : "",
    `行車摘要（${period}）：短程比例 ${shortTripRatio}%，每週發動約 ${weeklyStarts} 次。`,
  ].filter(Boolean);
}
