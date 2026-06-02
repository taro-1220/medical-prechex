import { NextRequest, NextResponse } from "next/server";
import { createAppointment, getAllAppointments } from "@/lib/store";

export function GET() {
  return NextResponse.json(getAllAppointments());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const appt = createAppointment(body);
  return NextResponse.json(appt, { status: 201 });
}
