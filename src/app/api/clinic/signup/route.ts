import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Phase P1: 医院セルフサインアップ（承認制）。未認証・公開エンドポイント。
// メール確認はSupabase標準フロー（mailer_autoconfirm=false）に任せる。
// clinicレコードはメール確認を待たずにこの場で作成する（運営者が/opsで申込内容を
// 確認できるようにするため。承認可否の判断材料が確認待ちの間も見える設計）。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicName = typeof body?.clinicName === "string" ? body.clinicName.trim() : "";
  const directorName = typeof body?.directorName === "string" ? body.directorName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!clinicName || !email || !password) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const sb = getSupabase();

  const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appUrl}/clinic` },
  });
  if (signUpErr || !signUpData.user) {
    return NextResponse.json({ error: signUpErr?.message ?? "signup_failed" }, { status: 400 });
  }

  const { data: clinic, error: clinicErr } = await sb
    .from("clinics")
    .insert({ name: clinicName, phone: "", email, address: "", status: "pending_approval" })
    .select("id")
    .single();
  if (clinicErr) return NextResponse.json({ error: clinicErr.message }, { status: 500 });

  const { error: profileErr } = await sb
    .from("clinic_profile")
    .insert({ clinic_id: clinic.id, clinic_display_name: clinicName, director_name: directorName, email });
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  const { error: cuErr } = await sb
    .from("clinic_users")
    .insert({ clinic_id: clinic.id, user_id: signUpData.user.id, role: "owner", selected: true });
  if (cuErr) return NextResponse.json({ error: cuErr.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 201 });
}
