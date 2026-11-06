import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardProps } from "@/lib/card";
import { findVehicle, vehicles } from "@/lib/vehicles";
import DecisionCard from "./DecisionCard";

export async function generateMetadata(props: PageProps<"/card/[id]">): Promise<Metadata> {
  const vehicle = findVehicle((await props.params).id);
  return vehicle ? { title: `${vehicle.owner}的維修決策卡｜Trust Intelligence` } : {};
}

export function generateStaticParams() {
  return vehicles.map((v) => ({ id: v.id }));
}

export default async function CardPage(props: PageProps<"/card/[id]">) {
  const { id } = await props.params;
  const vehicle = findVehicle(id);
  if (!vehicle) notFound();

  return <DecisionCard {...cardProps(vehicle)} />;
}
