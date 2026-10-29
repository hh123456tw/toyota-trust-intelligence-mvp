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
        }
      : i,
  );
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
      drivingNote: `${vehicle.drivingSummary.period}：${vehicle.drivingSummary.note}`,
    },
    items: cardItems(vehicle.items),
    presets: presetsFor(vehicle.id),
    sourceLabels: Object.fromEntries(keys.map((k) => [k, sourceLabel(vehicle, k)!])),
    others: vehicles.filter((v) => v.id !== vehicle.id).map((v) => ({ id: v.id, owner: v.owner })),
  };
}
