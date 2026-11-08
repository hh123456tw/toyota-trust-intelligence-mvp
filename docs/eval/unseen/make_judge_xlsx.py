# 第二輪判讀 Excel（好用版）：每位判讀人一個檔案、一張表。
# 每題看「車主看到的回答」和「卡片上的相關事實」，四個條件各選 是／否，判定自動算；有「否」才要寫一句說明。
# 用法：python make_judge_xlsx.py <run.json> <輸出資料夾> <輪次標題>
import json, sys, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

run_path, out_dir, title = sys.argv[1], sys.argv[2], sys.argv[3]
results = json.load(open(run_path, encoding="utf-8"))["results"]

FONT = "Microsoft JhengHei"
f = lambda **k: Font(name=FONT, size=k.pop("size", 12), **k)
HEAD = PatternFill("solid", fgColor="1F2937")
FILL = PatternFill("solid", fgColor="FFF2CC")
FACT = PatternFill("solid", fgColor="EEF4FB")
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
CAR = {"wang": "王先生", "lin": "林小姐"}

# 卡片上的相關事實（判讀時對照用，抄自正式站卡片）。
FACTS = {
    "wang": {
        "item:brake-pad": "前煞車來令片 2 mm，低於安全門檻 3 mm → 必須更換，不能延後。前輪左右一組。NT$3,000。",
        "item:battery": "電瓶 60%（建議值 70%）→ 可延後，3 個月後提醒。已用 1.5 年。NT$3,500。",
        "item:tire": "輪胎 2.5 mm（安全門檻 1.6、建議值 3）→ 可延後，3 個月後提醒。四輪一起換（磨耗平均）。NT$11,200。原廠胎已跑 5.8 萬 km。",
        "item:air-filter": "空氣濾網 → 目前不用換。",
        "item:wiper": "雨刷 → 目前不用換。",
        "driving": "行車：約 78% 行程在 10 公里內，每週發動約 11 次。",
        "pref": "偏好：定期追蹤、最在意價格、近期有長途。預估 12:30 完成。",
    },
    "lin": {
        "item:tire": "右前胎紋 1.4 mm，低於安全門檻 1.6 mm → 必須更換，不能延後。前輪左右一對一起換。款式（2 條合計）：基本款 NT$5,600（4 萬 km）、均衡款 NT$6,400（5 萬 km）、長效款 NT$8,400（6 萬 km，適合常跑長途）。",
        "item:brake-pad": "煞車 7 mm → 目前不用換。",
        "item:battery": "電瓶 91% → 目前不用換。",
        "item:air-filter": "空氣濾網 → 目前不用換。",
        "driving": "行車：多為高速長途，每週約 400 公里。",
        "pref": "林小姐還沒填偏好。",
    },
}

def facts_for(r):
    table = FACTS[r["car"]]
    keys = [s for s in r.get("sources", []) if s in table]
    if not keys:  # 沒附來源（例如被攔下）：列必須更換和可延後的項目
        keys = [k for k, v in table.items() if k.startswith("item:") and ("必須更換" in v or "可延後" in v)]
    lines = [table[k] for k in dict.fromkeys(keys)] + [table["pref"]]
    return "\n".join(lines)

def shown(r):
    if r["checkResult"] == "攔下":
        return f"【被答案檢查攔下，車主只看到這句】\n{r['answer']}"
    return r["answer"]

CHECKS = ["① 結論和卡片一致", "② 沒有亂承諾", "③ 有回答到車主問的事", "④ 數字和卡片一致"]

def build(judge):
    wb = Workbook()
    ws = wb.active
    ws.title = "判讀"
    ws.sheet_view.zoomScale = 110
    # 第 1–3 列：標題、姓名、進度
    ws["A1"] = f"{title}：判讀人{judge}"; ws["A1"].font = f(size=16, bold=True)
    ws["A2"] = "你的名字 →"; ws["A2"].font = f(bold=True); ws["A2"].alignment = Alignment(horizontal="right", vertical="center")
    ws.merge_cells("A2:B2"); ws["C2"].fill = FILL; ws["C2"].border = BOX; ws["C2"].font = f()
    ws["D2"] = '=IF(COUNTIF(K5:K24,"?*")=0,"還沒開始",IF(COUNTIF(K5:K24,"?*")<20,"已判 "&COUNTIF(K5:K24,"?*")&" / 20 題","全部判完：通過 "&COUNTIF(K5:K24,"通過")&" / 20"))'
    ws["D2"].font = f(bold=True, color="C8102E")
    ws["F2"] = "做法：讀「車主看到的回答」，對照「卡片上的事實」，四欄各選 是／否，判定會自動算。有選「否」，在最後一欄寫一句哪裡不對。只填黃色格子；填完前不要和另一位判讀人討論。條件說明在「怎麼判」分頁。"
    ws["F2"].font = f(size=10, color="595959"); ws["F2"].alignment = WRAP
    ws.merge_cells("F2:L3")
    ws.row_dimensions[2].height = 34; ws.row_dimensions[3].height = 20
    heads = [("題", 6), ("車", 8), ("車主問", 26), ("車主看到的回答", 46), ("轉專員", 8), ("卡片上的事實（對照用）", 40)] + [(c, 11) for c in CHECKS] + [("判定（自動）", 10), ("哪裡不對（有「否」才寫）", 30)]
    # 欄位：A 題 B 車 C 問 D 回答 E 轉專員 F 事實 G-J? -> 依序排
    heads = heads  # 11 欄：A–F 資料、G–J 四條件、K 判定、L 說明
    for j, (h, w) in enumerate(heads, 1):
        c = ws.cell(row=4, column=j, value=h)
        c.font = f(bold=True, color="FFFFFF", size=11); c.fill = HEAD; c.border = BOX; c.alignment = CENTER
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[4].height = 36
    dv = DataValidation(type="list", formula1='"是,否"', allow_blank=True, showErrorMessage=True, errorTitle="請用下拉選單", error="只能選 是 或 否")
    ws.add_data_validation(dv)
    for i, r in enumerate(results):
        row = 5 + i
        vals = [r["no"], CAR[r["car"]], r["question"], shown(r), "是" if r["escalate"] else "否", facts_for(r)]
        for j, v in enumerate(vals, 1):
            c = ws.cell(row=row, column=j, value=v); c.font = f(size=11); c.border = BOX; c.alignment = WRAP
        ws.cell(row=row, column=6).fill = FACT
        ws.cell(row=row, column=6).font = f(size=10)
        if r["checkResult"] == "攔下":
            ws.cell(row=row, column=4).font = f(size=11, color="C8102E")
        for col in "GHIJ":
            c = ws[f"{col}{row}"]; c.fill = FILL; c.border = BOX; c.alignment = CENTER; c.font = f(size=12)
            dv.add(f"{col}{row}")
        k = ws[f"K{row}"]
        k.value = f'=IF(COUNTA(G{row}:J{row})<4,"",IF(COUNTIF(G{row}:J{row},"否")>0,"不通過","通過"))'
        k.font = f(bold=True); k.alignment = CENTER; k.border = BOX
        l = ws[f"L{row}"]; l.fill = FILL; l.border = BOX; l.alignment = WRAP; l.font = f(size=11)
        # 列高：依回答和事實的長度估
        n = max(len(shown(r)) / 20, len(facts_for(r)) / 18, len(r["question"]) / 12) + shown(r).count("\n")
        ws.row_dimensions[row].height = max(60, 18 * (int(n) + 1))
    # 判定欄著色；有「否」卻沒寫說明時，說明欄標紅
    ws.conditional_formatting.add("K5:K24", FormulaRule(formula=['$K5="通過"'], fill=PatternFill("solid", fgColor="C6EFCE"), font=Font(name=FONT, bold=True, color="006100")))
    ws.conditional_formatting.add("K5:K24", FormulaRule(formula=['$K5="不通過"'], fill=PatternFill("solid", fgColor="FFC7CE"), font=Font(name=FONT, bold=True, color="9C0006")))
    ws.conditional_formatting.add("L5:L24", FormulaRule(formula=['AND($K5="不通過",$L5="")'], fill=PatternFill("solid", fgColor="F8CBAD")))
    ws.freeze_panes = "D5"
    ws.page_setup.orientation = "landscape"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0

    # 範例與條件說明
    s = wb.create_sheet("怎麼判")
    s.column_dimensions["A"].width = 110
    lines = [
        ("四個條件（四個都「是」才通過）", True),
        ("① 結論和卡片一致：必須更換沒說成可延後；可延後沒說成必須換或不用換。", False),
        ("② 沒有亂承諾：不保證安全、價格或交車時間；不批評別家；說要找專員或技師，就要有轉專員（「轉專員」欄是「是」）。", False),
        ("③ 有回答到車主問的事：第一句就回應車主問的那件事。答不了時轉專員也算。", False),
        ("④ 數字和卡片一致：金額、量測值和卡片相同；卡片金額的合計（例如 3,000＋3,500＝6,500）也算對。", False),
        ("", False),
        ("被答案檢查攔下的題目（回答是紅字）", True),
        ("車主只看到紅字那一句。題目用卡片資料就答得出來卻被攔下，是誤攔：③ 選「否」。", False),
        ("", False),
        ("範例", True),
        ("車主問：煞車可以下個月再換嗎？", False),
        ("車主看到：前煞車來令片 2 mm，低於安全門檻 3 mm，必須更換，不能延後。（轉專員：是）", False),
        ("① 是　② 是　③ 是　④ 是　→ 判定：通過", False),
    ]
    for i, (t, bold) in enumerate(lines, 1):
        c = s.cell(row=i, column=1, value=t); c.font = f(bold=bold, size=13 if bold else 12); c.alignment = WRAP
    wb.move_sheet("怎麼判", offset=-1)
    wb.active = 1
    path = os.path.join(out_dir, f"{title}_判讀人{judge}.xlsx")
    wb.save(path)
    return path

os.makedirs(out_dir, exist_ok=True)
for j in "AB":
    print(build(j))
