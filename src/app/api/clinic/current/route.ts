import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Clinic } from "@/lib/types";

function toClinic(r: Record<string, unknown>): Clinic {
  return {
    id:        r.id        as string,
    name:      r.name      as string,
    slug:      r.slug      as string | null,
    phone:     r.phone     as string | null,
    email:     r.email     as string | null,
    address:   r.address   as string | null,
    status:    r.status    as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // selected=true の clinic を取得
  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("selected", true)
    .maybeSingle();

  let clinicId = cu?.clinic_id as string | undefined;

  // selected=true がなければ最初の所属 clinic を自動選択
  if (!clinicId) {
    const { data: first } = await getSupabase()
      .from("clinic_users")
      .select("clinic_id")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!first) return NextResponse.json(null);
    clinicId = first.clinic_id as string;
    // DB側で補正
    await getSupabase()
      .from("clinic_users")
      .update({ selected: true })
      .eq("user_id", user.id)
      .eq("clinic_id", clinicId);
  }

  const { data, error } = await getSupabase()
    .from("clinics")
    .select("id, name, slug, phone, email, address, status, created_at, updated_at")
    .eq("id", clinicId)
    .single();
  if (error || !data) return NextResponse.json(null);

  return NextResponse.json(toClinic(data as Record<string, unknown>));
}
