// MVP+3: 通知メール送信の共通基盤。ResendのREST APIを直接呼ぶ（SDK追加なし、最小構成）。
// 絶対制約（空き枠通知）: 元の予約患者（キャンセルした患者）の氏名・診療内容・キャンセル理由は
// buildAvailableSlotEmailの引数に一切含めない設計にする（呼び出し側にも渡さない）。

export function isEmailSendEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

/** Resend呼び出しの共通処理。空き枠通知・医院承認通知など全メール種別で共有する */
async function sendEmailViaResend(payload: EmailPayload): Promise<SendEmailResult> {
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

// ---------------------------------------------------------------------------
// 空き枠自動通知
// ---------------------------------------------------------------------------

export interface AvailableSlotEmailInput {
  to: string;
  clinicName: string;
  appointmentAt: string; // ISO
  claimUrl: string;
  unsubscribeUrl: string;
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

export async function sendAvailableSlotEmail(input: AvailableSlotEmailInput): Promise<SendEmailResult> {
  return sendEmailViaResend(buildAvailableSlotEmail(input));
}

// ---------------------------------------------------------------------------
// Phase P1: 医院セルフサインアップの承認完了通知
// ---------------------------------------------------------------------------

export interface ClinicApprovedEmailInput {
  to: string;
  clinicName: string;
  loginUrl: string;
}

export function buildClinicApprovedEmail(input: ClinicApprovedEmailInput): EmailPayload {
  return {
    to: input.to,
    subject: "medipreへのご登録が承認されました",
    text: `${input.clinicName} ご担当者様

medipreへのご登録内容を確認し、承認いたしました。
下記よりログインのうえ、初期設定にお進みください。

${input.loginUrl}

――――――
medipre運営事務局`,
  };
}

export async function sendClinicApprovedEmail(input: ClinicApprovedEmailInput): Promise<SendEmailResult> {
  return sendEmailViaResend(buildClinicApprovedEmail(input));
}
