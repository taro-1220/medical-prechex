import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function isOpsAdmin(email: string): boolean {
  const allowed = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phase P1: 却下は非破壊。clinics/clinic_profile/authユーザーは削除せず、
// status='rejected'として保持する（監査記録・再承認の余地を残すため）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOpsAdmin(user.email ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
