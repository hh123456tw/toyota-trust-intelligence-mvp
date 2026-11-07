import type { DealerFact } from "@/lib/dealer";
import Icon from "../../Icon";

// 在原廠做的差別（示意）：預設收起，車主點開才看到。
export default function DealerFacts({ facts }: { facts: DealerFact[] }) {
  return (
    <details className="group mt-2 rounded-xl border border-line bg-white px-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-ink-2">
        在原廠做的差別（示意）
        <Icon name="chevron" className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-1.5 pb-2.5 leading-relaxed">
        {facts.map((f) => (
          <li key={f.id}>
            <span className="font-bold">{f.title}：</span>
            {f.text}
          </li>
        ))}
      </ul>
      <p className="pb-2.5 text-xs text-muted">正式內容待和泰確認。</p>
    </details>
  );
}
