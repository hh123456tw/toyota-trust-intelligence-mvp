import Link from "next/link";
import { vehicles } from "@/lib/vehicles";

export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <p className="text-sm text-muted">Trust Intelligence 展示</p>
      <h1 className="mt-1 text-2xl font-bold">選一台車，打開維修決策卡</h1>
      <ul className="mt-6 space-y-3">
        {vehicles.map((v) => (
          <li key={v.id}>
            <Link
              href={`/card/${v.id}`}
              className="block rounded-xl border border-line bg-white p-4 active:bg-paper"
            >
              <p className="font-semibold">{v.owner}</p>
              <p className="text-sm text-muted">
                {v.model}｜{v.plate}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-xs text-muted">所有資料皆為展示用假資料。</p>
    </main>
  );
}
