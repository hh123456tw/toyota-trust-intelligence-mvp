import type { Metadata } from "next";
import Link from "next/link";
import { vehicles } from "@/lib/vehicles";
import Icon from "./Icon";

export const metadata: Metadata = { title: "Trust Intelligence 展示" };

export default function Home() {
  const main = vehicles.find((v) => v.id === "wang");
  const rest = vehicles.filter((v) => v !== main);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted">
        <Icon name="shield" className="size-4" />
        TRUST INTELLIGENCE 展示
      </p>
      <h1 className="mt-2 text-2xl font-bold">從王先生的維修決策卡開始</h1>
      {/* 主要入口：簡報 Demo 的車主。其他連結放下面，字小一級。 */}
      {main && (
        <Link
          href={`/card/${main.id}`}
          className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-ink bg-ink p-4 text-white shadow-sm transition-opacity active:opacity-80"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-white text-ink">
            <Icon name="car" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-white/70">簡報 Demo 的車主</span>
            <span className="block font-bold">{main.owner}的維修決策卡</span>
            <span className="block text-sm text-white/80">
              {main.model}｜{main.plate}
            </span>
          </span>
          <Icon name="chevron" className="size-5 -rotate-90" />
        </Link>
      )}

      <h2 className="mt-8 text-sm font-bold text-ink-2">其他展示</h2>
      <ul className="mt-1 text-sm">
        {rest.map((v) => (
          <li key={v.id}>
            <Link href={`/card/${v.id}`} className="flex min-h-11 items-center gap-2 font-medium text-ink-2 underline">
              <Icon name="car" className="size-4" />
              {v.owner}的維修決策卡（{v.model}）
            </Link>
          </li>
        ))}
        {vehicles.map((v) => (
          <li key={v.id}>
            <Link href={`/tech/${v.id}`} className="flex min-h-11 items-center gap-2 font-medium text-ink-2 underline">
              <Icon name="wrench" className="size-4" />
              技師輸入：{v.owner}的車，改量測值，結論重算
            </Link>
          </li>
        ))}
        <li>
          <Link href="/eval" className="flex min-h-11 items-center gap-2 font-medium text-ink-2 underline">
            <Icon name="shield" className="size-4" />
            真實 AI 實測紀錄
          </Link>
        </li>
      </ul>
      <p className="mt-1 text-xs text-muted">技師輸入頁給技師與專員看，建議用電腦開。</p>
      <p className="mt-8 text-xs text-muted">所有資料皆為展示用假資料。</p>
    </main>
  );
}
