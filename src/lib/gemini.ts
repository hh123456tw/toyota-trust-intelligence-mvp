// 呼叫 Gemini，回傳 JSON 文字。API 路由和 21 題實測腳本共用。
import { schemaFor } from "./ask";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

// 503（模型忙碌）和 429（限流）通常幾秒就恢復：車主不該因此看到錯誤，短暫重試。
const RETRY_STATUS = new Set([429, 503]);
const RETRY_DELAYS_MS = [500, 1_500];

async function request(apiKey: string, system: string, user: string): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schemaFor(system),
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

export type GeminiUsage = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };

// onUsage：成本實測腳本用來讀 token 數；正式路由不傳，回答行為不變。
export async function callGemini(
  apiKey: string,
  system: string,
  user: string,
  onUsage?: (usage: GeminiUsage) => void,
): Promise<string> {
  let res = await request(apiKey, system, user);
  for (const delay of RETRY_DELAYS_MS) {
    if (!RETRY_STATUS.has(res.status)) break;
    await new Promise((r) => setTimeout(r, delay));
    res = await request(apiKey, system, user);
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const data = await res.json();
  onUsage?.(data.usageMetadata ?? {});
  const text: string | undefined = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini 沒有回傳內容");
  return text;
}
