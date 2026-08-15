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
    ];
  },
};

export default nextConfig;
