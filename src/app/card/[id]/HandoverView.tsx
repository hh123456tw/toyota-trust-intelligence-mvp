import type { Handover } from "@/lib/handover";
import { RULE_VERSION } from "@/lib/vehicles";
import Icon from "../../Icon";

// 完工交車說明（峰終體驗）：今天完成、今天延後、目前不用換一次說清楚。內容全由規則產生。
export default function HandoverView({
  handover: h,
  technician,
  onBack,
}: {
  handover: Handover;
  technician: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3 px-4">
      {h.fine.length > 0 && (
        <section className="rounded-2xl border-l-4 border-brand bg-ink p-4 text-white shadow-sm">
          <p className="text-xs font-medium tracking-wider text-white/70">今天不用換</p>
          <p className="mt-1 text-lg leading-snug font-bold">
            {h.fine.map((i) => i.name).join("、")}狀況良好，今天不用換。
          </p>
          <p className="mt-1 text-sm text-white/70">技師檢查照片已保留，之後可以回查。</p>
        </section>
      )}

      <Block title="今天完成" icon="check" tone="text-ok bg-ok-soft">
        {h.done.map((d) => (
          <Line
            key={d.name}
            title={d.name}
            note={d.item ? `${d.item.verdict.reason}${d.note}。` : d.note}
            meta={d.item && `規則 ${RULE_VERSION}・${technician}・${d.item.measuredAt}`}
          />
        ))}
      </Block>

      {h.deferred.length > 0 && (
        <Block title="今天延後" icon="clock" tone="text-defer bg-defer-soft">
          {h.deferred.map(({ item, months }) => (
            <Line
              key={item.id}
              title={item.name}
              note={`${item.verdict.reason}${months} 個月後回廠提醒。`}
              meta={`規則 ${RULE_VERSION}・${technician}・${item.measuredAt}`}
            />
          ))}
        </Block>
      )}

      {h.fine.length > 0 && (
        <Block title="目前不用換" icon="shield" tone="text-ink-2 bg-paper">
          {h.fine.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photo}
                alt={`${item.name}照片（示意圖）`}
                className="h-12 w-16 shrink-0 rounded-lg border border-line object-cover"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.verdict.reason} 規則 {RULE_VERSION}・{technician}・{item.measuredAt}
                </p>
              </div>
            </div>
          ))}
        </Block>
      )}

      <Block title="下次提醒" icon="clock" tone="text-ink-2 bg-paper">
        {h.reminders.map((r) => (
          <p key={r} className="py-1.5 text-sm">
            {r}
          </p>
        ))}
        <p className="pt-1 text-xs text-muted">提醒會同步到 App（示意）。</p>
      </Block>

      <button
        onClick={onBack}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-sm font-semibold"
      >
        <Icon name="chevron" className="size-4 rotate-90" />
        回到決策卡
      </button>
    </div>
  );
}

function Block({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: "check" | "clock" | "shield";
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 font-bold">
        <span className={`grid size-8 place-items-center rounded-lg ${tone}`}>
          <Icon name={icon} className="size-4" />
        </span>
        {title}
      </h2>
      <div className="mt-2 divide-y divide-line">{children}</div>
    </section>
  );
}

function Line({ title, note, meta }: { title: string; note: string; meta?: string }) {
  return (
    <div className="py-2">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm text-muted">{note}</p>
      {meta && <p className="text-xs text-muted">{meta}</p>}
    </div>
  );
}
