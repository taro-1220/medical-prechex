import { NextRequest, NextResponse } from "next/server";
import { searchPatients } from "@/lib/store";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.length < 2) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchPatients(q));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
