import { notFound } from "next/navigation";
import { cardProps } from "@/lib/card";
import { findVehicle, vehicles } from "@/lib/vehicles";
import Workbench from "./Workbench";

export function generateStaticParams() {
  return vehicles.map((v) => ({ id: v.id }));
}

// 錄影用：左邊技師輸入頁，右邊同一台車的決策卡。
export default async function TechPage(props: PageProps<"/tech/[id]">) {
  const { id } = await props.params;
  const vehicle = findVehicle(id);
  if (!vehicle) notFound();

  return <Workbench card={cardProps(vehicle)} items={vehicle.items} technician={vehicle.technician} />;
}
