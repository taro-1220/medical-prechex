import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authorizeClinicAccess } from "@/lib/clinic-access";
import { getAppointmentById } from "@/lib/store";
import { addAppointmentNote, listAppointmentNotes } from "@/lib/appointment-notes-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 予約への備考の一覧（古い順）。閲覧のため承認状態は問わない（予約詳細GETと同様）。
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const appt = await getAppointmentById(id);
    if (!appt || !appt.clinicId) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const access = await authorizeClinicAccess(user, appt.clinicId, "view");
    if (!access.ok) return access.response;

    const notes = await listAppointmentNotes(id);
    return NextResponse.json({ notes });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// 備考の追記（追記のみ・削除修正は不可）。キャンセル済み・来院済み以降も追記できる。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const appt = await getAppointmentById(id);
    if (!appt || !appt.clinicId) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // 予約業務（備考の記録）のため reservation 権限。既存の担当・備考保存と同じ
    const access = await authorizeClinicAccess(user, appt.clinicId, "reservation", { requireActive: true });
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => ({}));
    const text = typeof body?.body === "string" ? body.body : "";
    // created_by_name はクライアントの値を受け取らず、認証済みユーザーのメールで固定する
    const result = await addAppointmentNote(id, appt.clinicId, "note", text, user.email ?? "");
    if (!result.ok) {
      if (result.reason === "invalid") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
      return NextResponse.json({ error: "not_supported" }, { status: 503 });
    }
    return NextResponse.json({ note: result.note });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
