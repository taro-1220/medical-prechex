import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Clinic } from "@/lib/types";

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

  const ids = (cu ?? []).map(r => r.clinic_id as string);
  if (ids.length === 0) return NextResponse.json([]);

  const { data, error } = await getSupabase()
    .from("clinics")
    .select("id, name, slug, phone, email, address, status, created_at, updated_at")
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clinics: Clinic[] = (data ?? []).map(r => ({
    id:        r.id        as string,
    name:      r.name      as string,
    slug:      r.slug      as string | null,
    phone:     r.phone     as string | null,
    email:     r.email     as string | null,
    address:   r.address   as string | null,
    status:    r.status    as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));

  return NextResponse.json(clinics);
}
