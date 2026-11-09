# 產生 A/B 盲評包。每題用固定種子隨機決定哪一版標 A。
# 用法：python -X utf8 docs/eval/quality/ab_human/make_packet.py
import json
import random
from pathlib import Path

HERE = Path(__file__).parent
Q = HERE.parent
OLD = Q / "run_baseline_d0e574e.json"
NEW = Q / "run_human_t37symptom.json"
SEED = 37

# 卡片事實（抄自 src/lib/vehicles.ts 和 rules.ts），判讀 (d) 用。兩版共用，不透露版本。
CARDS = """\
## 卡片事實（判讀「正確、沒有越權」時對照）

共同規則：煞車來令片 < 3 mm 必須更換、< 5 mm 可延後；輪胎胎紋 < 1.6 mm 必須更換、< 3 mm 可延後；電瓶健康度 < 70% 可延後。目視項目技師判正常即「目前不用換」。可延後和正常的項目卡片不列費用、不主動列款式。可延後項目 3 個月後提醒回廠（濾網 6 個月）。費用都是「示意費用，實際以服務廠報價為準」。AI 只能講卡片上的檢查結果；不能猜故障原因、不能保證安全、不能改結論、不能報卡片沒有的價格。

**wang（王先生，COROLLA CROSS，58,200 km，近 3 個月 78% 行程在 10 km 內、每週發動約 11 次；偏好：定期追蹤到時再換、最在意價格、下週要載家人長途）**
- 前煞車來令片：2 mm（半年前 3.5 mm），低於安全門檻 3 mm → 必須更換。NT$3,000。範圍：前輪左右一組，兩側一起換。風險：煞車距離變長、可能磨傷碟盤。
- 電瓶：健康度 60%（半年前 72%），啟動正常 → 可延後，3 個月後提醒。NT$3,500。已使用 1.5 年（2025-03 換）。CCA 340，新品額定 430。
- 空氣濾網：目視正常 → 目前不用換。NT$600。
- 雨刷：目視正常，膠條無裂痕 → 目前不用換。NT$800。
- 輪胎胎紋：四輪約 2.5 mm（半年前 3.1 mm），磨耗平均 → 可延後，3 個月後提醒。NT$11,200（每條 NT$2,800 × 4 條）。原廠胎，交車後沒換過。範圍：四輪一起換。

**lin（林小姐，YARIS CROSS，71,400 km，多為高速公路長途、每週約 400 km）**
- 輪胎胎紋：右前輪 1.4 mm（半年前 2.5 mm），低於安全門檻 1.6 mm → 必須更換。NT$5,600 起（依款式；最低款每條 NT$2,800 × 2 條）。範圍：前輪左右一對，同軸一起換。款式：基本款（每條 2,800，壽命約 4 萬 km，濕地 B，72 dB，多半市區短程）、均衡款（每條 3,200，約 5 萬 km，濕地 B，70 dB，市區和高速都開）、長效款（每條 4,200，約 6 萬 km，濕地 A，69 dB，常跑長途）。
- 前煞車來令片：7 mm（半年前 7.8 mm）→ 目前不用換。NT$3,000。
- 電瓶：健康度 91%（半年前 94%）→ 目前不用換。NT$3,500。
- 空氣濾網：目視正常 → 目前不用換。NT$600。
- 沒有雨刷這個項目。
"""


def render(reply):
    out = reply["answer"].strip()
    if reply.get("intake"):
        qs = "、".join(reply["intake"]["questions"])
        out += f"\n\n［回答下方附症狀登記題目：{qs}］"
    if reply.get("escalate"):
        out += "\n［畫面顯示：已轉專員］"
    return out


def main():
    old = {r["no"]: r for r in json.load(OLD.open(encoding="utf-8"))["results"]}
    new = {r["no"]: r for r in json.load(NEW.open(encoding="utf-8"))["results"]}
    assert old.keys() == new.keys(), "兩版題號不一致"
    rng = random.Random(SEED)
    key = {}
    lines = ["# 好用度 A/B 盲評包", "",
             "兩個版本的 AI 助理回答同一批車主提問。請照 `rubric.md` 的四項（a 回答到問題、b 簡潔、c 口氣像真人助理、d 正確沒有越權）各給 A、B 1–5 分，寫一句「客人看了會怎麼想」，最後選客人比較想要哪一個（A／B／平手）。",
             "多輪題只評最後一句的回答；前幾句只當上下文。「症狀登記題目」和「已轉專員」是回答的一部分。", "",
             CARDS, "## 題目", ""]
    for no in sorted(old):
        o, n = old[no], new[no]
        assert o["turns"] == n["turns"]
        a_is_new = rng.random() < 0.5
        key[no] = "new" if a_is_new else "old"
        a, b = (n, o) if a_is_new else (o, n)
        lines.append(f"### {no}（車：{o['car']}；類別：{o['category']}）")
        if len(o["turns"]) > 1:
            lines.append("前幾句：" + " ／ ".join(o["turns"][:-1]))
        lines.append(f"**車主問：** {o['turns'][-1]}")
        lines.append("")
        lines.append("**A：**\n" + render(a["replies"][-1]))
        lines.append("")
        lines.append("**B：**\n" + render(b["replies"][-1]))
        lines.append("")
    (HERE / "judge_packet.md").write_text("\n".join(lines), encoding="utf-8")
    json.dump({"seed": SEED, "old": OLD.name, "new": NEW.name, "A_is": key},
              (HERE / "ab_key.json").open("w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # 自我檢查：盲評包不能帶版本線索
    text = (HERE / "judge_packet.md").read_text(encoding="utf-8")
    for leak in ["commit", "d0e574e", "t37", "human", "baseline", "onlyLast", "router", "seconds", "sources", "run_"]:
        assert leak not in text, f"盲評包含版本線索：{leak}"
    print(f"{len(key)} 題；A 是新版的題數 {sum(v == 'new' for v in key.values())}")


if __name__ == "__main__":
    main()
