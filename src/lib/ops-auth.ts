import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * /api/ops配下の認可の一元化。従来4ファイル（clinics、[clinicId]、approve、reject）に
 * 重複していたisOpsAdminをここに集約する。
 */
export function isOpsAdmin(email: string): boolean {
  const allowed = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/**
 * 各/api/opsルートの認可チェックをこの1関数に集約する。
 * 未認証は401、運営者以外は403。応答本文は既存の各ルートと同じ形を維持する。
 * 呼び出し側は `const auth = await requireOpsAdmin(req); if (!auth.ok) return auth.response;` の1行で済む。
 * 認可はここ（サーバー側）で必ず評価されるため、画面側の実装漏れの影響を受けない。
 */
export async function requireOpsAdmin(
  req: NextRequest,
): Promise<{ ok: true; user: User } | { ok: false; response: NextResponse }> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isOpsAdmin(user.email ?? "")) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, user };
}
