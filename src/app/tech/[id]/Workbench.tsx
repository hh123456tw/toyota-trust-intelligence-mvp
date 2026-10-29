"use client";

import { useState, type ComponentProps } from "react";
import { cardItems, withMeasurement } from "@/lib/card";
import { staffLine } from "@/lib/handover";
import type { Conclusion } from "@/lib/rules";
import type { InspectionItem } from "@/lib/vehicles";
import DecisionCard from "../../card/[id]/DecisionCard";
import FlowPanel from "../../card/[id]/FlowPanel";
import Icon, { ITEM_ICON } from "../../Icon";
import ReceptionSummary from "./ReceptionSummary";
import type { FlowEntry } from "@/lib/flow";

const PILL: Record<Conclusion, string> = {
  必須更換: "bg-must text-white",
  可延後: "bg-defer text-white",
  正常: "bg-ok text-white",
};

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
    // record-scale：整頁放大 125%，1920×1080 錄影時字才看得清楚（見 globals.css）。
    <div className="record-scale grid h-screen grid-cols-[minmax(0,46rem)_auto] justify-center gap-10 bg-paper p-6">
      <section className="min-w-0 space-y-4 overflow-y-auto pr-1">
        <div className="flex items-center gap-3 rounded-2xl border-l-4 border-brand bg-ink p-5 text-white">
          <span className="grid size-12 place-items-center rounded-xl bg-white/10">
            <Icon name="wrench" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wider text-white/70">技師輸入頁</p>
            <h1 className="text-xl font-bold">
              {props.technician}・{props.card.vehicle.plate}
            </h1>
          </div>
          <p className="max-w-72 text-right text-sm text-white/80">改量測值，右邊的結論立刻由規則引擎重算。</p>
        </div>

        <div className="divide-y divide-line rounded-2xl border border-line bg-white px-4 shadow-sm">
          {props.items
            .filter((i) => i.measurement)
            .map((i) => {
              const conclusion = conclusionOf(items, i.id);
              return (
                <label key={i.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-ink-2">
                    <Icon name={ITEM_ICON[i.id] ?? "wrench"} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{i.name}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${PILL[conclusion]}`}>
                    {conclusion}
                  </span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      defaultValue={i.measurement!.value}
                      onChange={(e) => change(i, e.target.value)}
                      className="w-24 rounded-xl border border-line bg-paper px-3 py-2 text-right text-lg font-bold outline-none focus:border-ink-2 focus:bg-white"
                    />
                    <span className="w-7 text-muted">{i.measurement!.unit}</span>
                  </span>
                </label>
              );
            })}
        </div>

        <ReceptionSummary
          vehicleId={props.card.vehicle.id}
          sourceLabels={props.card.sourceLabels}
          onFlow={(e) => setEntries((prev) => [...prev, e])}
          edited={items !== props.items}
          line={staffLine(cardItems(props.items))}
        />

        <FlowPanel entries={entries} />
      </section>

      {/* 手機外框：讓錄影畫面看得出這是車主手機上的樣子。 */}
      <section className="flex min-h-0 flex-col items-center">
        <p className="mb-2 text-sm font-medium text-muted">車主手機畫面</p>
        <div className="min-h-0 w-[25rem] flex-1 overflow-hidden rounded-[2.75rem] border-[10px] border-ink bg-ink shadow-2xl">
          <div className="h-full overflow-y-auto rounded-[2rem] bg-paper">
            <DecisionCard
              {...props.card}
              items={cardItems(items)}
              simulate
              onFlow={(e) => setEntries((prev) => [...prev, e])}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
