import Link from "next/link";
import Icon from "./Icon";

// 打錯網址或找不到車輛時顯示，取代 Next 預設的英文 404。
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted">
        <Icon name="shield" className="size-4" />
        TRUST INTELLIGENCE 展示
      </p>
      <h1 className="mt-2 text-2xl font-bold">找不到這一頁</h1>
      <p className="mt-2 text-sm text-muted">網址可能打錯了，或這張卡不存在。</p>
      <Link
        href="/"
        className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-white transition-opacity active:opacity-80"
      >
        回首頁
      </Link>
    </main>
  );
}
