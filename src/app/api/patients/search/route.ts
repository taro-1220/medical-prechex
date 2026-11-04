import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getActiveClinicIdsForUser } from "@/lib/clinic-access";
import { searchPatients } from "@/lib/store";

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await getActiveClinicIdsForUser(user.id);
  if (!scope.ok) return scope.response;
  if (scope.blocked) return NextResponse.json({ error: "Forbidden: clinic not approved" }, { status: 403 });
  const clinicIds = scope.clinicIds;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.length < 2) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchPatients(q, clinicIds));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
