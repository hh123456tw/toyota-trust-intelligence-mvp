import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";

// 用模擬竄改的路徑：不呼叫 AI、不需要金鑰，回 200 代表資料有通過格式檢查。
const post = (body: object) =>
  POST(new Request("http://local/api/ask", { method: "POST", body: JSON.stringify(body) }) as unknown as NextRequest);

describe("POST /api/ask：偏好格式檢查", () => {
  it("格式錯誤的偏好回 400", async () => {
    for (const preferences of [null, "能等就等", { handling: "等一下" }, { longTrip: true }, { budget: "低" }]) {
      const res = await post({ vehicleId: "wang", simulate: "tampered", preferences });
      expect(res.status, JSON.stringify(preferences)).toBe(400);
      expect((await res.json()).error).toBe("偏好格式不正確");
    }
  });

  // 審查發現：用「key in 物件」判斷會認到繼承的屬性（toString、constructor、__proto__），toString 會拋錯變 500。
  it("偏好欄位名稱是物件內建屬性時回 400，不拋錯", async () => {
    for (const preferences of ['{"toString":"x"}', '{"constructor":"x"}', '{"__proto__":"x"}', '{"hasOwnProperty":"能等就等"}']) {
      const raw = `{"vehicleId":"wang","simulate":"tampered","preferences":${preferences}}`;
      const res = await POST(new Request("http://local/api/ask", { method: "POST", body: raw }) as unknown as NextRequest);
      expect(res.status, preferences).toBe(400);
      expect((await res.json()).error).toBe("偏好格式不正確");
    }
  });

  it("反例：合法偏好、沒送偏好都照常處理", async () => {
    for (const body of [{ preferences: { handling: "一次處理完" } }, {}]) {
      const res = await post({ vehicleId: "wang", simulate: "tampered", ...body });
      expect(res.status).toBe(200);
    }
  });
});
