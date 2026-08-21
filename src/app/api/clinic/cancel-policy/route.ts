import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getClinicCancelPolicySettings, upsertClinicCancelPolicy } from "@/lib/store";
import {
  isBasisNoteValid,
  isInsuranceAcknowledgmentSatisfied,
  findRiskyPolicyWording,
  scopeAppliesToCategory,
} from "@/lib/cancel-policy";
import type { CancelPolicyScope } from "@/lib/types";

async function requireClinicMember(req: NextRequest, clinicId: string) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !user) return null;
  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return cu ? user : null;
}

export async function GET(req: NextRequest) {
  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });
  const user = await requireClinicMember(req, clinicId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const settings = await getClinicCancelPolicySettings(clinicId);
    return NextResponse.json(settings);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

interface PolicyInput {
  policyText?: string;
  basisNote?: string;
  showBasisToPatient?: boolean;
  graceHours?: number;
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clinicId = body?.clinicId as string | undefined;
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });
  const user = await requireClinicMember(req, clinicId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enabled = Boolean(body?.enabled);
  const scope = (body?.scope ?? null) as CancelPolicyScope | null;
  const insuranceAcknowledged = Boolean(body?.insuranceAcknowledged);
  const policies = (body?.policies ?? {}) as { private?: PolicyInput; insurance?: PolicyInput };

  if (enabled) {
    if (!scope) return NextResponse.json({ error: "scope required when enabled" }, { status: 400 });
    if (!isInsuranceAcknowledgmentSatisfied(scope, insuranceAcknowledged)) {
      return NextResponse.json({ error: "insurance_acknowledgment_required" }, { status: 400 });
    }
    const categories: Array<"private" | "insurance"> = ["private", "insurance"].filter(c =>
      scopeAppliesToCategory(scope, c as "private" | "insurance")
    ) as Array<"private" | "insurance">;
    for (const category of categories) {
      const p = policies[category];
      const policyText = (p?.policyText ?? "").trim();
      const basisNote = p?.basisNote ?? "";
      if (!policyText) {
        return NextResponse.json({ error: `${category}: policy_text required` }, { status: 400 });
      }
      if (!isBasisNoteValid(basisNote)) {
        return NextResponse.json({ error: `${category}: basis_note required` }, { status: 400 });
      }
    }
  }

  try {
    await upsertClinicCancelPolicy(clinicId, {
      enabled,
      scope: enabled ? scope : null,
      insuranceAcknowledged,
      policies: {
        private: policies.private ? {
          policyText: policies.private.policyText ?? "",
          basisNote: policies.private.basisNote ?? "",
          showBasisToPatient: Boolean(policies.private.showBasisToPatient),
          graceHours: policies.private.graceHours ?? 24,
        } : undefined,
        insurance: policies.insurance ? {
          policyText: policies.insurance.policyText ?? "",
          basisNote: policies.insurance.basisNote ?? "",
          showBasisToPatient: Boolean(policies.insurance.showBasisToPatient),
          graceHours: policies.insurance.graceHours ?? 24,
        } : undefined,
      },
    });

    // 保存はブロックせず警告のみ返す（実際の損害を超える可能性がある表現）
    const warnings: Record<string, string[]> = {};
    for (const category of ["private", "insurance"] as const) {
      const text = policies[category]?.policyText ?? "";
      const hits = findRiskyPolicyWording(text);
      if (hits.length > 0) warnings[category] = hits;
    }

    return NextResponse.json({ ok: true, warnings });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
