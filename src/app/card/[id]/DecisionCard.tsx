"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Answer, Preset } from "@/lib/answers";
import type { AskResult } from "@/lib/ask";
import type { CardItem, Gauge } from "@/lib/card";
import { askFlow, handoverFlow, presetFlow, type FlowEntry } from "@/lib/flow";
import { currentMeasurements } from "@/lib/card";
import { choiceKey, handover, needsOptionPick, pruneChoices, type Choice } from "@/lib/handover";
import { LABEL, type Conclusion } from "@/lib/rules";
import { formatPrice, RULE_VERSION } from "@/lib/vehicles";
import Icon, { ITEM_ICON, type IconName } from "../../Icon";
import FlowPanel from "./FlowPanel";
import HandoverView from "./HandoverView";

type VehicleInfo = {
  id: string;
  owner: string;
  model: string;
  plate: string;
  mileageKm: number;
  technician: string;
  inspectedAt: string;
  routine: string[];
  nextServiceKm: number;
  progress: { stage: string; time?: string }[];
  eta?: string;
  drivingNote: string;
  drivingAdvice?: string;
  priceFirstNote?: string;
};

type Message =
  | { role: "user"; text: string }
  | { role: "ai"; answer: Answer }
  // 技師頁的模擬：一定帶「模擬」標籤和答案檢查結果，不會看起來像真的回答。
  | { role: "simulated"; result: AskResult }
  | { role: "error"; text: string };

// 每種結論的顏色和圖示。圖示加文字，不只靠顏色區分。
const LOOK: Record<Conclusion, { badge: string; soft: string; text: string; dot: string; icon: IconName }> = {
  必須更換: { badge: "bg-must text-white", soft: "bg-must-soft", text: "text-must", dot: "bg-must", icon: "alert" },
  可延後: { badge: "bg-defer text-white", soft: "bg-defer-soft", text: "text-defer", dot: "bg-defer", icon: "clock" },
  正常: { badge: "bg-ok text-white", soft: "bg-ok-soft", text: "text-ok", dot: "bg-ok", icon: "check" },
};

export default function DecisionCard(props: {
  vehicle: VehicleInfo;
  items: CardItem[];
  presets: Preset[];
  sourceLabels: Record<string, string>;
  others: { id: string; owner: string }[];
  // 技師頁傳入：流程紀錄併到技師頁自己的面板。沒傳時卡片頁自己顯示面板。
  onFlow?: (entry: FlowEntry) => void;
  // 技師頁傳入：顯示「模擬：AI 回答被竄改」按鈕。車主看的卡片頁不顯示。
  simulate?: boolean;
}) {
  const { vehicle, items, presets, sourceLabels, others } = props;
  const [entries, setEntries] = useState<FlowEntry[]>([]);
  const onFlow = props.onFlow ?? ((e: FlowEntry) => setEntries((prev) => [...prev, e]));
  const count = (c: Conclusion) => items.filter((i) => i.verdict.conclusion === c).length;
  // 車主在卡片上的選擇，交車說明要用，所以放在這一層。
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  // 技師改值後（items 換了）立刻清掉結論已改變的選擇，在 render 中調整，不用 effect。
  // 車主選的產品，和選擇一樣用 choiceKey 存。
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [seenItems, setSeenItems] = useState(items);
  if (items !== seenItems) {
    setSeenItems(items);
    setChoices((prev) => pruneChoices(prev, items));
    setPicked((prev) => pruneChoices(prev, items));
  }
  const [delivered, setDelivered] = useState(false);
  const topRef = useRef<HTMLElement>(null);
  const summary = handover(items, choices, vehicle.routine, vehicle.nextServiceKm, picked);

  function showHandover(open: boolean) {
    setDelivered(open);
    if (open) onFlow(handoverFlow(summary));
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-md pb-16">
      <header ref={topRef} className="rounded-b-3xl border-t-4 border-brand bg-ink px-5 pt-7 pb-16 text-white">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-white/70">
          <Icon name="shield" className="size-4 text-brand" />
          {delivered ? "完工交車說明" : "維修決策卡"}・TRUST INTELLIGENCE
        </p>
        <h1 className="mt-3 text-2xl leading-snug font-bold">
          {vehicle.owner}，<br />
          {delivered ? "今天的保養完成了" : "這是今天的檢查結果"}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
            <Icon name="car" className="size-4" />
            {vehicle.model}
          </span>
          <span className="rounded-md border border-white/40 bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-ink">
            {vehicle.plate}
          </span>
          <span className="text-white/80">{vehicle.mileageKm.toLocaleString()} km</span>
        </div>
        <p className="mt-2 text-sm text-white/70">
          {vehicle.inspectedAt}・{vehicle.technician}檢查
        </p>
      </header>

      <div className="-mt-10 grid grid-cols-3 gap-2 px-4">
        {(["必須更換", "可延後", "正常"] as const).map((c) => (
          <Tally key={c} conclusion={c} n={count(c)} />
        ))}
      </div>

      {delivered && (
        <div className="mt-5">
          <HandoverView handover={summary} technician={vehicle.technician} onBack={() => showHandover(false)} />
        </div>
      )}

      {/* 交車說明開著時只隱藏決策卡，不卸載：追問紀錄、照片展開狀態都留著。 */}
      <div hidden={delivered}>
        <Progress steps={vehicle.progress} eta={vehicle.eta} />

        {vehicle.priceFirstNote && <PriceFirst note={vehicle.priceFirstNote} items={items} />}

        <section className="mt-3 space-y-3 px-4">
          {items.map((item) => (
            // 結論變了就重設卡片狀態（照片展開等）；選擇用 choiceKey 存，結論變了也對不上。
            <ItemCard
              key={choiceKey(item)}
              item={item}
              technician={vehicle.technician}
              choice={choices[choiceKey(item)]}
              picked={picked[choiceKey(item)]}
              onPick={(id) => setPicked((prev) => ({ ...prev, [choiceKey(item)]: id }))}
              onChoose={(c) =>
                setChoices((prev) => {
                  const next = { ...prev };
                  if (c) next[choiceKey(item)] = c;
                  else delete next[choiceKey(item)];
                  return next;
                })
              }
            />
          ))}
        </section>

        <div className="mx-4 mt-3 flex gap-3 rounded-2xl border border-line bg-white p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-ink-2">
            <Icon name="route" className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">行車摘要</p>
            <p className="text-sm text-muted">{vehicle.drivingNote}</p>
            {vehicle.drivingAdvice && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-defer-soft px-2.5 py-2 text-sm font-medium text-defer">
                <Icon name="battery" className="mt-px size-4 shrink-0" />
                <span>
                  {vehicle.drivingAdvice}
                  <span className="font-normal text-muted">（規則產生）</span>
                </span>
              </p>
            )}
          </div>
        </div>

        <Chat
          vehicleId={vehicle.id}
          measurements={currentMeasurements(items)}
          presets={presets}
          sourceLabels={sourceLabels}
          onFlow={onFlow}
          simulate={props.simulate}
        />

        <div className="mx-4 mt-4">
          <button
            onClick={() => showHandover(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-white transition-opacity active:opacity-80"
          >
            <Icon name="car" className="size-5" />
            完工交車說明
          </button>
          <p className="mt-1 text-center text-xs text-muted">交車時，專員和車主一起看今天完成、延後與不用換的項目</p>
        </div>
      </div>

      {!props.onFlow && (
        <div className="mt-8 px-4">
          <FlowPanel entries={entries} />
        </div>
      )}

      <footer className="mt-10 space-y-1 px-4 text-xs text-muted">
        <p className="flex items-start gap-1.5">
          <Icon name="shield" className="mt-px size-4 shrink-0" />
          結論由規則引擎依量測和安全門檻判定；AI 查找資料、附來源解釋，回答由程式核對後才顯示。
        </p>
        <p className="pl-5.5">照片為示意圖，所有資料皆為展示用。</p>
        <p className="pl-5.5">
          <Link href="/eval" className="font-semibold text-ink-2 underline">
            真實 AI 實測紀錄：57 次 Gemini 追問
          </Link>
        </p>
        {others.length > 0 && (
          <p className="pt-3">
            換一台車看看：
            {others.map((o) => (
              <Link key={o.id} href={`/card/${o.id}`} className="ml-2 font-semibold text-ink-2 underline">
                {o.owner}
              </Link>
            ))}
          </p>
        )}
      </footer>
    </main>
  );
}

function Tally({ conclusion, n }: { conclusion: Conclusion; n: number }) {
  const look = LOOK[conclusion];
  return (
    <div className="rounded-2xl border border-line bg-white px-2 py-3 text-center shadow-sm">
      <p className={`flex items-center justify-center gap-1 text-2xl font-bold ${look.text}`}>
        <Icon name={look.icon} className="size-5" />
        {n}
      </p>
      <p className="mt-0.5 text-xs font-medium text-muted">{LABEL[conclusion]}</p>
    </div>
  );
}

function ItemCard({
  item,
  technician,
  choice,
  picked,
  onPick,
  onChoose,
}: {
  item: CardItem;
  technician: string;
  choice?: Choice;
  picked?: string;
  onPick: (id: string) => void;
  onChoose: (c: Choice | null) => void;
}) {
  const { conclusion, reason, reminderMonths } = item.verdict;
  const look = LOOK[conclusion];
  const setChoice = onChoose;
  const [escalated, setEscalated] = useState(false);
  const [showPhoto, setShowPhoto] = useState(conclusion === "必須更換");
  const pickedOption = item.options?.find((o) => o.id === picked);
  const needsPick = needsOptionPick(item, picked);

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className={`h-1 ${look.dot}`} />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${look.soft} ${look.text}`}>
            <Icon name={ITEM_ICON[item.id] ?? "wrench"} className="size-5" />
          </span>
          <h2 className="min-w-0 flex-1 text-base font-bold">{item.name}</h2>
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${look.badge}`}
          >
            <Icon name={look.icon} className="size-4" />
            {LABEL[conclusion]}
          </span>
        </div>

        {item.gauge && <GaugeBar gauge={item.gauge} conclusion={conclusion} />}

        <p className="mt-3 text-sm leading-relaxed">{reason}</p>

        <dl className="mt-3 space-y-1.5 rounded-xl bg-paper px-3 py-2.5 text-sm">
          {item.trend && <Row label="量測趨勢">{item.trend}</Row>}
          {item.replaceScope && <Row label="更換範圍">{item.replaceScope}</Row>}
          {item.price !== undefined && (
            <Row label="示意費用">
              <span className="font-bold">
                {item.options
                  ? pickedOption
                    ? formatPrice(pickedOption.price)
                    : `${formatPrice(item.options[0].price)} 起`
                  : formatPrice(item.price)}
              </span>
              <span className="text-muted">（零件＋工資，實際以服務廠報價為準）</span>
            </Row>
          )}
          {item.history && <Row label="使用紀錄">{item.history}</Row>}
          {item.cca && (
            <Row label="CCA">
              本次 {item.cca.value} A，新品額定 {item.cca.standard} A
              <span className="text-muted">（電瓶測試器，示意）</span>
            </Row>
          )}
          <Row label="技師備註">{item.technicianNote}</Row>
          <Row label="判定依據">
            規則 {RULE_VERSION}・{technician}・{item.measuredAt} {item.gauge ? "量測" : "目視檢查"}
            <span className="text-muted">（示意）</span>
          </Row>
        </dl>

        <button
          onClick={() => setShowPhoto((s) => !s)}
          aria-expanded={showPhoto}
          className="mt-2 flex min-h-11 items-center gap-2 text-sm font-medium text-ink-2"
        >
          {/* 縮圖：每個項目一眼看得到有照片，也先把圖載好，展開大圖時不會空白。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photo} alt="" className="size-11 rounded-lg border border-line object-cover" />
          {showPhoto ? "收起技師照片" : "看技師照片"}
          <Icon name="chevron" className={`size-4 transition-transform ${showPhoto ? "rotate-180" : ""}`} />
        </button>
        {showPhoto && (
          <figure className="relative overflow-hidden rounded-xl border border-line bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.photo} alt={`${item.name}照片`} className="aspect-[3/2] w-full object-cover" />
            <figcaption className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
              示意圖
            </figcaption>
            {/* 量測值疊在照片上、讀卡片資料：技師改值會跟著變，不靠 AI 在圖裡畫數字。 */}
            {item.gauge && (
              <p
                className={`absolute bottom-2 left-2 rounded-lg px-2.5 py-1 text-sm font-bold text-white shadow ${look.dot}`}
              >
                {item.measuredAt} 量測 {item.gauge.value} {item.gauge.unit}
                <span className="font-medium text-white/85">
                  ｜{item.gauge.mustBelow !== undefined ? `安全門檻 ${item.gauge.mustBelow}` : `建議值 ${item.gauge.deferBelow}`}{" "}
                  {item.gauge.unit}
                </span>
              </p>
            )}
          </figure>
        )}

        {conclusion === "必須更換" && (
          <div className="mt-3">
            <p className="flex items-start gap-2 rounded-xl bg-must-soft px-3 py-2.5 text-sm font-medium text-must">
              <Icon name="shield" className="mt-px size-4 shrink-0" />
              這是安全項目，已低於安全門檻，今天需要更換，不提供延後。
            </p>
            {item.risk && (
              <p className="mt-2 rounded-xl border border-must/30 bg-white px-3 py-2.5 text-sm leading-relaxed">
                <span className="font-bold text-must">不換的風險：</span>
                {item.risk}
              </p>
            )}
            {item.options && (
              <OptionList item={item} picked={picked} locked={choice === "today"} onPick={onPick} />
            )}
            {needsPick && !choice && !escalated && (
              <p className="mt-2 text-sm font-medium">請先選一款，才能授權今天處理。</p>
            )}
            {!choice && !escalated && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEscalated(true)}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-white text-sm font-semibold transition-colors active:bg-paper"
                >
                  <Icon name="person" className="size-4" />
                  轉服務專員
                </button>
                <button
                  onClick={() => setChoice("today")}
                  disabled={needsPick}
                  className="min-h-11 rounded-xl bg-must text-sm font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-40"
                >
                  {needsPick ? "先選一款" : "今天授權處理"}
                </button>
              </div>
            )}
            {choice === "today" && (
              <p className="mt-2 flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-sm font-medium text-ok">
                <Icon name="check" className="size-4 shrink-0" />
                已授權今天處理{pickedOption && `（${pickedOption.name}）`}，專員確認後開始施工。
              </p>
            )}
            {escalated && !choice && (
              <p className="mt-2 flex items-center gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm font-medium">
                <Icon name="person" className="size-4 shrink-0" />
                已通知服務專員，專員會到你的座位當面說明。
              </p>
            )}
            {(choice || escalated) && (
              <button
                onClick={() => {
                  setChoice(null);
                  setEscalated(false);
                }}
                className="mt-1 min-h-11 text-xs text-muted underline"
              >
                重新選擇
              </button>
            )}
          </div>
        )}

        {conclusion === "可延後" && (
          <div className="mt-3">
            {!choice && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setChoice("today")}
                  className="min-h-11 rounded-xl border border-line bg-white text-sm font-semibold transition-colors active:bg-paper"
                >
                  今天換
                </button>
                <button
                  onClick={() => setChoice("defer")}
                  className="min-h-11 rounded-xl bg-ink text-sm font-semibold text-white transition-opacity active:opacity-80"
                >
                  延後 {reminderMonths} 個月
                </button>
              </div>
            )}
            {choice === "today" && (
              <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-sm font-medium text-ok">
                <Icon name="check" className="size-4 shrink-0" />
                已告知專員：今天一併更換。
              </p>
            )}
            {choice === "defer" && (
              <p className="flex items-center gap-2 rounded-xl bg-defer-soft px-3 py-2.5 text-sm font-medium text-defer">
                <Icon name="clock" className="size-4 shrink-0" />
                已設定 {reminderMonths} 個月後回廠提醒，到時會再幫你檢查一次。
              </p>
            )}
            {choice && (
              <button onClick={() => setChoice(null)} className="mt-1 min-h-11 text-xs text-muted underline">
                重新選擇
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// 必須更換時的產品清單：由低價排到高價、不預選、卡片上不標推薦（要車主問了，AI 才依需求建議）。規格和價格都是示意。
function OptionList({
  item,
  picked,
  locked,
  onPick,
}: {
  item: CardItem;
  picked?: string;
  locked: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className={`mt-3 ${locked ? "opacity-60" : ""}`} disabled={locked}>
      <legend className="text-sm font-bold">選擇要換的款式</legend>
      <p className="mt-0.5 text-xs text-muted">由低價排到高價，由你決定。不確定選哪款，可以告訴下面的 AI 你平常怎麼開（規格和價格皆為示意）。</p>
      {locked && <p className="mt-1 text-xs font-medium">已授權。要改款式，請按下方「重新選擇」。</p>}
      <div className="mt-2 space-y-2">
        {item.options!.map((o) => (
          <label
            key={o.id}
            className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${locked ? "cursor-not-allowed" : "cursor-pointer"} ${
              picked === o.id ? "border-ink bg-paper" : "border-line bg-white"
            }`}
          >
            <input
              type="radio"
              name={`option-${item.id}`}
              checked={picked === o.id}
              onChange={() => onPick(o.id)}
              className="mt-1 size-4 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-bold">{o.name}</span>
                <span className="font-bold tabular-nums">{formatPrice(o.price)}</span>
              </span>
              {o.sale && (
                <span className="mt-1 block text-xs font-semibold text-defer">
                  優惠中：原價 {formatPrice(o.sale.original)}，至 {o.sale.until}（示意）
                </span>
              )}
              <span className="mt-1 block text-xs text-ink-2">適合：{o.use}</span>
              <span className="mt-0.5 block text-xs text-muted">{o.specs}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// 費用先列：APP 互動紀錄顯示車主常問費用時，在項目卡片前先列出有費用的項目。
function PriceFirst({ note, items }: { note: string; items: CardItem[] }) {
  const priced = items.filter((i) => i.price !== undefined);
  if (priced.length === 0) return null;
  return (
    <section className="mx-4 mt-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold">費用一覽</h2>
      <p className="mt-0.5 text-xs text-muted">{note}（依 APP 互動紀錄，示意）</p>
      <ul className="mt-3 space-y-2">
        {priced.map((i) => {
          const look = LOOK[i.verdict.conclusion];
          return (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${look.badge}`}>
                {LABEL[i.verdict.conclusion]}
              </span>
              <span className="min-w-0 flex-1 font-medium">{i.name}</span>
              <span className="font-bold tabular-nums">{formatPrice(i.price!)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">零件＋工資，實際以服務廠報價為準。目前不用換的項目沒有費用。</p>
    </section>
  );
}

// 保養進度（示意資料）：有時間的步驟已完成，最後一個有時間的步驟是目前階段。
function Progress({ steps, eta }: { steps: { stage: string; time?: string }[]; eta?: string }) {
  const current = steps.findLastIndex((s) => s.time);
  return (
    <section className="mx-4 mt-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">保養進度</h2>
        {/* 簡報規則：缺資料時只顯示階段，不顯示精確時間。 */}
        {eta && <p className="text-sm font-semibold">預估 {eta} 完成</p>}
      </div>
      <ol className="mt-3 flex">
        {steps.map((s, i) => (
          <li key={s.stage} aria-current={i === current ? "step" : undefined} className="relative flex-1 text-center">
            {i > 0 && (
              <span
                className={`absolute top-[7px] right-1/2 h-0.5 w-full ${i <= current ? "bg-ok" : "bg-line"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative mx-auto block size-4 rounded-full border-2 ${
                i < current ? "border-ok bg-ok" : i === current ? "border-brand bg-white ring-4 ring-brand/20" : "border-line bg-white"
              }`}
            />
            <p className={`mt-1.5 text-[11px] leading-tight ${i === current ? "font-bold" : "text-muted"}`}>
              {s.stage}
              {i === current && <span className="sr-only">（目前階段）</span>}
            </p>
            <p className="text-[11px] text-muted">{s.time ?? "—"}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-muted">進度由工單事件更新（示意資料）</p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

// 刻度條：把量測值放在「必須更換／可延後／正常」三個區間上，讓車主一眼看到離門檻多遠。
function GaugeBar({ gauge, conclusion }: { gauge: Gauge; conclusion: Conclusion }) {
  const { value, previous, unit, mustBelow, deferBelow } = gauge;
  // 刻度上限最多到建議值的 2.5 倍：技師輸入離譜大值（例如 100 mm）時門檻文字才不會擠在一起，超出的點停在最右邊。
  const max =
    unit === "%" ? 100 : Math.min(deferBelow * 2.5, Math.max(deferBelow * 1.6, value * 1.15, (previous ?? 0) * 1.15));
  const pct = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  const must = mustBelow !== undefined ? pct(mustBelow) : 0;
  const defer = pct(deferBelow);
  const look = LOOK[conclusion];

  return (
    <div
      className="mt-4"
      role="img"
      aria-label={[
        `本次量測 ${value} ${unit}`,
        previous !== undefined && `半年前 ${previous} ${unit}`,
        mustBelow !== undefined && `安全門檻 ${mustBelow} ${unit}`,
        `建議值 ${deferBelow} ${unit}`,
      ]
        .filter(Boolean)
        .join("，")}
    >
      <div className="relative h-7">
        <span
          className={`absolute bottom-0 -translate-x-1/2 rounded-md px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-white ${look.dot}`}
          style={{ left: `${Math.min(88, Math.max(12, pct(value)))}%` }}
        >
          本次 {value} {unit}
        </span>
      </div>
      <div className="relative mt-1.5 flex h-2.5 overflow-hidden rounded-full">
        {must > 0 && <div className="bg-must/35" style={{ width: `${must}%` }} />}
        <div className="bg-defer/30" style={{ width: `${defer - must}%` }} />
        <div className="flex-1 bg-ok/30" />
      </div>
      <div className="relative h-0">
        {previous !== undefined && (
          <span
            className="absolute -top-[15px] size-3.5 -translate-x-1/2 rounded-full border-2 border-muted bg-white"
            style={{ left: `${pct(previous)}%` }}
            title={`半年前 ${previous} ${unit}`}
          />
        )}
        <span
          className={`absolute -top-[17px] size-[18px] -translate-x-1/2 rounded-full border-[3px] border-white shadow ${look.dot}`}
          style={{ left: `${pct(value)}%` }}
        />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted">
        {mustBelow !== undefined && (
          <span className="absolute -translate-x-1/2" style={{ left: `${must}%` }}>
            安全門檻 {mustBelow}
          </span>
        )}
        <span className="absolute -translate-x-1/2" style={{ left: `${defer}%` }}>
          建議值 {deferBelow}
        </span>
      </div>
    </div>
  );
}

function Chat(props: {
  vehicleId: string;
  measurements: Record<string, number>;
  presets: Preset[];
  sourceLabels: Record<string, string>;
  onFlow: (entry: FlowEntry) => void;
  simulate?: boolean;
}) {
  const { vehicleId, measurements, presets, sourceLabels, onFlow } = props;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function push(...m: Message[]) {
    setMessages((prev) => [...prev, ...m]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function askPreset(p: Preset) {
    push({ role: "user", text: p.question }, { role: "ai", answer: p.answer });
    onFlow(presetFlow(p, sourceLabels));
  }

  async function askFree(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    push({ role: "user", text: question });
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, question, measurements }),
      });
      const data = await res.json();
      push(res.ok ? { role: "ai", answer: data } : { role: "error", text: data.error });
      onFlow(askFlow(question, res.status, data, sourceLabels));
    } catch {
      const text = "連線失敗，請點上面的常見問題，或請專員來說明";
      push({ role: "error", text });
      onFlow(askFlow(question, 0, { error: text }, sourceLabels));
    } finally {
      setBusy(false);
    }
  }

  async function askSimulated() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, simulate: "tampered", measurements }),
      });
      const data = await res.json();
      push(res.ok ? { role: "simulated", result: data } : { role: "error", text: data.error });
      onFlow(askFlow(data.question ?? "模擬", res.status, data, sourceLabels));
    } catch {
      push({ role: "error", text: "連線失敗" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-4 mt-8 rounded-3xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-ink text-white">
          <Icon name="sparkle" className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">有問題？直接問</h2>
          <p className="text-xs text-muted">回答只會引用這張卡上的資料，並附上來源。</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.question}
            onClick={() => askPreset(p)}
            className="min-h-10 rounded-full border border-line bg-paper px-3.5 text-sm font-medium transition-colors hover:border-ink-2/40 active:bg-line"
          >
            {p.question}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {messages.map((m, i) => (
          <Bubble key={i} message={m} sourceLabels={sourceLabels} />
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <span className="size-2 animate-pulse rounded-full bg-ink-2" />
            查找資料中…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={askFree} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={200}
          aria-label="輸入問題"
          placeholder="例如：電瓶還能用多久？"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-base outline-none focus:border-ink-2 focus:bg-white"
        />
        <button
          disabled={busy || !input.trim()}
          className="flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 font-semibold text-white transition-opacity disabled:opacity-40"
        >
          <Icon name="send" className="size-4" />
          送出
        </button>
      </form>

      {props.simulate && (
        <button
          onClick={askSimulated}
          disabled={busy}
          className="mt-3 min-h-11 w-full rounded-xl border-2 border-dashed border-defer bg-defer-soft text-sm font-semibold text-defer disabled:opacity-40"
        >
          模擬：AI 回答被竄改（展示答案檢查，不呼叫 AI）
        </button>
      )}
    </section>
  );
}

function Bubble({ message, sourceLabels }: { message: Message; sourceLabels: Record<string, string> }) {
  if (message.role === "user") {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-white">
        {message.text}
      </p>
    );
  }
  if (message.role === "error") {
    return (
      <AiFrame>
        <div className="rounded-2xl rounded-tl-md bg-paper px-3.5 py-2.5 text-sm text-muted">
          {message.text}
          <Escalate />
        </div>
      </AiFrame>
    );
  }
  const simulated = message.role === "simulated" ? message.result : undefined;
  const { answer, sources, escalate } = simulated ?? (message as { answer: Answer }).answer;
  return (
    <AiFrame>
      <div
        className={`rounded-2xl rounded-tl-md bg-paper px-3.5 py-2.5 ${simulated ? "border-2 border-dashed border-defer" : ""}`}
      >
        {simulated && (
          <p className="mb-2 rounded-lg bg-defer-soft px-2 py-1 text-sm font-semibold text-defer">
            模擬｜AI 回答被竄改（未呼叫 AI）→ 答案檢查：
            {simulated.checkResult === "攔下" ? `攔下（${simulated.blockedReason}）` : "通過"}
            {simulated.checkResult === "攔下" && "。以下是改顯示的替代回答："}
          </p>
        )}
        <p className="leading-relaxed">{answer}</p>
        {sources.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {sources.map((s) => (
              <li
                key={s}
                className="flex items-center gap-1 rounded-md border border-line bg-white px-2 py-0.5 text-xs text-muted"
              >
                <Icon name="doc" className="size-3" />
                來源｜{sourceLabels[s] ?? s}
              </li>
            ))}
          </ul>
        )}
        {escalate && <Escalate />}
      </div>
    </AiFrame>
  );
}

function AiFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-start gap-2">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-ink text-white">
        <Icon name="sparkle" className="size-3.5" />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Escalate() {
  const [called, setCalled] = useState(false);
  return called ? (
    <p className="mt-2 flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2 text-sm font-medium text-ok">
      <Icon name="check" className="size-4 shrink-0" />
      已通知服務專員，請稍候，專員會到你的座位說明。
    </p>
  ) : (
    <button
      onClick={() => setCalled(true)}
      className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-must text-sm font-semibold text-white transition-opacity active:opacity-80"
    >
      <Icon name="person" className="size-4" />
      請專員來說明
    </button>
  );
}
