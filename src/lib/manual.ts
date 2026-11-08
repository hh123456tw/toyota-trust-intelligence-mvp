// 原廠文件片段，內文照抄 PDF（只去掉換行、項目符號和標點旁的空白）。
// 1. 比賽提供的《TOYOTA回廠服務流程手冊》：page 是手冊印在頁面上的頁碼（手冊目錄「請見p.X」用的也是這個），等於 PDF 頁數減 1。
//    這份手冊只有回廠流程，沒有煞車、電瓶、輪胎、空氣濾網的內容（見 issue #7 留言）。
// 2. 那四項取自 TOYOTA 官網 COROLLA CROSS 車型頁公開的《車主手冊》（2025.10 起適用，汽油版）：
//    https://hotaicdn.azureedge.net/toyotaweb/car_manual_20251210140600H8A4H4IN.pdf
//    page 是頁面上印的頁碼，和 PDF 頁數相同。保養表照 PDF 文字順序抄成一行。

export type Excerpt = {
  id: string;
  doc: string;
  page: number;
  text: string;
  // 問題包含任一關鍵字就挑這段。避免太常見的字（例如「多久」「檢查」），以免不相關問題也挑到。
  keywords: string[];
};

const DOC = "回廠服務流程手冊";
const OWNER = "COROLLA CROSS 車主手冊";
// 車主手冊只適用一種車型；不在這張表的文件（回廠服務流程手冊）各車型通用。別的車型不給這份手冊，避免引用錯車型的頁碼。
const MANUAL_MODEL: Record<string, string> = { [OWNER]: "TOYOTA COROLLA CROSS" };
const fitsModel = (e: Excerpt, model: string) => !Object.hasOwn(MANUAL_MODEL, e.doc) || MANUAL_MODEL[e.doc] === model;
const TABLE_HEAD =
  "保養操作：I = 檢查、修正、清潔或視需要更換 R = 更換、變更或潤滑\n保養間隔：里程表讀數 月數(里程表讀數或月數，以先到者為準。) x1,000 km 10 20 30 40 50 60 70 80";

export const EXCERPTS: Excerpt[] = [
  {
    id: "booking",
    doc: DOC,
    page: 2,
    text: "可透過下列管道預約回廠：\n電話\nMY TOYOTA APP\n官方LINE預約(請參考附件)",
    keywords: ["怎麼預約", "預約回廠", "預約管道"],
  },
  {
    id: "booking-reminder",
    doc: DOC,
    page: 2,
    text: "提醒回廠：\n預約前兩天透過電話提醒車主準時入廠；\n預約當天在預約前30分鐘提醒車主",
    keywords: ["預約前", "預約當天", "提醒我回廠"],
  },
  {
    id: "staff-training",
    doc: DOC,
    page: 3,
    text: "系統自動分配專員服務：\n所有專員與技師均有通過原廠課程訓練，確保服務品質與技術\n*若有指定專員則以車主為主",
    keywords: ["訓練", "原廠課程", "指定專員", "專業嗎"],
  },
  {
    id: "protection",
    doc: DOC,
    page: 3,
    text: "裝設保護措施\n(座椅、腳踏墊、方向盤保護套)",
    keywords: ["保護套", "保護措施", "腳踏墊", "弄髒"],
  },
  {
    id: "reception-record",
    doc: DOC,
    page: 4,
    text: "專員利用平板記錄車主行駛紀錄(里程數、車內相關設定等)\n→確保交車時恢復原樣、節省紙張紀錄時間",
    keywords: ["車內設定", "恢復原樣", "設定會被改"],
  },
  {
    id: "work-confirm",
    doc: DOC,
    page: 4,
    text: "與車主確認入廠施作項目(保養或需維修)，並進行時間與費用預估\n進行環車檢查確認是否需增加項目\n完成後請車主簽名確認進行施作",
    keywords: ["費用", "多少錢", "估價", "簽名", "環車", "施作項目", "要修多久"],
  },
  {
    id: "lounge-wait",
    doc: DOC,
    page: 5,
    text: "車主平均在客休室等待時間為一至兩小時",
    keywords: ["等多久", "等待時間", "客休室"],
  },
  {
    id: "progress-board",
    doc: DOC,
    page: 7,
    text: "電子看板：\n提供進度確認與車輛相關維修、商品資訊",
    keywords: ["進度", "看板"],
  },
  {
    id: "mid-report",
    doc: DOC,
    page: 8,
    text: "檢修過程中若技師發現有其他需更換項目，將與客人進行中間報告確認檢修數據與新增的待修項目",
    keywords: ["中間報告", "另外發現", "新增", "追加", "其他需更換"],
  },
  {
    id: "progress-update",
    doc: DOC,
    page: 8,
    text: "等待過程中由服務專員與車主說明現在維修進度",
    keywords: ["進度", "修到哪"],
  },
  {
    id: "delivery",
    doc: DOC,
    page: 8,
    text: "完工交車(服務專員)\n實車說明確認檢修項目\n展示替換舊品\n恢復車主設定並移除保護措施\n下次保養時間說明",
    keywords: ["交車", "舊品", "舊零件", "換下來", "保養時間", "什麼時候保養"],
  },
  {
    id: "checkout",
    doc: DOC,
    page: 9,
    text: "確認車主資料與今日費用\n為響應環保無紙化，維修明細與收據上傳My TOYOTA App查詢，年節約1千萬張紙\n為節省車主時間，服務專員亦可提供桌邊結帳\n回廠保養/維修/精品消費可用和泰Point折抵",
    keywords: ["結帳", "收據", "明細", "付款", "Point", "折抵"],
  },
  {
    id: "aftercare",
    doc: DOC,
    page: 10,
    text: "為確保車主離廠後用車狀況，將透過APP/官方LINE/簡訊/電話等管道與車主聯繫。",
    keywords: ["離廠後", "關懷", "聯繫", "回訪"],
  },
  {
    id: "owner-battery-interval",
    doc: OWNER,
    page: 216,
    text: `${TABLE_HEAD}\n8 電瓶 I I I I I I I I 12`,
    keywords: ["電瓶", "電池"],
  },
  {
    id: "owner-battery-check",
    doc: OWNER,
    page: 228,
    text: "以下列方式檢查電瓶。\n電瓶外部\n確認電瓶樁頭未腐蝕且無鬆脫、龜裂或固定夾鬆脫。",
    keywords: ["電瓶", "電池"],
  },
  {
    id: "owner-brake-interval",
    doc: OWNER,
    page: 216,
    text: `${TABLE_HEAD}\n底盤和車身\n14 煞車塊和煞車碟盤 I I I I I I I I 6`,
    keywords: ["煞車", "來令片"],
  },
  {
    id: "owner-tire-check",
    doc: OWNER,
    page: 231,
    text: "檢查胎紋磨耗指示是否出現在輪胎上。此外，檢查輪胎的不均勻磨損(例如：胎面單側過度磨損)。\n依照保養週期及磨耗狀態進行更換或輪胎調位。",
    keywords: ["輪胎", "胎紋"],
  },
  {
    id: "owner-tire-replace",
    doc: OWNER,
    page: 232,
    text: "何時更換輪胎\n在下列情況時應更換輪胎：\n輪胎上出現胎紋磨耗指示。\n輪胎有割傷、脫層、裂痕深度可見到內層纖維及因內傷造成的隆起。\n如您無法確定輪胎狀況，請洽 Toyota 保養廠。",
    keywords: ["輪胎", "胎紋"],
  },
  {
    id: "owner-air-filter-interval",
    doc: OWNER,
    page: 216,
    text: `${TABLE_HEAD}\n燃油和廢氣排放控制系統\n10 空氣濾芯 I R I R I：24 R：48`,
    keywords: ["空氣濾網", "濾網", "空氣濾芯"],
  },
  {
    id: "owner-air-filter-check",
    doc: OWNER,
    page: 230,
    text: "檢查濾芯外表，如果太髒時應更換。\n如果濾芯僅沾滿灰塵，則使用壓縮空氣由內往外將灰塵吹掉。",
    keywords: ["空氣濾網", "濾網", "空氣濾芯"],
  },
];

// 字面包含項目關鍵字、其實是別的零件：比對前先拿掉。追問流程比對檢查項目也用這個。
export const OTHER_PARTS = /煞車油|煞車燈|冷氣濾網|遙控器電池|鑰匙電池/g;

// 文字包含任一關鍵字（英文不分大小寫）。追問流程比對檢查項目也用這個。
export function hasKeyword(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

export function findExcerpts(question: string, model: string): Excerpt[] {
  const q = question.replace(OTHER_PARTS, "");
  return EXCERPTS.filter((e) => fitsModel(e, model) && hasKeyword(q, e.keywords));
}

// 來源代號 doc:<片段 id> 的顯示文字；片段不存在或不適用這個車型時回傳 undefined。
export function excerptLabel(key: string, model: string): string | undefined {
  const e = EXCERPTS.find((x) => `doc:${x.id}` === key && fitsModel(x, model));
  return e && `${e.doc} p.${e.page}`;
}
