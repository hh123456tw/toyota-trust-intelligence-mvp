import type { NextRequest } from "next/server";
import { ask, simulateTampered, summarize } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { findVehicle } from "@/lib/vehicles";

const MAX_QUESTION_LENGTH = 200;
// 決賽現場多人共用同一個 Wi-Fi（同一個 IP），6 次會擋到一般人；60 次只擋程式狂刷。
const LIMIT_PER_MINUTE = 60;

// 每個 IP 每分鐘的提問次數。Serverless 上只是盡力而為，足夠擋住展示時被刷。
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT_PER_MINUTE;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const vehicle = findVehicle(String(body?.vehicleId ?? ""));
  const question = String(body?.question ?? "").trim();

  if (!vehicle) return Response.json({ error: "找不到這台車" }, { status: 404 });

  // 技師頁的「模擬：AI 回答被竄改」：不呼叫 AI，回傳結果標 simulated。
  if (body?.simulate === "tampered") {
    try {
      return Response.json(await simulateTampered(vehicle));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }
  // 技師頁的「接待摘要」：不需要問題，其餘（限流、金鑰、錯誤處理）和追問相同。
  const summary = body?.summary === true;
  if (!summary && (!question || question.length > MAX_QUESTION_LENGTH)) {
    return Response.json({ error: `問題請在 ${MAX_QUESTION_LENGTH} 字以內` }, { status: 400 });
  }

  const failMessage = summary
    ? "AI 暫時無法整理摘要，請稍後再試"
    : "AI 暫時無法回答，請點上面的常見問題，或請專員來說明";

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "問得有點快，請稍等一分鐘再試" }, { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: failMessage }, { status: 503 });
  }

  try {
    const callAI = (system: string, user: string) => callGemini(apiKey, system, user);
    return Response.json(summary ? await summarize(vehicle, callAI) : await ask(vehicle, question, callAI));
  } catch (err) {
    console.error(err);
    return Response.json({ error: failMessage }, { status: 502 });
  }
}
