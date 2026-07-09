import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "しいたけカレンダー - TRPG",
  description: "爆速で作成できるTRPG向けWebカレンダー",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="m-0 p-0 overflow-hidden">{children}</body>
    </html>
  );
}