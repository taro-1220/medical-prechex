import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getClinicPatientDetail } from "@/lib/store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // UUID形式でなければDBへ問い合わせず、存在しない患者と同じ404を返す
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: cu, error: cuErr } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id);
  if (cuErr) return NextResponse.json({ error: cuErr.message }, { status: 500 });
  const clinicIds = (cu ?? []).map(r => r.clinic_id as string);

  try {
    const detail = await getClinicPatientDetail(id, clinicIds);
    // 他院患者・不存在はいずれも 404（存在有無を漏らさない）
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
