import { afterEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

afterEach(() => vi.useRealTimers());

describe("withRetry：實測遇到暫時錯誤才重試", () => {
  it("429 之後成功 → 回傳結果，共呼叫 2 次", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValueOnce(new Error("Gemini 429: RESOURCE_EXHAUSTED")).mockResolvedValueOnce("ok");
    const p = withRetry(fn);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("逾時（TimeoutError）也重試", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const fn = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce("ok");
    const p = withRetry(fn);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("ok");
  });

  it("反例：格式錯誤、400、金額 429 元這類字樣都不重試，直接丟錯", async () => {
    for (const msg of [
      "AI 回應格式無法解析",
      "Gemini 400: INVALID_ARGUMENT",
      "回答提到的金額 NT$4290 不在卡片上",
      // 內文碰巧含 unavailable、RESOURCE_EXHAUSTED，但狀態碼是永久錯誤。
      "Gemini 403: model unavailable in your region",
      "Gemini 404: RESOURCE_EXHAUSTED is not a model",
      // 近似但不是 429 的狀態碼。
      "Gemini 4290: weird",
    ]) {
      const fn = vi.fn().mockRejectedValue(new Error(msg));
      await expect(withRetry(fn)).rejects.toThrow(msg);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("一直限流：試滿次數後丟出最後的錯誤", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new Error("Gemini 503: UNAVAILABLE"));
    const p = withRetry(fn, 3);
    const done = expect(p).rejects.toThrow("503");
    await vi.runAllTimersAsync();
    await done;
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
