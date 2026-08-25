import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // 営業用レポート（医院の実名・写真を含む）。検索エンジンへのインデックスを禁止する。
        // HTMLはmeta robotsも持つが、PDFはmetaを持てないためヘッダーで担保する。
        source: "/reports/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // サイト全体を一時的に非公開（開発中）にするための共通ゲート。metaタグを持てないAPI等もヘッダーで担保する。
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
