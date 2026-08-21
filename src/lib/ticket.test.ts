import { describe, it, expect } from "vitest";
import { isTicketExpired, maskPatientName, buildIcsContent } from "./ticket";

describe("isTicketExpired", () => {
  it("来院日+30日以内は失効していない", () => {
    expect(isTicketExpired("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z")).toBe(false);
  });
  it("来院日+30日ちょうどは失効していない（境界値）", () => {
    expect(isTicketExpired("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z", 30)).toBe(false);
  });
  it("来院日+30日を過ぎたら失効", () => {
    expect(isTicketExpired("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:01.000Z")).toBe(true);
  });
  it("来院前は失効していない", () => {
    expect(isTicketExpired("2026-08-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z")).toBe(false);
  });
});

describe("maskPatientName", () => {
  it("姓名スペース区切りは姓＋名の頭文字＋様", () => {
    expect(maskPatientName("山田 太郎")).toBe("山田 太様");
  });
  it("全角スペース区切りにも対応", () => {
    expect(maskPatientName("田中　花子")).toBe("田中 花様");
  });
  it("区切りが無い場合は先頭1文字＋様", () => {
    expect(maskPatientName("山田太郎")).toBe("山様");
  });
  it("前後の空白は無視する", () => {
    expect(maskPatientName("  山田 太郎  ")).toBe("山田 太様");
  });
  it("空文字は空文字を返す", () => {
    expect(maskPatientName("")).toBe("");
  });
});

describe("buildIcsContent", () => {
  const base = {
    uid: "appt-123",
    clinicName: "まごめ歯科",
    description: "初診・一般診療",
    appointmentAt: "2026-09-01T01:00:00.000Z",
    ticketUrl: "https://www.medipre.jp/confirm/tok123",
    now: "2026-08-21T00:00:00.000Z",
  };

  it("VCALENDAR/VEVENTの基本構造を含む", () => {
    const ics = buildIcsContent(base);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:appt-123");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("DTSTART/DTENDがUTC形式で入る（既定30分）", () => {
    const ics = buildIcsContent(base);
    expect(ics).toContain("DTSTART:20260901T010000Z");
    expect(ics).toContain("DTEND:20260901T013000Z");
  });

  it("SUMMARYに医院名と予約内容、DESCRIPTIONにチケットURLを含む", () => {
    const ics = buildIcsContent(base);
    expect(ics).toContain("SUMMARY:まごめ歯科 初診・一般診療");
    expect(ics.replace(/\r\n/g, "")).toContain("予約チケット:");
    expect(ics).toContain("URL:https://www.medipre.jp/confirm/tok123");
  });

  it("カンマ・セミコロンを含む説明文をエスケープする", () => {
    const ics = buildIcsContent({ ...base, description: "初診;要相談,予約" });
    expect(ics).toContain("初診\\;要相談\\,予約");
  });

  it("改行はCRLFで、行末に余分な空白を作らない", () => {
    const ics = buildIcsContent(base);
    expect(ics.includes("\r\n")).toBe(true);
    expect(ics.endsWith("\r\n")).toBe(true);
  });
});
