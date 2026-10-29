"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Answer, Preset } from "@/lib/answers";
import type { AskResult } from "@/lib/ask";
import type { CardItem } from "@/lib/card";
import { askFlow, presetFlow, type FlowEntry } from "@/lib/flow";
import type { Conclusion } from "@/lib/rules";
import FlowPanel from "./FlowPanel";

type VehicleInfo = {
  id: string;
  owner: string;
  model: string;
  plate: string;
  mileageKm: number;
  technician: string;
  inspectedAt: string;
  drivingNote: string;
};

type Message =
  | { role: "user"; text: string }
  | { role: "ai"; answer: Answer }
  // 技師頁的模擬：一定帶「模擬」標籤和答案檢查結果，不會看起來像真的回答。
  | { role: "simulated"; result: AskResult }
  | { role: "error"; text: string };

const BADGE: Record<Conclusion, string> = {
  必須更換: "bg-must text-white",
  可延後: "bg-defer text-white",
  正常: "bg-ok text-white",
};

const EDGE: Record<Conclusion, string> = {
  必須更換: "border-l-must",
  可延後: "border-l-defer",
  正常: "border-l-ok",
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

  return (
    <main className="mx-auto max-w-md pb-16">
      <header className="px-4 pt-6 pb-4">
        <p className="text-sm text-muted">維修決策卡</p>
        <h1 className="mt-1 text-2xl font-bold">{vehicle.owner}，這是今天的檢查結果</h1>
        <p className="mt-1 text-sm text-muted">
          {vehicle.model}｜{vehicle.plate}｜{vehicle.mileageKm.toLocaleString()} km
        </p>
        <p className="text-sm text-muted">
          {vehicle.inspectedAt}・{vehicle.technician}檢查
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Tally label="必須更換" n={count("必須更換")} className="bg-must-soft text-must" />
          <Tally label="可延後" n={count("可延後")} className="bg-defer-soft text-defer" />
          <Tally label="正常" n={count("正常")} className="bg-ok-soft text-ok" />
        </div>
      </header>

      <section className="space-y-3 px-4">
        {items.map((item) => (
          // 結論變了就重設卡片狀態（例如技師改值後，舊的延後選擇不能留著）。
          <ItemCard key={`${item.id}:${item.verdict.conclusion}`} item={item} />
        ))}
      </section>

      <p className="mx-4 mt-3 rounded-lg bg-white px-3 py-2 text-sm text-muted">
        行車摘要｜{vehicle.drivingNote}
      </p>

      <Chat
        vehicleId={vehicle.id}
        presets={presets}
        sourceLabels={sourceLabels}
        onFlow={onFlow}
        simulate={props.simulate}
      />

      {!props.onFlow && (
        <div className="mt-8 px-4">
          <FlowPanel entries={entries} />
        </div>
      )}

      <footer className="mt-10 px-4 text-xs text-muted">
        <p>結論由規則引擎依量測和安全門檻判定；AI 只負責查找和解釋。</p>
        <p className="mt-1">照片為示意圖，所有資料皆為展示用。</p>
        {others.length > 0 && (
          <p className="mt-4">
            換一台車看看：
            {others.map((o) => (
              <Link key={o.id} href={`/card/${o.id}`} className="ml-2 underline">
                {o.owner}
              </Link>
            ))}
          </p>
        )}
      </footer>
    </main>
  );
}

function Tally({ label, n, className }: { label: string; n: number; className: string }) {
  return (
    <div className={`rounded-lg py-2 ${className}`}>
      <p className="text-xl font-bold">{n}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function ItemCard({ item }: { item: CardItem }) {
  const { conclusion, reason, reminderMonths } = item.verdict;
  const [choice, setChoice] = useState<"today" | "defer" | null>(null);
  const [showPhoto, setShowPhoto] = useState(conclusion === "必須更換");

  return (
    <article className={`rounded-xl border border-line border-l-4 bg-white p-4 ${EDGE[conclusion]}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">{item.name}</h2>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${BADGE[conclusion]}`}>
          {conclusion}
        </span>
      </div>

      <p className="mt-2 text-sm">{reason}</p>
      {item.trend && <p className="mt-1 text-sm text-muted">量測趨勢：{item.trend}</p>}
      <p className="mt-1 text-sm text-muted">技師備註：{item.technicianNote}</p>

      <button onClick={() => setShowPhoto((s) => !s)} className="mt-2 text-sm text-muted underline">
        {showPhoto ? "收起照片" : "看技師照片"}
      </button>
      {showPhoto && (
        <figure className="relative mt-2 overflow-hidden rounded-lg border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photo} alt={`${item.name}照片`} className="w-full" />
          <figcaption className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            示意圖
          </figcaption>
        </figure>
      )}

      {conclusion === "必須更換" && (
        <p className="mt-3 rounded-lg bg-must-soft px-3 py-2 text-sm text-must">
          這是安全項目，已低於安全門檻，今天需要更換。
        </p>
      )}

      {conclusion === "可延後" && (
        <div className="mt-3">
          {choice === null && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setChoice("today")}
                className="rounded-lg border border-line py-2 text-sm font-semibold active:bg-paper"
              >
                今天換
              </button>
              <button
                onClick={() => setChoice("defer")}
                className="rounded-lg bg-ink py-2 text-sm font-semibold text-white active:opacity-80"
              >
                延後 {reminderMonths} 個月
              </button>
            </div>
          )}
          {choice === "today" && (
            <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">已告知專員：今天一併更換。</p>
          )}
          {choice === "defer" && (
            <p className="rounded-lg bg-defer-soft px-3 py-2 text-sm text-defer">
              已設定 {reminderMonths} 個月後回廠提醒，到時會再幫你檢查一次。
            </p>
          )}
          {choice !== null && (
            <button onClick={() => setChoice(null)} className="mt-1 text-xs text-muted underline">
              重新選擇
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Chat(props: {
  vehicleId: string;
  presets: Preset[];
  sourceLabels: Record<string, string>;
  onFlow: (entry: FlowEntry) => void;
  simulate?: boolean;
}) {
  const { vehicleId, presets, sourceLabels, onFlow } = props;
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
        body: JSON.stringify({ vehicleId, question }),
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
        body: JSON.stringify({ vehicleId, simulate: "tampered" }),
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
    <section className="mt-8 px-4">
      <h2 className="text-lg font-bold">有問題？直接問</h2>
      <p className="text-sm text-muted">回答只會引用這張卡上的資料，並附上來源。</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.question}
            onClick={() => askPreset(p)}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-sm active:bg-paper"
          >
            {p.question}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {messages.map((m, i) => (
          <Bubble key={i} message={m} sourceLabels={sourceLabels} />
        ))}
        {busy && <p className="text-sm text-muted">查找資料中…</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={askFree} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={200}
          placeholder="例如：電瓶還能用多久？"
          className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-base"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-lg bg-ink px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          送出
        </button>
      </form>

      {props.simulate && (
        <button
          onClick={askSimulated}
          disabled={busy}
          className="mt-3 w-full rounded-lg border-2 border-dashed border-defer bg-defer-soft py-2 text-sm font-semibold text-defer disabled:opacity-40"
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
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-white">
        {message.text}
      </p>
    );
  }
  if (message.role === "error") {
    return (
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-muted">
        {message.text}
        <Escalate />
      </div>
    );
  }
  const simulated = message.role === "simulated" ? message.result : undefined;
  const { answer, sources, escalate } = simulated ?? (message as { answer: Answer }).answer;
  return (
    <div
      className={`max-w-[90%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 ${simulated ? "border-2 border-dashed border-defer" : ""}`}
    >
      {simulated && (
        <p className="mb-2 rounded bg-defer-soft px-2 py-1 text-sm font-semibold text-defer">
          模擬｜AI 回答被竄改（未呼叫 AI）→ 答案檢查：
          {simulated.checkResult === "攔下" ? `攔下（${simulated.blockedReason}）` : "通過"}
          {simulated.checkResult === "攔下" && "。以下是改顯示的替代回答："}
        </p>
      )}
      <p>{answer}</p>
      {sources.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {sources.map((s) => (
            <li key={s} className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
              來源｜{sourceLabels[s] ?? s}
            </li>
          ))}
        </ul>
      )}
      {escalate && <Escalate />}
    </div>
  );
}

function Escalate() {
  const [called, setCalled] = useState(false);
  return called ? (
    <p className="mt-2 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">已通知服務專員，請稍候，專員會到你的座位說明。</p>
  ) : (
    <button
      onClick={() => setCalled(true)}
      className="mt-2 w-full rounded-lg bg-must py-2 text-sm font-semibold text-white active:opacity-80"
    >
      請專員來說明
    </button>
  );
}
