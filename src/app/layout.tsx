import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "医療向け予約保証プラットフォーム",
  description: "予約確認・同意取得・QR来院確認・無断キャンセル抑止",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
