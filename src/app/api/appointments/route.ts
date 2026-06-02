import { NextRequest, NextResponse } from "next/server";
import { createAppointment, getAllAppointments } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

function safeError(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const cause = err.cause as Record<string, unknown> | undefined;
  const info = {
    debugName:            err.name,
    debugMessage:         err.message,
    debugCauseName:       cause instanceof Error ? cause.name    : typeof cause?.name    === "string" ? cause.name    : undefined,
    debugCauseMessage:    cause instanceof Error ? cause.message : typeof cause?.message === "string" ? cause.message : undefined,
    debugCauseCode:       typeof cause?.code === "string" ? cause.code : undefined,
    debugCauseOwnProps:   cause != null ? Object.getOwnPropertyNames(cause) : undefined,
  };
  console.error("[api/appointments]", info);
  return info;
}

export async function GET() {
  // --- 一時診断: 原因切り分け ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  // 1. Supabase REST API への直接 fetch
  let directFetchOk     = false;
  let directFetchStatus = 0;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey:        serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    directFetchOk     = r.ok;
    directFetchStatus = r.status;
    console.error("[diag] directFetch", { ok: r.ok, status: r.status });
  } catch (e) {
    console.error("[diag] directFetch error", safeError(e));
  }

  // 2. Supabase JS クライアント経由の select
  let supabaseSelectOk           = false;
  let supabaseSelectErrorCode    = null as string | null;
  let supabaseSelectErrorMessage = null as string | null;
  try {
    const { data, error } = await getSupabase()
      .from("appointments")
      .select("*")
      .limit(1);
    supabaseSelectOk = !error;
    if (error) {
      supabaseSelectErrorCode    = error.code    ?? null;
      supabaseSelectErrorMessage = error.message ?? null;
    }
    console.error("[diag] supabaseSelect", { ok: !error, rows: data?.length ?? 0, errorCode: error?.code });
  } catch (e) {
    supabaseSelectErrorMessage = e instanceof Error ? e.message : String(e);
    console.error("[diag] supabaseSelect threw", safeError(e));
  }

  const diag = {
    directFetchOk,
    directFetchStatus,
    supabaseSelectOk,
    supabaseSelectErrorCode,
    supabaseSelectErrorMessage,
  };
  console.error("[diag] result", diag);

  // 診断結果を返し、正常時は通常処理も継続
  if (!supabaseSelectOk) {
    return NextResponse.json({ _diag: diag, error: "internal_error" }, { status: 500 });
  }
  // --- 一時診断ここまで ---

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
