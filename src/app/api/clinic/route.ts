import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await getSupabase()
    .from("clinics")
    .select("id, name")
    .limit(1)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ name: "" });
  return NextResponse.json({ id: data.id as string, name: data.name as string });
}
