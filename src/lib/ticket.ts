// MVP+1: 予約チケット（/confirm/[token]/complete）の失効判定・表示補助（純粋関数のみ）

const TICKET_EXPIRY_DAYS = 30;

/** 来院日 + 30日を過ぎていれば失効。判定は参照のたびに行う（cronでstatusを書き換えない） */
export function isTicketExpired(appointmentAt: string, now: string, expiryDays: number = TICKET_EXPIRY_DAYS): boolean {
  const expiresAtMs = new Date(appointmentAt).getTime() + expiryDays * 24 * 60 * 60 * 1000;
  return new Date(now).getTime() > expiresAtMs;
}

/**
 * 患者名をマスク表示する（例: "山田 太郎" → "山田 太様"）。
 * スペース区切りの姓名を想定し、姓 + 名の頭文字 + "様" にする。区切りが無い場合は先頭1文字のみ残す。
 */
export function maskPatientName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const [family, given] = parts;
    return `${family} ${given.charAt(0)}様`;
  }
  return `${trimmed.charAt(0)}様`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatIcsUtc(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// RFC5545 75オクテット折り返し（簡易実装。ASCII前提で十分な安全マージンを取る）
function foldIcsLine(line: string): string {
  const LIMIT = 73;
  if (line.length <= LIMIT) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, LIMIT));
  rest = rest.slice(LIMIT);
  while (rest.length > 0) {
    chunks.push(" " + rest.slice(0, LIMIT - 1));
    rest = rest.slice(LIMIT - 1);
  }
  return chunks.join("\r\n");
}

export interface IcsEventInput {
  uid: string;
  clinicName: string;
  description: string;
  appointmentAt: string;
  ticketUrl: string;
  now: string;
  /** 分単位の予約枠の長さ。実データを持たないため既定30分 */
  durationMinutes?: number;
}

/** カレンダーアプリ（Google/Apple）で開ける最小限の .ics 本文を組み立てる */
export function buildIcsContent(input: IcsEventInput): string {
  const { uid, clinicName, description, appointmentAt, ticketUrl, now, durationMinutes = 30 } = input;
  const dtStart = new Date(appointmentAt);
  const dtEnd = new Date(dtStart.getTime() + durationMinutes * 60 * 1000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//medipre//ticket//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(dtStart.toISOString())}`,
    `DTEND:${formatIcsUtc(dtEnd.toISOString())}`,
    `SUMMARY:${escapeIcsText(`${clinicName} ${description}`)}`,
    `DESCRIPTION:${escapeIcsText(`${description}\n予約チケット: ${ticketUrl}`)}`,
    `LOCATION:${escapeIcsText(clinicName)}`,
    `URL:${ticketUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
