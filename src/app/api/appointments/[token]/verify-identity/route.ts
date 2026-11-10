import { NextRequest, NextResponse } from "next/server";
import { getAppointment } from "@/lib/store";
import { issueIdentityCookieValue, cookieNameFor, isNameMatch, isPhoneLast4Match, COOKIE_MAX_AGE_SEC } from "@/lib/identity-check";
import { isIdentityCheckLocked, recordIdentityCheckFailure, resetIdentityCheckFailures } from "@/lib/identity-check-store";
import { determineConfirmState, canWrite } from "@/lib/confirm-state";

// 確認URLの操作前の本人確認。電話番号があれば下4桁、無ければフルネームで照合する。
// 失敗・ロックのいずれも同じ応答にし、理由を外部に漏らさない。入力値（answer）はログに出さない。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const secret = process.env.SITE_ACCESS_COOKIE_SECRET;
  if (!secret) return NextResponse.json({ error: "internal_error" }, { status: 500 });

  try {
    const { token } = await params;
    const appt = await getAppointment(token);
    if (!appt) return NextResponse.json({ error: "verification_failed" }, { status: 401 });

    const state = determineConfirmState(appt.status, appt.appointmentAt, new Date().toISOString());
    if (!canWrite(state, "verify_identity")) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
    }

    const locked = await isIdentityCheckLocked(appt.id);
    if (locked) return NextResponse.json({ error: "verification_failed" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const answer = typeof body?.answer === "string" ? body.answer.trim() : "";

    const matched = appt.phone
      ? isPhoneLast4Match(answer, appt.phone)
      : isNameMatch(answer, appt.patientName);

    if (!matched) {
      await recordIdentityCheckFailure(appt.id);
      return NextResponse.json({ error: "verification_failed" }, { status: 401 });
    }

    await resetIdentityCheckFailures(appt.id);
    const value = issueIdentityCookieValue(token, secret, Date.now());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookieNameFor(token), value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_SEC,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
