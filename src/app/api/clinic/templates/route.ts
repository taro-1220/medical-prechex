import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_TEMPLATES } from "@/lib/message-templates";
import type { MessageChannel, TemplateWithMeta } from "@/lib/types";

const CHANNELS: MessageChannel[] = ["sms", "line", "email"];

async function authenticate(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { data: { user }, error } = await getSupabase().auth.getUser(token);
  if (error || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  return { user } as const;
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;

  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", auth.user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rows, error: rowsErr } = await getSupabase()
    .from("message_templates")
    .select("channel, subject, body, updated_at")
    .eq("clinic_id", clinicId);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const { data: profile } = await getSupabase()
    .from("clinic_profile")
    .select("default_message")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const legacyLineMessage = (profile?.default_message as string | undefined)?.trim() || null;

  const byChannel = new Map((rows ?? []).map(r => [r.channel as MessageChannel, r]));

  const templates: TemplateWithMeta[] = CHANNELS.map((channel) => {
    const row = byChannel.get(channel);
    if (row) {
      return {
        channel,
        subject: row.subject as string | null,
        body: row.body as string,
        source: "custom",
        updatedAt: row.updated_at as string,
      };
    }
    if (channel === "line" && legacyLineMessage) {
      return { channel, subject: null, body: legacyLineMessage, source: "legacy_default_message", updatedAt: null };
    }
    return { channel, subject: DEFAULT_TEMPLATES[channel].subject, body: DEFAULT_TEMPLATES[channel].body, source: "default", updatedAt: null };
  });

  return NextResponse.json({ templates });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;

  const { clinicId, channel, subject, body } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });
  if (!CHANNELS.includes(channel)) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  if (typeof body !== "string" || !body.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });

  const { data: cu } = await getSupabase()
    .from("clinic_users")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cu) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["owner", "manager"].includes(cu.role as string)) {
    return NextResponse.json({ error: "Forbidden: owner/manager only" }, { status: 403 });
  }

  const { error } = await getSupabase()
    .from("message_templates")
    .upsert(
      {
        clinic_id: clinicId,
        channel,
        subject: channel === "email" ? (subject ?? null) : null,
        body,
      },
      { onConflict: "clinic_id,channel" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
