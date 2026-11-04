import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getActiveClinicIdsForUser } from "@/lib/clinic-access";
import { getClinicPatients } from "@/lib/store";

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await getActiveClinicIdsForUser(user.id);
  if (!scope.ok) return scope.response;
  if (scope.blocked) return NextResponse.json({ error: "Forbidden: clinic not approved" }, { status: 403 });
  const clinicIds = scope.clinicIds;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    return NextResponse.json(await getClinicPatients(clinicIds, q));
  } catch {
    // PII を含みうるため詳細メッセージは返さない
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
