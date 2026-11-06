import { NextRequest, NextResponse } from "next/server";
import { requireOpsAdmin } from "@/lib/ops-auth";
import { getRecentNotificationSummary } from "@/lib/notification-run-store";

// /ops の「自動送信（直近24時間）」カード用。migration 026未適用時はavailable:falseを返す。
export async function GET(req: NextRequest) {
  const auth = await requireOpsAdmin(req);
  if (!auth.ok) return auth.response;

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const summary = await getRecentNotificationSummary(sinceIso);
  return NextResponse.json(summary);
}
