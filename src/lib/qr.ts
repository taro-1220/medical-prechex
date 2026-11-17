import QRCode from "qrcode";

/** QR画像をdata URL(PNG)として生成する。外部サービスへは一切送信しない */
export async function generateQrDataUrl(
  data: string,
  options?: { width?: number; margin?: number },
): Promise<string> {
  return QRCode.toDataURL(data, {
    width: options?.width ?? 240,
    margin: options?.margin ?? 1,
  });
}
