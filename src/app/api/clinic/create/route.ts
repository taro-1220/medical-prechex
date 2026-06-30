import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Clinic } from "@/lib/types";

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, phone, email, address } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: clinic, error: cErr } = await getSupabase()
    .from("clinics")
    .insert({ name: name.trim(), phone: phone || null, email: email || null, address: address || null })
    .select("id, name, slug, phone, email, address, status, created_at, updated_at")
    .single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // 既存 clinic_users の selected を外してから新規を selected=true で追加
  await getSupabase()
    .from("clinic_users")
    .update({ selected: false })
    .eq("user_id", user.id);

  const { error: cuErr } = await getSupabase()
    .from("clinic_users")
    .insert({ clinic_id: clinic.id, user_id: user.id, role: "owner", selected: true });
  if (cuErr) return NextResponse.json({ error: cuErr.message }, { status: 500 });

  const res: Clinic = {
    id:        clinic.id         as string,
    name:      clinic.name       as string,
    slug:      clinic.slug       as string | null,
    phone:     clinic.phone      as string | null,
    email:     clinic.email      as string | null,
    address:   clinic.address    as string | null,
    status:    clinic.status     as string,
    createdAt: clinic.created_at as string,
    updatedAt: clinic.updated_at as string,
  };
  return NextResponse.json(res, { status: 201 });
}
