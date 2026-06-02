import { NextRequest, NextResponse } from "next/server";
import { createAppointment, getAllAppointments } from "@/lib/store";

export async function GET() {
  try {
    return NextResponse.json(await getAllAppointments());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const appt = await createAppointment(body);
    return NextResponse.json(appt, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
