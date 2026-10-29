import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";

// 中文字型很大，不預載；載入前先用系統字型。
const noto = Noto_Sans_TC({ weight: "variable", preload: false, variable: "--font-noto" });

export const metadata: Metadata = {
  title: "維修決策卡｜Trust Intelligence",
  description: "看懂每一項維修建議，安心做決定。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1f38",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`h-full antialiased ${noto.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
