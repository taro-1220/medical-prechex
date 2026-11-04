import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isEmailSendEnabled, sendClinicApprovedEmail } from "@/lib/notify-email";
import { requireOpsAdmin } from "@/lib/ops-auth";
import { changeClinicStatus, readReason } from "@/lib/clinic-status";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 承認（pending_approval → active）と再承認（rejected → active。理由必須）。
// 状態変更と監査記録は DB 関数 ops_change_clinic_status が同一トランザクションで行う。
// 承認メールは、状態変更が実際に成功した場合だけ送る。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const auth = await requireOpsAdmin(req);
  if (!auth.ok) return auth.response;

  const { clinicId } = await params;
  if (!UUID_RE.test(clinicId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = await readReason(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const sb = getSupabase();
  const { data: clinic, error: clinicErr } = await sb
    .from("clinics")
    .select("id, name, email")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinicErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await changeClinicStatus({
    clinicId,
    toStatus: "active",
    actor: { id: auth.user.id, email: auth.user.email ?? "" },
    reason: parsed.reason,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let emailSent = false;
  if (clinic.email && isEmailSendEnabled()) {
    const mail = await sendClinicApprovedEmail({
      to: clinic.email as string,
      clinicName: clinic.name as string,
      loginUrl: `${appUrl}/clinic`,
    });
    emailSent = mail.ok;
  }

  return NextResponse.json({ ok: true, action: result.action, emailSent });
}
