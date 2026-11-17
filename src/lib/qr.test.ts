import { describe, it, expect } from "vitest";
import { generateQrDataUrl } from "./qr";

describe("generateQrDataUrl", () => {
  it("data:image/png;base64, で始まるdata URLを返す", async () => {
    const result = await generateQrDataUrl("https://example.com/a");
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("入力URLが変わると出力も変わる", async () => {
    const a = await generateQrDataUrl("https://example.com/a");
    const b = await generateQrDataUrl("https://example.com/b");
    expect(a).not.toBe(b);
  });
});
