import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getClinicChargeDashboard } from "@/lib/charge-store";

// C-5: 今月のキャンセル率/無断件数/回収額と件数/同意済み・対象外のキャンセル率比較/課金失敗件数
export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // month=YYYY-MM（省略時は今月、JST基準）
  const monthParam = req.nextUrl.searchParams.get("month");
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const [y, m] = monthParam
    ? monthParam.split("-").map(Number)
    : [jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 1];
  const monthStart = new Date(Date.UTC(y, m - 1, 1) - 9 * 60 * 60 * 1000).toISOString();
  const monthEnd = new Date(Date.UTC(y, m, 1) - 9 * 60 * 60 * 1000).toISOString();

  try {
    const dashboard = await getClinicChargeDashboard(clinicId, monthStart, monthEnd);
    return NextResponse.json({ month: `${y}-${String(m).padStart(2, "0")}`, ...dashboard });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
