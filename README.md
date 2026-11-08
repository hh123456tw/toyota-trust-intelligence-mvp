This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 規則和 AI 的分工

原則：規則列舉得完的用規則；組合太多、要解釋原因的才用 AI。

- 規則產生（不經 AI）：維修結論、接待摘要（`src/lib/reception.ts`）、摘要最後的車主偏好行、規則版摘要。
- AI 產生、再過答案檢查：追問回答、檢查結果摘要（`src/lib/ask.ts` 的 `SUMMARY_PROMPT`）。
- 檢查結果摘要（11/8 補強）：必須更換永遠先講，寫量測值和安全門檻；可延後的項目加一句原因，只能用卡片上的量測趨勢、使用紀錄、行車摘要；依車主偏好調整說法（最在意價格先講今天要付的費用、定期追蹤不建議今天換、近期長途提醒出發前再測）。答案檢查另外攔：漏項、必須更換沒有先講、可延後被說成今天換或不能延後、金額不在卡片上（含國字金額）。沒通過就改顯示規則版摘要。
- 只重跑摘要實測：`npx vitest run --config scripts/vitest.eval.config.mts scripts/summary.eval.ts`（需要 `.env.local` 的 `GEMINI_API_KEY`）。紀錄在 `docs/eval/raw/2026-11-08_summary_v2_run1..3.log`。
- 車主偏好分兩層：長期偏好（處理方式、最在意）以車主為鍵，下次回廠沿用；本次情況（近期長途行程、最近有異常）以這次工單為鍵，換工單就不沿用。示意版存在瀏覽器，正式版寫回和泰車主檔。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
