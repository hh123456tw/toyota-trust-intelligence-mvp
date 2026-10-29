// 展示用假資料。門檻數字是展示用，不代表原廠標準。

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
  photo: string;
  // 示意費用（零件＋工資，NT$）。正式導入時來自服務廠工單報價。
  price: number;
};

export type DrivingSummary = {
  period: string;
  shortTripRatio: number;
  note: string;
};

export type Vehicle = {
  id: string;
  owner: string;
  model: string;
  plate: string;
  mileageKm: number;
  technician: string;
  inspectedAt: string;
  drivingSummary: DrivingSummary;
  items: InspectionItem[];
};

const brakeRule: MeasuredRule = { kind: "measured", mustBelow: 3, deferBelow: 5, reminderMonths: 3 };
const tireRule: MeasuredRule = { kind: "measured", mustBelow: 1.6, deferBelow: 3, reminderMonths: 3 };
const batteryRule: MeasuredRule = { kind: "measured", deferBelow: 70, reminderMonths: 3 };
const airFilterRule: VisualRule = { kind: "visual", reminderMonths: 6 };
const wiperRule: VisualRule = { kind: "visual", reminderMonths: 3 };

export const vehicles: Vehicle[] = [
  {
    id: "wang",
    owner: "王先生",
    model: "TOYOTA COROLLA CROSS",
    plate: "ABC-1234",
    mileageKm: 58200,
    technician: "陳技師",
    inspectedAt: "2026-09-25",
    drivingSummary: {
      period: "近 3 個月",
      shortTripRatio: 78,
      note: "約 78% 的行程在 10 公里內，多為市區通勤短程。",
    },
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
        photo: "/photos/brake-pad.svg",
        price: 3000,
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
        photo: "/photos/battery.svg",
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
        photo: "/photos/air-filter.svg",
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
        photo: "/photos/wiper.svg",
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
        photo: "/photos/tire.svg",
        price: 12000,
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
      note: "多為高速公路長途行駛，每週約 400 公里。",
    },
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
        photo: "/photos/tire.svg",
        price: 3200,
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
        photo: "/photos/brake-pad.svg",
        price: 3000,
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
        photo: "/photos/battery.svg",
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
        photo: "/photos/air-filter.svg",
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

export function formatPrice(price: number): string {
  return `NT$${price.toLocaleString("en-US")}`;
}

export function findVehicle(id: string): Vehicle | undefined {
  return vehicles.find((v) => v.id === id);
}
