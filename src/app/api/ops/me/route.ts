import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isOpsAdmin } from "@/lib/ops-auth";

// 認証のみのエンドポイント（書き込みなし）。requireOpsAdminと違い、運営者以外を
// 403にはせず、ログイン後の遷移先判定用に{ isOpsAdmin: boolean }を返す。
export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ isOpsAdmin: isOpsAdmin(user.email ?? "") });
}
