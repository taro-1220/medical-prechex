import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "medipre（メディプリ）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "white",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "18px",
              background: "#0f766e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ color: "white", fontSize: "40px", fontWeight: 900 }}>M</div>
          </div>
          <div style={{ color: "#0f766e", fontSize: "72px", fontWeight: 900, letterSpacing: "-2px" }}>
            medipre
          </div>
        </div>
        <div style={{ color: "#374151", fontSize: "28px", fontWeight: 700, marginBottom: "20px" }}>
          メディプリ
        </div>
        <div
          style={{
            color: "#6b7280",
            fontSize: "26px",
            textAlign: "center",
            lineHeight: 1.7,
          }}
        >
          予約確認・同意取得・来院確認をひとつに。
        </div>
        <div
          style={{
            marginTop: "48px",
            padding: "14px 40px",
            borderRadius: "100px",
            border: "2px solid #ccfbf1",
            background: "#f0fdfa",
            color: "#0f766e",
            fontSize: "20px",
            fontWeight: 700,
          }}
        >
          医療機関向け予約確認サービス
        </div>
      </div>
    ),
    { ...size },
  );
}
