// 實測專用：Gemini 限流（429）或暫時錯誤（5xx、逾時）時等一下再試。
// 正式 API 路由不重試：車主那邊要立刻看到友善錯誤和常見問題按鈕。
// 格式錯誤、答案檢查不通過這類真的失敗不重試，照樣讓測試失敗。

// 只看 HTTP 狀態碼（callGemini 的錯誤以「Gemini <狀態碼>:」開頭）和逾時、斷線；不看回應內文的關鍵字，
// 免得「Gemini 403: model unavailable」這種永久錯誤因內文碰巧有 unavailable 而一直重試。
const TRANSIENT_STATUS = /^Gemini (?:429|500|502|503|504):/;
const TRANSIENT_NETWORK = /^(?:TimeoutError|AbortError)$|^fetch failed$/;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 預設 6 次：最壞情況每次都逾時 15 秒，加上 15＋30＋60＋120＋120 秒等待，約 7.5 分鐘，在測試的 10 分鐘上限內。
export async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const { name, message } = err as Error;
      const transient = TRANSIENT_STATUS.test(message) || TRANSIENT_NETWORK.test(name) || TRANSIENT_NETWORK.test(message);
      if (!transient || i >= tries) throw err;
      const wait = Math.min(15_000 * 2 ** (i - 1), 120_000);
      console.log(`  Gemini 暫時失敗（第 ${i} 次）：${name}: ${message.slice(0, 100)}｜${wait / 1000} 秒後重試`);
      await sleep(wait);
    }
  }
}
