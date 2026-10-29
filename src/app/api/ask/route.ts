import type { NextRequest } from "next/server";
import { ask } from "@/lib/ask";
import { callGemini } from "@/lib/gemini";
import { findVehicle } from "@/lib/vehicles";

const MAX_QUESTION_LENGTH = 200;
const LIMIT_PER_MINUTE = 6;

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
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return Response.json({ error: `問題請在 ${MAX_QUESTION_LENGTH} 字以內` }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "問得有點快，請稍等一分鐘再試" }, { status: 429 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI 暫時無法回答，請點上面的常見問題，或請專員來說明" }, { status: 503 });
  }

  try {
    return Response.json(await ask(vehicle, question, (system, user) => callGemini(apiKey, system, user)));
  } catch (err) {
    console.error(err);
    return Response.json({ error: "AI 暫時無法回答，請點上面的常見問題，或請專員來說明" }, { status: 502 });
  }
}
