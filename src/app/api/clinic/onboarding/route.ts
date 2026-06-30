import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { ClinicProfile, OnboardingProgress } from "@/lib/types";

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

  const { data: prog } = await getSupabase()
    .from("onboarding_progress")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const { data: prof } = await getSupabase()
    .from("clinic_profile")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  const progress: OnboardingProgress | null = prog ? {
    id: prog.id as string,
    clinicId: prog.clinic_id as string,
    profileCompleted: prog.profile_completed as boolean,
    policyCompleted: prog.policy_completed as boolean,
    notificationCompleted: prog.notification_completed as boolean,
    activatedAt: prog.activated_at as string | null,
    createdAt: prog.created_at as string,
    updatedAt: prog.updated_at as string,
  } : null;

  const profile: ClinicProfile | null = prof ? {
    id: prof.id as string,
    clinicId: prof.clinic_id as string,
    clinicDisplayName: prof.clinic_display_name as string,
    directorName: prof.director_name as string,
    phone: prof.phone as string,
    email: prof.email as string,
    postalCode: prof.postal_code as string,
    address: prof.address as string,
    websiteUrl: prof.website_url as string,
    cancellationPolicy: prof.cancellation_policy as string,
    defaultMessage: prof.default_message as string,
    createdAt: prof.created_at as string,
    updatedAt: prof.updated_at as string,
  } : null;

  return NextResponse.json({ progress, profile });
}
