// /api/ask 的限流：每個 IP 與每個訪客（瀏覽器 localStorage 裡的隨機 id）各自計算一分鐘內的次數。
// 決賽現場評審和觀眾共用同一個 Wi-Fi（同一個 IP），IP 上限要寬；擋單一人狂刷靠訪客上限。
// shortcut: 計數放在記憶體，Vercel 多個實例各算各的、冷啟動會歸零；正式上線或要精確限流時換成 KV（如 Upstash Redis）。

const WINDOW_MS = 60_000;
const DEFAULT_PER_IP = 300;
const VISITOR_ID = /^[\w-]{1,64}$/;

export function limitFromEnv(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : DEFAULT_PER_IP;
}

export function createRateLimiter({ perIp, perVisitor, now = Date.now }: { perIp: number; perVisitor: number; now?: () => number }) {
  const hits = new Map<string, number[]>();

  const recent = (key: string, t: number) => {
    const list = (hits.get(key) ?? []).filter((x) => t - x < WINDOW_MS);
    hits.set(key, list);
    return list;
  };

  // 回傳 true 代表要擋。被擋的請求不記次數，所以狂刷的訪客不會吃掉同 IP 其他人的額度。
  return function limited(ip: string, visitorId?: string): boolean {
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((x) => t - x < WINDOW_MS)) hits.delete(k);

    const visitor = visitorId && VISITOR_ID.test(visitorId) ? recent(`v:${visitorId}`, t) : null;
    if (visitor && visitor.length >= perVisitor) return true;
    const byIp = recent(`ip:${ip}`, t);
    if (byIp.length >= perIp) return true;
    byIp.push(t);
    visitor?.push(t);
    return false;
  };
}
