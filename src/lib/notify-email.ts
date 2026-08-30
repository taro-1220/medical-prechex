// MVP+3: 空き枠通知メール送信。ResendのREST APIを直接呼ぶ（SDK追加なし、最小構成）。
// 絶対制約: 元の予約患者（キャンセルした患者）の氏名・診療内容・キャンセル理由は
// この関数の引数に一切含めない設計にする（呼び出し側にも渡さない）。

export function isEmailSendEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export interface AvailableSlotEmailInput {
  to: string;
  clinicName: string;
  appointmentAt: string; // ISO
  claimUrl: string;
  unsubscribeUrl: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

function formatSlotDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

/** 送信内容の組み立てのみ（純粋関数）。PII混入防止をテストしやすいよう送信処理と分離する */
export function buildAvailableSlotEmail(input: AvailableSlotEmailInput): EmailPayload {
  const when = formatSlotDateTime(input.appointmentAt);
  return {
    to: input.to,
    subject: "本日予約可能な枠が空きました",
    text: `${input.clinicName}よりお知らせです。

${when} より予約可能な枠が空きました。

ご希望の場合は、以下よりご予約ください。
${input.claimUrl}

※先着順のため、すでに受付終了となっている場合があります。

――――――
このお知らせが不要な場合はこちら:
${input.unsubscribeUrl}`,
  };
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

export async function sendAvailableSlotEmail(input: AvailableSlotEmailInput): Promise<SendEmailResult> {
  const payload = buildAvailableSlotEmail(input);
  const from = process.env.AVAILABLE_SLOT_EMAIL_FROM || "medipre <notify@medipre.jp>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: payload.to, subject: payload.subject, text: payload.text }),
    });
    if (!res.ok) return { ok: false, error: `resend_error_${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
