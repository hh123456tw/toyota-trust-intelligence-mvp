// 實測專用設定（npm run eval:21：21 題＋接待摘要）。不在 npm test 範圍內，會呼叫真的 Gemini。
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    include: ["scripts/*.eval.ts"],
    env: loadEnv("", process.cwd(), ""),
    testTimeout: 30_000,
    fileParallelism: false,
    silent: false,
    reporters: ["verbose"],
  },
});
