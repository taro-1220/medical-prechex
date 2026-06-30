import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clinicId } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId is required" }, { status: 400 });

  // 所属確認
  const { data: membership } = await getSupabase()
    .from("clinic_users")
    .select("id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 全 clinic_users を selected=false
  await getSupabase()
    .from("clinic_users")
    .update({ selected: false })
    .eq("user_id", user.id);

  // 対象を selected=true
  const { error } = await getSupabase()
    .from("clinic_users")
    .update({ selected: true })
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
