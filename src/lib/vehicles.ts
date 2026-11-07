// 展示用假資料。門檻數字是展示用，不代表原廠標準。
import type { Conclusion } from "./rules";

export type Measurement = {
  value: number;
  unit: string;
};

// 量測型項目：依數值和門檻判定。
// mustBelow 只給和安全相關的項目；deferBelow 以下算「可延後」。
export type MeasuredRule = {
  kind: "measured";
  mustBelow?: number;
  deferBelow: number;
  reminderMonths?: number;
};

// 目視型項目：技師直接判定狀況良好或需處理。
export type VisualRule = {
  kind: "visual";
  reminderMonths: number;
};

// 必須更換時車主可以選的產品（示意）。AI 拿得到款式和規格，可以依車主需求建議；拿不到優惠，建議不受折扣影響。
export type ProductOption = {
  id: string;
  name: string;
  use: string;
  specs: string;
  price: number;
  sale?: { original: number; until: string };
};

export type InspectionItem = {
  id: string;
  name: string;
  // 車主提問時可能用來指稱這個項目的字詞。
  keywords: string[];
  safetyRelated: boolean;
  rule: MeasuredRule | VisualRule;
  measurement?: Measurement;
  // 半年前上次回廠的量測（量測趨勢）。只當解釋的來源，規則引擎不讀。
  previousMeasurement?: Measurement;
  visualOk?: boolean;
  technicianNote: string;
  // 技師量測或目視檢查的時間（HH:MM）。和規則版本、技師一起當判定依據。
  measuredAt: string;
  // 零件使用紀錄，例如電瓶上次更換到現在多久。卡片顯示，AI 也可以引用（來源同 item:<id>）。
  history?: string;
  // 電瓶測試器的冷啟動電流（CCA，示意）。standard 是新品額定值，舊電瓶低於它是正常衰退。
  // 只在卡片顯示，規則引擎不讀，結論仍看健康度。
  cca?: { value: number; standard: number };
  photo: string;
  // 示意費用（零件＋工資，NT$）。正式導入時來自服務廠工單報價。
  price: number;
  // 判定必須更換時，卡片上直接說明不換的風險。
  mustReplaceRisk?: string;
  // 要換的時候一次換多少。費用是這個範圍的總價（示意）。
  replaceScope?: string;
  options?: ProductOption[];
};

export type DrivingSummary = {
  period: string;
  shortTripRatio: number;
  weeklyStarts: number;
  note: string;
};

export type Vehicle = {
  id: string;
  owner: string;
  model: string;
  plate: string;
  mileageKm: number;
  // 保固狀態（示意）。卡片上方顯示，AI 也讀得到。
  warranty?: string;
  technician: string;
  inspectedAt: string;
  drivingSummary: DrivingSummary;
  // APP 互動紀錄（示意，需車主授權）：車主在 App 追問費用的次數。決定決策卡要不要先列費用。
  appRecord?: { period: string; priceQuestions: number };
  // 定期保養本來就會做的項目（不經規則引擎），交車說明列在「今天完成」。
  routine: string[];
  // 下次定期保養還有幾公里，交車說明的「下次提醒」用。
  nextServiceKm: number;
  // 保養進度（示意）。time 沒有值表示還沒到這一步；eta 沒有值時只顯示階段。
  progress: { stage: string; time?: string }[];
  eta?: string;
  items: InspectionItem[];
};

// 規則表版本。正式導入時由原廠技術部門訂定並版本化。
export const RULE_VERSION = "R-2026.10";

const brakeRule: MeasuredRule = { kind: "measured", mustBelow: 3, deferBelow: 5, reminderMonths: 3 };
const tireRule: MeasuredRule = { kind: "measured", mustBelow: 1.6, deferBelow: 3, reminderMonths: 3 };
const batteryRule: MeasuredRule = { kind: "measured", deferBelow: 70, reminderMonths: 3 };
const airFilterRule: VisualRule = { kind: "visual", reminderMonths: 6 };
const wiperRule: VisualRule = { kind: "visual", reminderMonths: 3 };

// 輪胎款式兩台車共用（示意），價格依更換條數計算。price 一律是最低款的價格，AI 和接待摘要講的「起」才對得上清單。
const TIRE_BASE_PRICE = 2800;
function tireOptions(count: number): ProductOption[] {
  return [
    { id: "basic", name: "基本款", use: "多半市區短程", specs: "預估壽命約 4 萬 km｜濕地抓地 B 級｜胎噪 72 dB", price: TIRE_BASE_PRICE * count },
    {
      id: "balanced",
      name: "均衡款",
      use: "市區和高速都會開",
      specs: "預估壽命約 5 萬 km｜濕地抓地 B 級｜胎噪 70 dB",
      price: 3200 * count,
      sale: { original: 3600 * count, until: "11/30" },
    },
    { id: "long", name: "長效款", use: "常跑長途、年里程高", specs: "預估壽命約 6 萬 km｜濕地抓地 A 級｜胎噪 69 dB", price: 4200 * count },
  ];
}

export const vehicles: Vehicle[] = [
  {
    id: "wang",
    owner: "王先生",
    model: "TOYOTA COROLLA CROSS",
    plate: "ABC-1234",
    mileageKm: 58200,
    warranty: "剛過原廠保固",
    technician: "陳技師",
    inspectedAt: "2026-09-25",
    drivingSummary: {
      period: "近 3 個月",
      shortTripRatio: 78,
      weeklyStarts: 11,
      note: "約 78% 的行程在 10 公里內，多為市區通勤短程，每週約發動 11 次。",
    },
    appRecord: { period: "近 6 個月", priceQuestions: 4 },
    routine: ["機油與機油芯"],
    nextServiceKm: 5000,
    progress: [
      { stage: "接待完成", time: "10:05" },
      { stage: "技師檢查", time: "11:20" },
      { stage: "車主確認", time: "11:25" },
      { stage: "施工品檢" },
      { stage: "完工交車" },
    ],
    eta: "16:20",
    items: [
      {
        id: "brake-pad",
        keywords: ["煞車", "來令片"],
        name: "前煞車來令片",
        safetyRelated: true,
        rule: brakeRule,
        measurement: { value: 2, unit: "mm" },
        previousMeasurement: { value: 3.5, unit: "mm" },
        technicianNote: "左右兩側皆約 2 mm，已低於安全門檻 3 mm。",
        measuredAt: "10:42",
        photo: "/photos/brake-pad-worn.webp",
        price: 3000,
        mustReplaceRisk: "來令片太薄時，煞車距離會變長，也可能磨傷煞車碟盤。",
        replaceScope: "前輪左右一組，兩側一起換",
      },
      {
        id: "battery",
        keywords: ["電瓶", "電池"],
        name: "電瓶",
        safetyRelated: false,
        rule: batteryRule,
        measurement: { value: 60, unit: "%" },
        previousMeasurement: { value: 72, unit: "%" },
        technicianNote: "電瓶測試器顯示健康度 60%，啟動正常。",
        history: "已使用 1.5 年（上次更換工單：2025-03）",
        cca: { value: 340, standard: 430 },
        measuredAt: "10:50",
        photo: "/photos/battery.webp",
        price: 3500,
      },
      {
        id: "air-filter",
        keywords: ["空氣濾網", "濾網"],
        name: "空氣濾網",
        safetyRelated: false,
        rule: airFilterRule,
        visualOk: true,
        technicianNote: "濾網顏色正常，無明顯堵塞。",
        measuredAt: "10:55",
        photo: "/photos/air-filter.webp",
        price: 600,
      },
      {
        id: "wiper",
        keywords: ["雨刷"],
        name: "雨刷",
        safetyRelated: false,
        rule: wiperRule,
        visualOk: true,
        technicianNote: "刮拭乾淨，膠條無裂痕。",
        measuredAt: "11:00",
        photo: "/photos/wiper.webp",
        price: 800,
      },
      {
        id: "tire",
        keywords: ["輪胎", "胎紋"],
        name: "輪胎胎紋",
        safetyRelated: true,
        rule: tireRule,
        measurement: { value: 5.2, unit: "mm" },
        previousMeasurement: { value: 6, unit: "mm" },
        technicianNote: "四輪胎紋約 5.2 mm，磨耗平均。",
        measuredAt: "11:10",
        photo: "/photos/tire-ok.webp",
        price: TIRE_BASE_PRICE * 4,
        mustReplaceRisk: "胎紋太淺時，雨天容易打滑，煞車距離也會變長。",
        replaceScope: "四輪一起換（四輪磨耗平均）",
        options: tireOptions(4),
      },
    ],
  },
  {
    id: "lin",
    owner: "林小姐",
    model: "TOYOTA YARIS CROSS",
    plate: "XYZ-5678",
    mileageKm: 71400,
    technician: "黃技師",
    inspectedAt: "2026-09-25",
    drivingSummary: {
      period: "近 3 個月",
      shortTripRatio: 20,
      weeklyStarts: 6,
      note: "多為高速公路長途行駛，每週約 400 公里。",
    },
    routine: ["機油與機油芯"],
    nextServiceKm: 5000,
    progress: [
      { stage: "接待完成", time: "09:30" },
      { stage: "技師檢查", time: "10:40" },
      { stage: "車主確認", time: "10:45" },
      { stage: "施工品檢" },
      { stage: "完工交車" },
    ],
    items: [
      {
        id: "tire",
        keywords: ["輪胎", "胎紋"],
        name: "輪胎胎紋",
        safetyRelated: true,
        rule: tireRule,
        measurement: { value: 1.4, unit: "mm" },
        previousMeasurement: { value: 2.5, unit: "mm" },
        technicianNote: "右前輪胎紋約 1.4 mm，已低於安全門檻 1.6 mm。",
        measuredAt: "10:05",
        photo: "/photos/tire-worn.webp",
        price: TIRE_BASE_PRICE * 2,
        mustReplaceRisk: "胎紋太淺時，雨天容易打滑，煞車距離也會變長。",
        replaceScope: "前輪左右一對，同軸一起換，兩側抓地力才一致",
        options: tireOptions(2),
      },
      {
        id: "brake-pad",
        keywords: ["煞車", "來令片"],
        name: "前煞車來令片",
        safetyRelated: true,
        rule: brakeRule,
        measurement: { value: 7, unit: "mm" },
        previousMeasurement: { value: 7.8, unit: "mm" },
        technicianNote: "左右兩側皆約 7 mm。",
        measuredAt: "10:15",
        photo: "/photos/brake-pad-ok.webp",
        price: 3000,
        mustReplaceRisk: "來令片太薄時，煞車距離會變長，也可能磨傷煞車碟盤。",
        replaceScope: "前輪左右一組，兩側一起換",
      },
      {
        id: "battery",
        keywords: ["電瓶", "電池"],
        name: "電瓶",
        safetyRelated: false,
        rule: batteryRule,
        measurement: { value: 91, unit: "%" },
        previousMeasurement: { value: 94, unit: "%" },
        technicianNote: "電瓶測試器顯示健康度 91%。",
        measuredAt: "10:25",
        photo: "/photos/battery.webp",
        price: 3500,
      },
      {
        id: "air-filter",
        keywords: ["空氣濾網", "濾網"],
        name: "空氣濾網",
        safetyRelated: false,
        rule: airFilterRule,
        visualOk: true,
        technicianNote: "濾網顏色正常，無明顯堵塞。",
        measuredAt: "10:30",
        photo: "/photos/air-filter.webp",
        price: 600,
      },
    ],
  },
];

// 量測趨勢的顯示文字。沒有上次量測（含目視型項目）就不顯示。
export function trendText(item: InspectionItem): string | undefined {
  const prev = item.previousMeasurement;
  const now = item.measurement;
  if (!prev || !now) return undefined;
  return `半年前 ${prev.value} ${prev.unit} → 本次 ${now.value} ${now.unit}`;
}

// 折扣只改變「選哪一款」，不能推著車主提早換：可延後和正常的項目不顯示。由低價排到高價，不預選。
export function visibleOptions(item: InspectionItem, conclusion: Conclusion): ProductOption[] | undefined {
  if (conclusion !== "必須更換" || !item.options?.length) return undefined;
  return [...item.options].sort((a, b) => a.price - b.price);
}

// 給 AI 和接待摘要的費用文字。必須更換且有款式時，費用依車主選的款式而定。
export function priceLabel(item: Pick<InspectionItem, "price" | "options">, mustReplace: boolean): string {
  return mustReplace && item.options?.length ? `${formatPrice(item.price)} 起（依款式）` : formatPrice(item.price);
}

export function formatPrice(price: number): string {
  return `NT$${price.toLocaleString("en-US")}`;
}

export function findVehicle(id: string): Vehicle | undefined {
  return vehicles.find((v) => v.id === id);
}
