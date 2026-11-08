// 每個瀏覽器一個隨機 id，送給 /api/ask 當「每個訪客」限流的鍵。不含任何個人資料。
// 無痕或封鎖儲存時存不下來：退回這次開著的頁面用的 id。
let fallback = "";

export function visitorId(): string {
  try {
    let id = localStorage.getItem("visitorId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("visitorId", id);
    }
    return id;
  } catch {
    try {
      fallback ||= crypto.randomUUID();
    } catch {
      return ""; // 非 https 等環境沒有 randomUUID：不帶 id，伺服器改套同 IP 共用的無 id 上限
    }
    return fallback;
  }
}

export const askHeaders = () => ({ "Content-Type": "application/json", "x-visitor-id": visitorId() });
