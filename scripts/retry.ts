// 實測專用：Gemini 限流（429）或暫時錯誤（5xx、逾時）時等一下再試。
// 正式 API 路由不重試：車主那邊要立刻看到友善錯誤和常見問題按鈕。
// 格式錯誤、答案檢查不通過這類真的失敗不重試，照樣讓測試失敗。

const TRANSIENT = /Gemini (?:429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|TimeoutError|due to timeout|fetch failed/i;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, tries = 8): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = `${(err as Error).name}: ${(err as Error).message}`;
      if (!TRANSIENT.test(msg) || i >= tries) throw err;
      const wait = Math.min(15_000 * 2 ** (i - 1), 120_000);
      console.log(`  Gemini 暫時失敗（第 ${i} 次）：${msg.slice(0, 100)}｜${wait / 1000} 秒後重試`);
      await sleep(wait);
    }
  }
}
