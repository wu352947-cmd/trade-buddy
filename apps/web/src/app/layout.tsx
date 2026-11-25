import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade Buddy — 全球行情研究终端",
  description:
    "Trade Buddy 个人全球行情研究与图表复盘终端（覆盖美股、A 股、港股、期货与指数；仅限研究与学习，无真实交易与杠杆）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="dark" data-color-scheme="intl">
      <body className="h-screen w-screen overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
