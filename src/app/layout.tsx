import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.medipre.jp"),
  title: "medipre（メディプリ）",
  description: "予約確認・同意取得・来院確認をひとつに。医療機関向け予約確認サービス「medipre」",
  openGraph: {
    title: "medipre（メディプリ）",
    description: "予約確認・同意取得・来院確認をひとつに。医療機関向け予約確認サービス「medipre」",
    url: "https://www.medipre.jp",
    siteName: "medipre",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "medipre（メディプリ）" }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "medipre（メディプリ）",
    description: "予約確認・同意取得・来院確認をひとつに。医療機関向け予約確認サービス「medipre」",
    images: ["/opengraph-image"],
  },
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
