import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 錄 Demo 影片時不要讓開發指示器入鏡。
  devIndicators: false,
  // 用 127.0.0.1 開 dev server 時，Next 預設擋掉開發用 JS，頁面不會 hydrate，按鈕全部按不動。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
