import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "首都圏 天気・運行情報",
  description: "川口市・台東区の天気予報と首都圏の運行情報をまとめて確認できます。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
