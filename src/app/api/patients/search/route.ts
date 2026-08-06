import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { searchPatients } from "@/lib/store";

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
  if (q.length < 2) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchPatients(q, clinicIds));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
