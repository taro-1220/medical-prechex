// 連絡先（メール）の形式チェック・マスク表示（副作用の無い純関数）。

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 空文字は「未入力」として扱う呼び出し側の責務。ここでは形式のみ見る */
export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** "taro@example.com" → "t***@example.com"（先頭1文字以外を伏せる。@以降はそのまま） */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.charAt(0)}${"*".repeat(Math.max(local.length - 1, 1))}${domain}`;
}
