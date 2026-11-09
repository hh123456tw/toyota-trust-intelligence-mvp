# 解盲：把兩位判讀者的 A/B 分數對回新舊版，印出統計（README 的表由這裡產生）。
# 用法：python -X utf8 docs/eval/quality/ab_human/unblind.py
import json
from pathlib import Path

HERE = Path(__file__).parent
Q = HERE.parent
key = json.load((HERE / "ab_key.json").open(encoding="utf-8"))
A_is = key["A_is"]
judges = {
    "Fable": json.load((HERE / "judge_fable.json").open(encoding="utf-8")),
    "Codex gpt-6.1-sol": json.load((HERE / "judge_codex_sol.txt").open(encoding="utf-8")),
}
old = {r["no"]: r for r in json.load((Q / key["old"]).open(encoding="utf-8"))["results"]}
new = {r["no"]: r for r in json.load((Q / key["new"]).open(encoding="utf-8"))["results"]}
ITEMS = "abcd"


def side(no, ver):
    return "A" if A_is[no] == ver else "B"


def avg(xs):
    return sum(xs) / len(xs)


def main():
    out = []
    for name, j in judges.items():
        assert set(j) == set(A_is), f"{name} 題號不齊"
        s = {"new": [[] for _ in ITEMS], "old": [[] for _ in ITEMS]}
        win = lose = tie = 0
        for no in A_is:
            for ver in ("new", "old"):
                for i, v in enumerate(j[no][side(no, ver)]):
                    s[ver][i].append(v)
            p = j[no]["prefer"]
            if p == "tie":
                tie += 1
            elif p == side(no, "new"):
                win += 1
            else:
                lose += 1
        out.append(f"### {name}\n")
        out.append("| 版本 | 總平均 | a 回答到 | b 簡潔 | c 口氣 | d 正確 |")
        out.append("|---|---|---|---|---|---|")
        for ver, label in (("new", "新版"), ("old", "舊版")):
            cols = [avg(x) for x in s[ver]]
            out.append(f"| {label} | {avg([v for x in s[ver] for v in x]):.2f} | " + " | ".join(f"{c:.2f}" for c in cols) + " |")
        out.append(f"\n新版勝 {win}／平 {tie}／負 {lose}（共 {len(A_is)} 題）\n")
    # (d)=1 的題
    out.append("## (d) 正確不越權拿 1 分的題\n")
    any_d1 = False
    for ver, label, runs in (("new", "新版", new), ("old", "舊版", old)):
        for no in sorted(A_is):
            hits = [name for name, j in judges.items() if j[no][side(no, ver)][3] == 1]
            if hits:
                any_d1 = True
                r = runs[no]
                out.append(f"- **{no}（{label}，{r['car']}，{'、'.join(hits)} 給 1 分）** 車主問：{r['turns'][-1]}")
                out.append(f"  回答：{r['replies'][-1]['answer']}")
                for name in hits:
                    out.append(f"  {name}：{judges[name][no]['note']}")
    if not any_d1:
        out.append("（沒有）")
    # 兩位偏好不同的題
    out.append("\n## 兩位偏好不同的題\n")
    names = list(judges)
    for no in sorted(A_is):
        ps = [judges[n][no]["prefer"] for n in names]
        if ps[0] != ps[1]:
            lab = lambda p: "平手" if p == "tie" else ("新版" if p == side(no, "new") else "舊版")
            out.append(f"- {no}：{names[0]} 選{lab(ps[0])}；{names[1]} 選{lab(ps[1])}")
    # 新版最差題（兩位四項合計）
    out.append("\n## 新版分數最低的題（兩位四項合計，滿分 40）\n")
    tot = {no: sum(sum(j[no][side(no, "new")]) for j in judges.values()) for no in A_is}
    for no in sorted(tot, key=tot.get)[:5]:
        out.append(f"- {no}（{tot[no]}）車主問：{new[no]['turns'][-1]}\n  回答：{new[no]['replies'][-1]['answer']}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
