import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireOpsAdmin } from "@/lib/ops-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phase P1: 却下は非破壊。clinics/clinic_profile/authユーザーは削除せず、
// status='rejected'として保持する（監査記録・再承認の余地を残すため）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const auth = await requireOpsAdmin(req);
  if (!auth.ok) return auth.response;

  const { clinicId } = await params;
  if (!UUID_RE.test(clinicId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sb = getSupabase();
  const { data, error } = await sb
    .from("clinics")
    .update({ status: "rejected" })
    .eq("id", clinicId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
