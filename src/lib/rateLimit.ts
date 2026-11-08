// /api/ask 的限流：每個 IP 與每個訪客（瀏覽器 localStorage 裡的隨機 id）各自計算一分鐘內的次數。
// 決賽現場評審和觀眾共用同一個 Wi-Fi（同一個 IP），IP 上限要寬；擋單一人狂刷靠訪客上限。
// 沒帶或格式不對的訪客 id 不享有完整 IP 額度：同一個 IP 的這些請求共用一個較緊的「無 id 桶」。
// shortcut: 訪客 id 由瀏覽器自己產生，輪換 id 仍可分攤到 IP 上限；正式版改用伺服器簽發（簽章）的 id。
// shortcut: 計數放在記憶體，Vercel 多個實例各算各的、冷啟動會歸零；正式上線或要精確限流時換成 KV（如 Upstash Redis）。

const WINDOW_MS = 60_000;
const DEFAULT_PER_IP = 300;
export const PER_VISITOR = 20;
export const PER_IP_WITHOUT_ID = 60;
const VISITOR_ID = /^[\w-]{1,64}$/;

export function limitFromEnv(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : DEFAULT_PER_IP;
}

export function createRateLimiter({
  perIp,
  perVisitor,
  perIpWithoutId,
  now = Date.now,
}: {
  perIp: number;
  perVisitor: number;
  perIpWithoutId: number;
  now?: () => number;
}) {
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

    const valid = visitorId !== undefined && VISITOR_ID.test(visitorId);
    const own = valid ? recent(`v:${visitorId}`, t) : recent(`noid:${ip}`, t);
    if (own.length >= (valid ? perVisitor : perIpWithoutId)) return true;
    const byIp = recent(`ip:${ip}`, t);
    if (byIp.length >= perIp) return true;
    byIp.push(t);
    own.push(t);
    return false;
  };
}
