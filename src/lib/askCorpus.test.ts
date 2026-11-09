// 舊紀錄回放：拿已經存進 repo 的真實 AI 回答，確認新的「必須更換不能保證或延後」規則不會誤攔（#36 審查）。
// 紅隊紀錄有 AI 原始 JSON（mainRaw）；87 題紀錄只有畫面上的回答，結論照規則引擎補上。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuestions } from "../../scripts/questions";
import { ask } from "./ask";
import { hasKeyword } from "./manual";
import { applyPreferences } from "./preferences";
import { judge } from "./rules";
import { findVehicle, type Vehicle } from "./vehicles";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf-8");
const NEW_RULE = /是必須更換，回答卻說/;

type Case = { where: string; vehicle: Vehicle; question: string; raw: string };

const redteam: Case[] = ["full", "fix1", "fix2"].flatMap((label) =>
  (JSON.parse(read(`../../docs/eval/redteam/run_2026-11-09_${label}.json`)).redteam as { id: string; car: string; question: string; mainRaw?: string }[])
    .filter((r) => r.mainRaw)
    .map((r) => ({ where: `${label} ${r.id}`, vehicle: findVehicle(r.car)!, question: r.question, raw: r.mainRaw! })),
);

const questions = parseQuestions(read("../../scripts/測試題_追問AI.md"));
const eval87: Case[] = [1, 2, 3].flatMap((run) =>
  [...read(`../../docs/eval/raw/2026-11-09_template_run${run}.log`).replace(/\r/g, "").matchAll(/^#(\d+) 通過｜.*\n(?:.*\n)*?\s+回答：(.*)\n\s+來源：([^｜]*)｜/gm)].map(
    ([, no, answer, sources]) => {
      const q = questions.find((x) => x.no === Number(no))!;
      const base = findVehicle(q.vehicleId)!;
      const vehicle = q.preferences ? applyPreferences(base, { ...base.preferences, ...q.preferences })! : base;
      const itemConclusions = vehicle.items.filter((i) => hasKeyword(answer, i.keywords)).map((i) => ({ id: `item:${i.id}`, conclusion: judge(i).conclusion }));
      const raw = JSON.stringify({ answer, sources: sources.split(", ").filter(Boolean), escalate: false, itemConclusions });
      return { where: `run${run} #${no}`, vehicle, question: q.question, raw };
    },
  ),
);

describe("舊紀錄回放", () => {
  it("紀錄都讀得到（紅隊 3 次 × 182 題、87 題紀錄至少 80 題）", () => {
    expect(redteam).toHaveLength(546);
    expect(eval87.length).toBeGreaterThanOrEqual(80);
  });

  it("新規則只攔下審查確認過的回答：87 題 #4 的「定期追蹤，到時再換」講的是必須更換的煞車", async () => {
    const blocked: string[] = [];
    for (const c of [...redteam, ...eval87]) {
      const r = await ask(c.vehicle, c.question, async () => c.raw, { router: false });
      if (NEW_RULE.test(r.blockedReason ?? "")) blocked.push(c.where);
    }
    expect(blocked).toEqual(["run1 #4"]);
  });
});
