import { describe, expect, it } from "vitest";
import { createRateLimiter, limitFromEnv } from "./rateLimit";

function setup(perIp: number, perVisitor: number, perIpWithoutId = perIp) {
  let t = 1_000_000;
  const limited = createRateLimiter({ perIp, perVisitor, perIpWithoutId, now: () => t });
  return { limited, tick: (ms: number) => (t += ms) };
}

const times = (n: number, f: () => boolean) => Array.from({ length: n }, f);

describe("提問限流：每個 IP 與每個訪客", () => {
  it("IP 上限：同一個 IP 第 N+1 次被擋，其他 IP 不受影響", () => {
    const { limited } = setup(3, 100);
    expect(times(3, () => limited("1.1.1.1"))).toEqual([false, false, false]);
    expect(limited("1.1.1.1")).toBe(true);
    expect(limited("2.2.2.2")).toBe(false);
  });

  it("訪客上限：同一個訪客第 N+1 次被擋，同 IP 的其他訪客照常", () => {
    const { limited } = setup(100, 2);
    expect(times(2, () => limited("1.1.1.1", "a"))).toEqual([false, false]);
    expect(limited("1.1.1.1", "a")).toBe(true);
    expect(limited("1.1.1.1", "b")).toBe(false);
  });

  it("兩者都有：訪客沒超過，但同 IP 合計超過 IP 上限時被擋", () => {
    const { limited } = setup(3, 2);
    expect([limited("1.1.1.1", "a"), limited("1.1.1.1", "a"), limited("1.1.1.1", "b")]).toEqual([false, false, false]);
    expect(limited("1.1.1.1", "c")).toBe(true);
  });

  it("被訪客上限擋下的請求不算進 IP 次數，不連累同 Wi-Fi 的其他人", () => {
    const { limited } = setup(5, 3);
    times(3, () => limited("1.1.1.1", "spam"));
    times(10, () => limited("1.1.1.1", "spam")); // 全部被擋
    expect(times(2, () => limited("1.1.1.1", "judge"))).toEqual([false, false]);
    expect(limited("1.1.1.1", "other")).toBe(true); // IP 合計 5 次已滿
  });

  // Codex 審查：省略 id 就能用完整 IP 額度。沒帶或格式不對的 id 改走較緊的「無 id 共用桶」。
  it("沒帶 id 或格式不對：同 IP 共用較緊的無 id 上限，有 id 的人照常用 IP 額度", () => {
    const { limited } = setup(10, 5, 3);
    expect([limited("1.1.1.1"), limited("1.1.1.1", "a b"), limited("1.1.1.1", "x".repeat(65))]).toEqual([false, false, false]);
    expect(limited("1.1.1.1")).toBe(true);
    expect(limited("1.1.1.1", "")).toBe(true);
    // 反例：同 IP 有合法 id 的訪客不受無 id 上限影響；別的 IP 的無 id 桶是分開的。
    expect(limited("1.1.1.1", "judge")).toBe(false);
    expect(limited("2.2.2.2")).toBe(false);
  });

  it("無 id 的次數也算進 IP 合計", () => {
    const { limited } = setup(4, 5, 3);
    times(3, () => limited("1.1.1.1"));
    expect(limited("1.1.1.1", "a")).toBe(false);
    expect(limited("1.1.1.1", "b")).toBe(true); // IP 合計 4 次已滿
  });

  it("沒帶訪客 id 或 id 格式不對：只套 IP 上限", () => {
    const { limited } = setup(5, 1);
    expect(times(5, () => limited("1.1.1.1"))).toEqual([false, false, false, false, false]);
    expect(limited("1.1.1.1")).toBe(true);
    const other = setup(5, 1).limited;
    // 太長或有怪字元的 id 視同沒帶，不會變成每次換 id 就繞過，也不會被當成同一個訪客。
    expect(times(3, () => other("3.3.3.3", "x".repeat(65)))).toEqual([false, false, false]);
    expect(times(2, () => other("4.4.4.4", "a b"))).toEqual([false, false]);
  });

  it("超過後一分鐘恢復", () => {
    const { limited, tick } = setup(2, 1);
    limited("1.1.1.1", "a");
    expect(limited("1.1.1.1", "a")).toBe(true);
    tick(59_999);
    expect(limited("1.1.1.1", "a")).toBe(true);
    tick(1);
    expect(limited("1.1.1.1", "a")).toBe(false);
  });
});

describe("IP 上限的環境變數", () => {
  it("正整數照用，沒設或不合法用預設 300", () => {
    expect(limitFromEnv("50")).toBe(50);
    for (const raw of [undefined, "", "abc", "0", "-5", "1.5"]) expect(limitFromEnv(raw), String(raw)).toBe(300);
  });
});
