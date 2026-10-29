import { notFound } from "next/navigation";
import { presetsFor, sourceLabel } from "@/lib/answers";
import { judge, type Conclusion } from "@/lib/rules";
import { findVehicle, vehicles } from "@/lib/vehicles";
import DecisionCard, { type CardItem } from "./DecisionCard";

const ORDER: Record<Conclusion, number> = { 必須更換: 0, 可延後: 1, 正常: 2 };

export function generateStaticParams() {
  return vehicles.map((v) => ({ id: v.id }));
}

export default async function CardPage(props: PageProps<"/card/[id]">) {
  const { id } = await props.params;
  const vehicle = findVehicle(id);
  if (!vehicle) notFound();

  const items: CardItem[] = vehicle.items
    .map((item) => ({
      id: item.id,
      name: item.name,
      photo: item.photo,
      technicianNote: item.technicianNote,
      verdict: judge(item),
    }))
    .sort((a, b) => ORDER[a.verdict.conclusion] - ORDER[b.verdict.conclusion]);

  // 來源代號對應的顯示文字，讓畫面把 AI 回答的來源轉成看得懂的標籤。
  const keys = ["driving", ...vehicle.items.map((i) => `item:${i.id}`)];
  const sourceLabels = Object.fromEntries(keys.map((k) => [k, sourceLabel(vehicle, k)!]));

  const others = vehicles.filter((v) => v.id !== vehicle.id);

  return (
    <DecisionCard
      vehicle={{
        id: vehicle.id,
        owner: vehicle.owner,
        model: vehicle.model,
        plate: vehicle.plate,
        mileageKm: vehicle.mileageKm,
        technician: vehicle.technician,
        inspectedAt: vehicle.inspectedAt,
        drivingNote: `${vehicle.drivingSummary.period}：${vehicle.drivingSummary.note}`,
      }}
      items={items}
      presets={presetsFor(vehicle.id)}
      sourceLabels={sourceLabels}
      others={others.map((v) => ({ id: v.id, owner: v.owner }))}
    />
  );
}
