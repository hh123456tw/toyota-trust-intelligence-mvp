import { excerptLabel } from "./manual";
import { judge } from "./rules";
import { formatPrice, trendText, type Vehicle } from "./vehicles";

// 來源代號：item:<檢查項目 id>、trend:<檢查項目 id>（量測趨勢）、doc:<片段 id>（原廠文件片段）或 driving（行車摘要）。
export type Answer = {
  answer: string;
  sources: string[];
  escalate: boolean;
};

export type Preset = {
  question: string;
  answer: Answer;
};

export function sourceLabel(vehicle: Vehicle, key: string): string | undefined {
  if (key === "driving") return `行車摘要（${vehicle.drivingSummary.period}）`;
  if (key.startsWith("item:")) {
    const item = vehicle.items.find((i) => `item:${i.id}` === key);
    if (!item) return undefined;
    const m = item.measurement;
    return m
      ? `${vehicle.technician}量測：${item.name} ${m.value} ${m.unit}`
      : `${vehicle.technician}檢查：${item.name}`;
  }
  if (key.startsWith("trend:")) {
    const item = vehicle.items.find((i) => `trend:${i.id}` === key);
    const trend = item && trendText(item);
    return trend && `量測趨勢：${item.name} ${trend}`;
  }
  if (key.startsWith("doc:")) return excerptLabel(key);
  return undefined;
}

export function validSources(vehicle: Vehicle, keys: string[]): string[] {
  return [...new Set(keys)].filter((k) => sourceLabel(vehicle, k) !== undefined);
}

// 常見問題：預先寫好的回答，AI 出錯時也能用。
const presets: Record<string, Preset[]> = {
  wang: [
    {
      question: "煞車下個月再換可以嗎？",
      answer: {
        answer:
          "不建議延後。陳技師量到前煞車來令片只剩約 2 mm，已低於安全門檻 3 mm。來令片太薄時，煞車距離會變長，也可能磨傷煞車碟盤。這個結論是依安全門檻判定的，無法延後；如果你還有疑慮，可以請專員當面說明。",
        sources: ["item:brake-pad"],
        escalate: true,
      },
    },
    {
      question: "電瓶為什麼衰退得比較快？",
      answer: {
        answer:
          "你近 3 個月約 78% 的行程在 10 公里內，每週約發動 11 次。短程行駛時，發電機來不及把電瓶充飽，電瓶比較難充飽，所以才用 1.5 年就可能衰退得比一般用車快。目前健康度 60%，還沒到必須更換的程度，所以可以延後，系統會在 3 個月後提醒你回廠再測一次。",
        sources: ["item:battery", "driving"],
        escalate: false,
      },
    },
    {
      question: "空氣濾網為什麼今天不用換？",
      answer: {
        answer:
          "陳技師檢查空氣濾網，顏色正常，也沒有明顯堵塞，所以今天不用換。下次保養時會再檢查一次。",
        sources: ["item:air-filter"],
        escalate: false,
      },
    },
  ],
  lin: [
    {
      question: "輪胎可以撐到下次保養嗎？",
      answer: {
        answer:
          "不建議延後。黃技師量到右前輪胎紋約 1.4 mm，已低於安全門檻 1.6 mm。你常跑高速公路，胎紋太淺在雨天容易打滑。這個結論是依安全門檻判定的，無法延後；如果你還有疑慮，可以請專員當面說明。",
        sources: ["item:tire", "driving"],
        escalate: true,
      },
    },
    {
      question: "煞車狀況怎麼樣？",
      answer: {
        answer: "黃技師量到前煞車來令片左右兩側皆約 7 mm，高於建議值，狀況正常，今天不用處理。",
        sources: ["item:brake-pad"],
        escalate: false,
      },
    },
    {
      question: "電瓶需要換嗎？",
      answer: {
        answer: "不需要。電瓶測試器顯示健康度 91%，狀況正常。你多跑長途，電瓶比較容易充飽。",
        sources: ["item:battery", "driving"],
        escalate: false,
      },
    },
  ],
};

export function presetsFor(vehicleId: string): Preset[] {
  return presets[vehicleId] ?? [];
}

// 卡片資料裡的每一個來源代號。流程面板用來列出給了 AI 哪些資料。
export function contextSources(vehicle: Vehicle): string[] {
  return [...vehicle.items.flatMap((i) => (trendText(i) ? [`item:${i.id}`, `trend:${i.id}`] : [`item:${i.id}`])), "driving"];
}

// 給 AI 的卡片資料：只包含它可以引用的內容。
export function cardContext(vehicle: Vehicle) {
  return {
    車主: vehicle.owner,
    車型: vehicle.model,
    里程: `${vehicle.mileageKm} km`,
    技師: vehicle.technician,
    行車摘要: { 來源代號: "driving", ...vehicle.drivingSummary },
    檢查項目: vehicle.items.map((item) => {
      const v = judge(item);
      const trend = trendText(item);
      return {
        來源代號: `item:${item.id}`,
        名稱: item.name,
        安全相關: item.safetyRelated,
        量測: item.measurement ? `${item.measurement.value} ${item.measurement.unit}` : "目視檢查",
        量測趨勢: trend ? { 來源代號: `trend:${item.id}`, 內容: trend } : null,
        技師備註: item.technicianNote,
        使用紀錄: item.history ?? null,
        結論: v.conclusion,
        // 卡片上只顯示必須更換、可延後項目的價格，AI 也只拿得到這些。
        示意費用: v.conclusion === "正常" ? null : formatPrice(item.price),
        結論理由: v.reason,
        回廠提醒月數: v.reminderMonths ?? null,
      };
    }),
  };
}
