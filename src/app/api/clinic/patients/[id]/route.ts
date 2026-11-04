import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getActiveClinicIdsForUser } from "@/lib/clinic-access";
import { getClinicPatientDetail } from "@/lib/store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // UUID形式でなければDBへ問い合わせず、存在しない患者と同じ404を返す
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await getActiveClinicIdsForUser(user.id);
  if (!scope.ok) return scope.response;
  if (scope.blocked) return NextResponse.json({ error: "Forbidden: clinic not approved" }, { status: 403 });
  const clinicIds = scope.clinicIds;

  try {
    const detail = await getClinicPatientDetail(id, clinicIds);
    // 他院患者・不存在はいずれも 404（存在有無を漏らさない）
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
