import { afterEach, describe, expect, it, vi } from "vitest";
import { RESPONSE_SCHEMA, ROUTER_PROMPT, ROUTER_SCHEMA } from "./ask";
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

  it("呼叫端傳的 schema 原樣送出（分類器）；沒傳（反例）用主回答 schema", async () => {
    const schemaOf = async (system: string) => {
      const f = stubFetch(ok());
      await callGemini("k", system, "u", undefined, undefined, system === ROUTER_PROMPT ? ROUTER_SCHEMA : undefined);
      return JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body).generationConfig.responseSchema;
    };
    expect(await schemaOf(ROUTER_PROMPT)).toEqual(ROUTER_SCHEMA);
    expect(await schemaOf("s")).toEqual(RESPONSE_SCHEMA);
  });

  it("傳入的 AbortSignal 會傳給 fetch：呼叫端 abort，fetch 的 signal 也 abort", async () => {
    const f = stubFetch(ok());
    const ctrl = new AbortController();
    await callGemini("k", "s", "u", undefined, ctrl.signal);
    const signal = (f.mock.calls[0] as unknown as [string, { signal: AbortSignal }])[1].signal;
    expect(signal.aborted).toBe(false);
    ctrl.abort();
    expect(signal.aborted).toBe(true);
  });

  it("反例：沒傳 signal 時照舊有逾時 signal，不會被取消", async () => {
    const f = stubFetch(ok());
    await callGemini("k", "s", "u");
    const signal = (f.mock.calls[0] as unknown as [string, { signal: AbortSignal }])[1].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it("等重試時被取消 → 不再送第二次", async () => {
    const ctrl = new AbortController();
    const f = vi.fn(async () => {
      ctrl.abort();
      return fail(503);
    });
    vi.stubGlobal("fetch", f);
    await expect(callGemini("k", "s", "u", undefined, ctrl.signal)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("反例：400、401、402 不重試", async () => {
    for (const status of [400, 401, 402]) {
      const f = stubFetch(fail(status));
      await expect(callGemini("k", "s", "u")).rejects.toThrow(`Gemini ${status}`);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
});
