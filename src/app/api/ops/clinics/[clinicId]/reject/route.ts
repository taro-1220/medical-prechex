import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/lib/ops-auth";
import { changeClinicStatus, readReason } from "@/lib/clinic-status";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phase P1: 却下は非破壊。clinics/clinic_profile/authユーザーは削除せず、
// status='rejected'として保持する（監査記録・再承認の余地を残すため）。
// 理由は必須。状態変更と監査記録は DB 関数 ops_change_clinic_status が同一トランザクションで行う。
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
  if (!parsed.reason) return NextResponse.json({ error: "reason_required" }, { status: 400 });

  const result = await changeClinicStatus({
    clinicId,
    toStatus: "rejected",
    actor: { id: auth.user.id, email: auth.user.email ?? "" },
    reason: parsed.reason,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, action: result.action });
}
