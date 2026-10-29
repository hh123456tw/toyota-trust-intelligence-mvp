"use client";

import { useState, type ComponentProps } from "react";
import { cardItems, withMeasurement } from "@/lib/card";
import type { InspectionItem } from "@/lib/vehicles";
import DecisionCard from "../../card/[id]/DecisionCard";
import FlowPanel, { type FlowEntry } from "../../card/[id]/FlowPanel";

// 只用前端狀態：改值後直接交給規則引擎重算，不經過後端或 AI。
export default function Workbench(props: {
  card: ComponentProps<typeof DecisionCard>;
  items: InspectionItem[];
  technician: string;
}) {
  const [items, setItems] = useState(props.items);
  const [entries, setEntries] = useState<FlowEntry[]>([]);

  const conclusionOf = (list: InspectionItem[], id: string) =>
    cardItems(list).find((i) => i.id === id)!.verdict.conclusion;

  function change(item: InspectionItem, raw: string) {
    const value = Number(raw);
    // 輸入到一半（空白）或不是數字時先不算。
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    const before = items.find((i) => i.id === item.id)!.measurement!;
    if (before.value === value) return;
    const next = withMeasurement(items, item.id, value);
    setItems(next);
    setEntries((prev) => [
      ...prev,
      {
        title: `技師改值：${item.name} ${before.value} → ${value} ${before.unit}`,
        steps: ["規則引擎重算", `結論：${conclusionOf(items, item.id)} → ${conclusionOf(next, item.id)}`],
        aiCalls: 0,
      },
    ]);
  }

  return (
    <div className="grid h-screen grid-cols-2 gap-6 p-6">
      <section className="min-w-0 space-y-4 overflow-y-auto">
        <div>
          <p className="text-sm text-muted">技師輸入頁</p>
          <h1 className="mt-1 text-2xl font-bold">
            {props.technician}・{props.card.vehicle.plate}
          </h1>
          <p className="text-sm text-muted">改量測值，右邊的結論立刻由規則引擎重算。</p>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-white p-4">
          {props.items
            .filter((i) => i.measurement)
            .map((i) => (
              <label key={i.id} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{i.name}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={i.measurement!.value}
                    onChange={(e) => change(i, e.target.value)}
                    className="w-28 rounded-lg border border-line px-3 py-2 text-right text-lg"
                  />
                  <span className="w-8 text-muted">{i.measurement!.unit}</span>
                </span>
              </label>
            ))}
        </div>

        <FlowPanel entries={entries} />
      </section>

      <section className="min-w-0 overflow-y-auto rounded-xl border border-line">
        <DecisionCard {...props.card} items={cardItems(items)} />
      </section>
    </div>
  );
}
