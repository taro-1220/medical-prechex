// 確認URLの操作前の本人確認（署名検証・入力正規化の純関数。DB・Cookie I/Oは呼び出し側で行う）。
import { createHmac } from "crypto";
import type { NextRequest } from "next/server";

const COOKIE_MAX_AGE_SEC = 24 * 60 * 60; // 24時間
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export { COOKIE_MAX_AGE_SEC, MAX_FAILURES, LOCK_MINUTES };

export function cookieNameFor(token: string): string {
  return `confirm_identity_${token}`;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Cookie値（expiresAtMs.signature）を発行する */
export function issueIdentityCookieValue(token: string, secret: string, nowMs: number): string {
  const expiresAtMs = nowMs + COOKIE_MAX_AGE_SEC * 1000;
  const signature = sign(`${token}:${expiresAtMs}`, secret);
  return `${expiresAtMs}.${signature}`;
}

/** Cookie値を検証する。期限切れ・署名不一致・形式不正はすべてfalse */
export function verifyIdentityCookieValue(value: string | undefined, token: string, secret: string, nowMs: number): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiresAtMs = Number(value.slice(0, dot));
  const signature = value.slice(dot + 1);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return false;
  const expected = sign(`${token}:${expiresAtMs}`, secret);
  return signature === expected;
}

/** 全角/半角・空白・ひらがな/カタカナの揺れを正規化してフルネームを比較する */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC") // 全角英数・記号を半角に、全角カタカナはそのまま正規化
    .replace(/[\s　]+/g, "") // 半角・全角スペースを除去
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)) // ひらがな→カタカナ
    .toLowerCase();
}

export function isNameMatch(input: string, expectedFullName: string): boolean {
  const a = normalizeName(input);
  const b = normalizeName(expectedFullName);
  return a.length > 0 && a === b;
}

/** 電話番号から数字のみを取り出した末尾4桁と比較する */
export function isPhoneLast4Match(input: string, phone: string): boolean {
  const digits = input.replace(/\D/g, "");
  const phoneDigits = phone.replace(/\D/g, "");
  if (digits.length !== 4) return false;
  return phoneDigits.length >= 4 && phoneDigits.slice(-4) === digits;
}

/** 書き込みAPI側のゲート。SITE_ACCESS_COOKIE_SECRET未設定時は常にfalse（fail-closed） */
export function isIdentityVerified(req: NextRequest, token: string): boolean {
  const secret = process.env.SITE_ACCESS_COOKIE_SECRET;
  if (!secret) return false;
  const value = req.cookies.get(cookieNameFor(token))?.value;
  return verifyIdentityCookieValue(value, token, secret, Date.now());
}
