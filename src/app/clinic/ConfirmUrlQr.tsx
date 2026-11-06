"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 確認URLのQRコードを表示する（ライブラリで生成。外部サービスにURL/トークンを送らない） */
export default function ConfirmUrlQr({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then((d) => { if (!cancelled) setDataUrl(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  if (!dataUrl) {
    return <div className="w-60 h-60 mx-auto bg-gray-100 rounded-xl animate-pulse" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="確認URLのQRコード" className="w-60 h-60 mx-auto rounded-xl border border-gray-200" />
  );
}
