import type { NextRequest } from "next/server";
import { ask, simulateTampered, summarize } from "@/lib/ask";
import { applyMeasurements } from "@/lib/card";
import { callGemini } from "@/lib/gemini";
import { applyPreferences } from "@/lib/preferences";
import { createRateLimiter, limitFromEnv, PER_IP_WITHOUT_ID, PER_VISITOR } from "@/lib/rateLimit";
import { findVehicle } from "@/lib/vehicles";

const MAX_QUESTION_LENGTH = 200;
// 決賽現場多人共用同一個 Wi-Fi（同一個 IP）：IP 上限放寬，單一人狂刷由訪客上限擋。
const rateLimited = createRateLimiter({
  perIp: limitFromEnv(process.env.ASK_LIMIT_PER_IP_PER_MINUTE),
  perVisitor: PER_VISITOR,
  perIpWithoutId: PER_IP_WITHOUT_ID,
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const found = findVehicle(String(body?.vehicleId ?? ""));
  const question = String(body?.question ?? "").trim();

  if (!found) return Response.json({ error: "找不到這台車" }, { status: 404 });
  const measured = applyMeasurements(found, body?.measurements);
  if (!measured) return Response.json({ error: "量測值格式不正確" }, { status: 400 });
  const vehicle = applyPreferences(measured, body?.preferences);
  if (!vehicle) return Response.json({ error: "偏好格式不正確" }, { status: 400 });

  // 技師頁的「模擬：AI 回答被竄改」：不呼叫 AI，回傳結果標 simulated。
  if (body?.simulate === "tampered") {
    try {
      return Response.json(await simulateTampered(vehicle));
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  }
  // 技師頁的「檢查結果摘要」：不需要問題，其餘（限流、金鑰、錯誤處理）和追問相同。
  const summary = body?.summary === true;
  if (!summary && (!question || question.length > MAX_QUESTION_LENGTH)) {
    return Response.json({ error: `問題請在 ${MAX_QUESTION_LENGTH} 字以內` }, { status: 400 });
  }

  const failMessage = summary
    ? "AI 暫時無法整理摘要，請稍後再試"
    : "AI 暫時無法回答，請點上面的常見問題，或請專員來說明";

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip, request.headers.get("x-visitor-id") ?? undefined)) {
    const wait = summary ? "請稍等一分鐘再試" : "請先點上面的常見問題，或稍等一分鐘再試";
    return Response.json({ error: `問得有點快，${wait}` }, { status: 429 });
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
