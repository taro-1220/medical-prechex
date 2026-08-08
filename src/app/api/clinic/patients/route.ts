import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getClinicPatients } from "@/lib/store";

export async function GET(req: NextRequest) {
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

  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json(await getClinicPatients(clinicIds, q));
  } catch {
    // PII を含みうるため詳細メッセージは返さない
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
