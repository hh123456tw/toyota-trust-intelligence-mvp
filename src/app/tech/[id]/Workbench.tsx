"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { cardItems, measurementError, withMeasurement } from "@/lib/card";
import { staffLine } from "@/lib/handover";
import { LABEL, type Conclusion } from "@/lib/rules";
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
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  // 只在量測值改變時重算；DecisionCard 用 items 是否換了來判斷要不要清掉舊選擇。
  const cards = useMemo(() => cardItems(items), [items]);

  const conclusionOf = (list: InspectionItem[], id: string) =>
    cardItems(list).find((i) => i.id === id)!.verdict.conclusion;

  function change(item: InspectionItem, raw: string) {
    // 數值不合理時不重算：結論和 AI 都維持上一個有效值，並在輸入框下方提示。
    const error = measurementError(item.measurement!.unit, raw);
    setErrors((prev) => ({ ...prev, [item.id]: error }));
    if (error) return;
    const value = Number(raw);
    const before = items.find((i) => i.id === item.id)!.measurement!;
    if (before.value === value) return;
    const next = withMeasurement(items, item.id, value);
    setItems(next);
    setEntries((prev) => [
      ...prev,
      {
        title: `技師改值：${item.name} ${before.value} → ${value} ${before.unit}`,
        steps: ["規則引擎重算", `結論：${LABEL[conclusionOf(items, item.id)]} → ${LABEL[conclusionOf(next, item.id)]}`],
        aiCalls: 0,
      },
    ]);
  }

  return (
    // record-scale：整頁放大 125%，1920×1080 錄影時字才看得清楚（見 globals.css）。
    <div className="record-scale grid gap-6 bg-paper p-4 lg:h-screen lg:grid-cols-[minmax(0,46rem)_auto] lg:justify-center lg:gap-10 lg:p-6">
      <section className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-1">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-l-4 border-brand bg-ink p-5 text-white">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10">
            <Icon name="wrench" className="size-6" />
          </span>
          <div className="min-w-40 flex-1">
            <p className="text-xs font-medium tracking-wider text-white/70">技師輸入頁</p>
            <h1 className="text-xl font-bold">
              {props.technician}・{props.card.vehicle.plate}
            </h1>
          </div>
          <p className="w-full text-sm text-white/80 sm:w-auto sm:max-w-72 sm:text-right">改量測值，決策卡的結論立刻由規則引擎重算。</p>
        </div>

        <div className="divide-y divide-line rounded-2xl border border-line bg-white px-4 shadow-sm">
          {props.items
            .filter((i) => i.measurement)
            .map((i) => {
              const conclusion = conclusionOf(items, i.id);
              const error = errors[i.id];
              const current = items.find((x) => x.id === i.id)!.measurement!;
              return (
                <label key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-ink-2">
                    <Icon name={ITEM_ICON[i.id] ?? "wrench"} className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold whitespace-nowrap">{i.name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${PILL[conclusion]}`}>
                      {LABEL[conclusion]}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      defaultValue={i.measurement!.value}
                      onChange={(e) => change(i, e.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `error-${i.id}` : undefined}
                      className={`w-20 rounded-xl border bg-paper px-3 py-2 text-right text-lg font-bold sm:w-24 outline-none focus:bg-white ${error ? "border-must" : "border-line focus:border-ink-2"}`}
                    />
                    <span className="w-7 text-muted">{i.measurement!.unit}</span>
                  </span>
                  {error && (
                    <span id={`error-${i.id}`} role="alert" className="w-full text-right text-sm font-semibold text-must">
                      {error}。結論維持 {current.value} {current.unit} 的結果。
                    </span>
                  )}
                </label>
              );
            })}
        </div>

        <ReceptionSummary
          vehicleId={props.card.vehicle.id}
          sourceLabels={props.card.sourceLabels}
          onFlow={(e) => setEntries((prev) => [...prev, e])}
          line={staffLine(cards)}
          items={cards}
        />

        <FlowPanel entries={entries} />
      </section>

      {/* 手機外框：讓錄影畫面看得出這是車主手機上的樣子。 */}
      <section className="flex min-h-0 min-w-0 flex-col items-center">
        <p className="mb-2 text-sm font-medium text-muted">車主手機畫面</p>
        <div className="h-[80vh] min-h-0 w-full max-w-[25rem] flex-1 overflow-hidden lg:h-auto rounded-[2.75rem] border-[10px] border-ink bg-ink shadow-2xl">
          <div className="h-full overflow-y-auto rounded-[2rem] bg-paper">
            <DecisionCard
              {...props.card}
              items={cards}
              // 常見問題是預寫的，改值後結論可能不同，先收起來，改問 AI。
              presets={items === props.items ? props.card.presets : []}
              simulate
              onFlow={(e) => setEntries((prev) => [...prev, e])}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
