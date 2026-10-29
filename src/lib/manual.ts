// 原廠文件片段：摘自比賽提供的《TOYOTA回廠服務流程手冊》，內文照抄 PDF（只去掉換行和項目符號）。
// page 是手冊印在頁面上的頁碼（手冊目錄「請見p.X」用的也是這個），等於 PDF 頁數減 1。
// 手冊只有回廠流程，沒有煞車、電瓶、輪胎、空氣濾網的內容（見 issue #7 留言），所以這裡沒有那些片段。

export type Excerpt = {
  id: string;
  doc: string;
  page: number;
  text: string;
  // 問題包含任一關鍵字就挑這段。避免太常見的字（例如「多久」「檢查」），以免不相關問題也挑到。
  keywords: string[];
};

const DOC = "回廠服務流程手冊";

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
    keywords: ["等多久", "要等", "等待時間", "客休室"],
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
];

export function findExcerpts(question: string): Excerpt[] {
  return EXCERPTS.filter((e) => e.keywords.some((k) => question.includes(k)));
}

// 來源代號 doc:<片段 id> 的顯示文字；片段不存在回傳 undefined。
export function excerptLabel(key: string): string | undefined {
  const e = EXCERPTS.find((x) => `doc:${x.id}` === key);
  return e && `${e.doc} p.${e.page}`;
}
