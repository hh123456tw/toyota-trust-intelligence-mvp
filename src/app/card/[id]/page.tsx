import { notFound } from "next/navigation";
import { cardProps } from "@/lib/card";
import { findVehicle, vehicles } from "@/lib/vehicles";
import DecisionCard from "./DecisionCard";

export function generateStaticParams() {
  return vehicles.map((v) => ({ id: v.id }));
}

export default async function CardPage(props: PageProps<"/card/[id]">) {
  const { id } = await props.params;
  const vehicle = findVehicle(id);
  if (!vehicle) notFound();

  return <DecisionCard {...cardProps(vehicle)} />;
}
