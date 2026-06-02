import { NextRequest, NextResponse } from "next/server";
import { createAppointment, getAllAppointments } from "@/lib/store";

function safeError(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const cause = err.cause as Record<string, unknown> | undefined;
  const info = {
    debugName:         err.name,
    debugMessage:      err.message,
    debugCauseMessage: typeof cause?.message === "string" ? cause.message : undefined,
    debugCauseCode:    typeof cause?.code    === "string" ? cause.code    : undefined,
  };
  console.error("[api/appointments]", info);
  return info;
}

export async function GET() {
  try {
    return NextResponse.json(await getAllAppointments());
  } catch (e) {
    return NextResponse.json({ error: "internal_error", ...safeError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const appt = await createAppointment(body);
    return NextResponse.json(appt, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "internal_error", ...safeError(e) }, { status: 500 });
  }
}
