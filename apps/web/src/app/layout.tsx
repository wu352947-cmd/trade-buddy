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
  const initThemeScript = `try{var r=localStorage.getItem("trade-buddy:preferences:v1");if(r){var p=JSON.parse(r);if(p.theme==="light"||p.theme==="dark"){document.documentElement.setAttribute("data-theme",p.theme);}if(p.colorScheme==="cn"||p.colorScheme==="intl"){document.documentElement.setAttribute("data-color-scheme",p.colorScheme);}}}catch(e){}`;
  return (
    <html
      lang="zh-CN"
      data-theme="dark"
      data-color-scheme="intl"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: initThemeScript }} />
      </head>
      <body className="h-screen w-screen overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
