import { describe, expect, it } from "vitest";
import { presetsFor } from "./answers";
import { findVehicle } from "./vehicles";

describe("王先生展示資料", () => {
  const wang = findVehicle("wang")!;

  it("電瓶 60%、短程 78%", () => {
    expect(wang.items.find((i) => i.id === "battery")!.measurement!.value).toBe(60);
    expect(wang.drivingSummary.shortTripRatio).toBe(78);
  });

  it("常見問題預寫回答使用相同數字", () => {
    const battery = presetsFor("wang").find((p) => p.question.includes("電瓶"))!;
    expect(battery.answer.answer).toContain("78%");
    expect(battery.answer.answer).toContain("60%");
    const all = presetsFor("wang").map((p) => p.answer.answer).join();
    expect(all).not.toMatch(/\b(80|68)%/);
  });
});
