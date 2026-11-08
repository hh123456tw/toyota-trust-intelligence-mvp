import { afterEach, describe, expect, it, vi } from "vitest";
import { callGemini } from "./gemini";

const ok = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "回答" }] } }] }), { status: 200 });
const fail = (status: number) => new Response("錯誤", { status });

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift()!);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("callGemini 重試", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("503 一次後成功：回傳內容", async () => {
    const f = stubFetch(fail(503), ok());
    await expect(callGemini("k", "s", "u")).resolves.toBe("回答");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("429 也重試", async () => {
    const f = stubFetch(fail(429), ok());
    await expect(callGemini("k", "s", "u")).resolves.toBe("回答");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("一直 503：重試 2 次後回錯誤，不產生假回答", async () => {
    const f = stubFetch(fail(503), fail(503), fail(503));
    await expect(callGemini("k", "s", "u")).rejects.toThrow("Gemini 503");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("反例：逾時不重試，直接回錯誤", async () => {
    const f = vi.fn(async () => {
      throw new DOMException("逾時", "TimeoutError");
    });
    vi.stubGlobal("fetch", f);
    await expect(callGemini("k", "s", "u")).rejects.toThrow("逾時");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("onUsage 收到回應的 usageMetadata，回答不變", async () => {
    const usage = { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 };
    const body = { candidates: [{ content: { parts: [{ text: "回答" }] } }], usageMetadata: usage };
    stubFetch(new Response(JSON.stringify(body), { status: 200 }));
    const got: object[] = [];
    await expect(callGemini("k", "s", "u", (u) => got.push(u))).resolves.toBe("回答");
    expect(got).toEqual([usage]);
  });

  it("反例：400、401、402 不重試", async () => {
    for (const status of [400, 401, 402]) {
      const f = stubFetch(fail(status));
      await expect(callGemini("k", "s", "u")).rejects.toThrow(`Gemini ${status}`);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
});
