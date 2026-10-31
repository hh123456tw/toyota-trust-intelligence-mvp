// 把檢查項目轉成決策卡要顯示的樣子。結論一律交給規則引擎重算。

import { presetsFor, sourceLabel, validSources } from "./answers";
import { EXCERPTS } from "./manual";
import { judge, type Conclusion, type Verdict } from "./rules";
import { trendText, vehicles, type InspectionItem, type Vehicle } from "./vehicles";

// 決策卡上的一個檢查項目。
export type CardItem = {
  id: string;
  name: string;
  photo: string;
  technicianNote: string;
  measuredAt: string;
  history?: string;
  cca?: { value: number; standard: number };
  trend?: string;
  // 示意費用：只有必須更換、可延後的項目有。
  price?: number;
  // 量測型項目的刻度條：本次、上次量測和門檻。只供畫面顯示，結論仍以 verdict 為準。
  gauge?: Gauge;
  verdict: Verdict;
};

export type Gauge = {
  value: number;
  previous?: number;
  unit: string;
  mustBelow?: number;
  deferBelow: number;
};

const ORDER: Record<Conclusion, number> = { 必須更換: 0, 可延後: 1, 正常: 2 };

export function cardItems(items: InspectionItem[]): CardItem[] {
  return items
    .map((item) => {
      const verdict = judge(item);
      return {
        id: item.id,
        name: item.name,
        photo: item.photo,
        technicianNote: item.technicianNote,
        measuredAt: item.measuredAt,
        history: item.history,
        cca: item.cca,
        trend: trendText(item),
        price: verdict.conclusion === "正常" ? undefined : item.price,
        gauge:
          item.rule.kind === "measured" && item.measurement
            ? {
                value: item.measurement.value,
                previous: item.previousMeasurement?.value,
                unit: item.measurement.unit,
                mustBelow: item.safetyRelated ? item.rule.mustBelow : undefined,
                deferBelow: item.rule.deferBelow,
              }
            : undefined,
        verdict,
      };
    })
    .sort((a, b) => ORDER[a.verdict.conclusion] - ORDER[b.verdict.conclusion]);
}

// 技師改一個量測值：回傳新陣列，不改原始資料。原備註描述舊值，一併換掉。
export function withMeasurement(items: InspectionItem[], id: string, value: number): InspectionItem[] {
  return items.map((i) =>
    i.id === id && i.measurement
      ? {
          ...i,
          measurement: { ...i.measurement, value },
          technicianNote: `技師更新量測值為 ${value} ${i.measurement.unit}。`,
          // CCA 和舊健康度是同一次測試器讀值，改值後不再顯示，避免和新結論矛盾。
          cca: undefined,
        }
      : i,
  );
}

// 車主在 App 追問費用達這個次數，決策卡就先列出費用。
export const PRICE_FIRST_MIN_QUESTIONS = 3;

// 依 APP 互動紀錄決定是否先列費用；回傳說明文字，沒有紀錄或次數不夠回傳 undefined。
export function priceFirstNote(vehicle: Vehicle): string | undefined {
  const r = vehicle.appRecord;
  if (!r || r.priceQuestions < PRICE_FIRST_MIN_QUESTIONS) return undefined;
  return `${r.period}你在 App 問過 ${r.priceQuestions} 次費用，先把費用列在這裡。`;
}

// 短程比例達這個百分比，行車摘要加上電瓶充電的建議。
export const SHORT_TRIP_ADVICE_MIN_RATIO = 50;

// 行車摘要的建議句：由規則產生，不經 AI。
export function drivingAdvice(vehicle: Vehicle): string | undefined {
  if (vehicle.drivingSummary.shortTripRatio < SHORT_TRIP_ADVICE_MIN_RATIO) return undefined;
  return "短程行駛多，發電機來不及把電瓶充飽。建議每週安排一次較長距離行駛。";
}

// 決策卡需要的全部資料；卡片頁和技師頁共用。
export function cardProps(vehicle: Vehicle) {
  // 來源代號對應的顯示文字，讓畫面把 AI 回答的來源轉成看得懂的標籤。
  const keys = validSources(vehicle, [
    "driving",
    ...vehicle.items.flatMap((i) => [`item:${i.id}`, `trend:${i.id}`]),
    ...EXCERPTS.map((e) => `doc:${e.id}`),
  ]);
  return {
    vehicle: {
      id: vehicle.id,
      owner: vehicle.owner,
      model: vehicle.model,
      plate: vehicle.plate,
      mileageKm: vehicle.mileageKm,
      technician: vehicle.technician,
      inspectedAt: vehicle.inspectedAt,
      routine: vehicle.routine,
      nextServiceKm: vehicle.nextServiceKm,
      progress: vehicle.progress,
      eta: vehicle.eta,
      drivingNote: `${vehicle.drivingSummary.period}：${vehicle.drivingSummary.note}`,
      drivingAdvice: drivingAdvice(vehicle),
      priceFirstNote: priceFirstNote(vehicle),
    },
    items: cardItems(vehicle.items),
    presets: presetsFor(vehicle.id),
    sourceLabels: Object.fromEntries(keys.map((k) => [k, sourceLabel(vehicle, k)!])),
    others: vehicles.filter((v) => v.id !== vehicle.id).map((v) => ({ id: v.id, owner: v.owner })),
  };
}
