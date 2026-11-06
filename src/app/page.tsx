import type { Metadata } from "next";
import Link from "next/link";
import { vehicles } from "@/lib/vehicles";
import Icon from "./Icon";

export const metadata: Metadata = { title: "Trust Intelligence 展示" };

export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted">
        <Icon name="shield" className="size-4" />
        TRUST INTELLIGENCE 展示
      </p>
      <h1 className="mt-2 text-2xl font-bold">選一台車，打開維修決策卡</h1>
      <ul className="mt-6 space-y-3">
        {vehicles.map((v) => (
          <li key={v.id}>
            <Link
              href={`/card/${v.id}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm transition-colors active:bg-paper"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-ink text-white">
                <Icon name="car" className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{v.owner}</span>
                <span className="block text-sm text-muted">
                  {v.model}｜{v.plate}
                </span>
              </span>
              <Icon name="chevron" className="size-5 -rotate-90 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-sm font-bold">技師輸入</h2>
      <ul className="mt-1">
        {vehicles.map((v) => (
          <li key={v.id}>
            <Link href={`/tech/${v.id}`} className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2 underline">
              <Icon name="wrench" className="size-4" />
              {v.owner}的車：改量測值，結論重算
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="mt-6 text-sm font-bold">實測紀錄</h2>
      <Link href="/eval" className="mt-1 flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2 underline">
        <Icon name="shield" className="size-4" />
        真實 AI 實測紀錄
      </Link>
      <p className="mt-8 text-xs text-muted">所有資料皆為展示用假資料。</p>
    </main>
  );
}
