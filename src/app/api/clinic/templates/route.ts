import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requireClinicAccess } from "@/lib/clinic-access";
import { DEFAULT_TEMPLATES } from "@/lib/message-templates";
import type { MessageChannel, TemplateWithMeta } from "@/lib/types";

const CHANNELS: MessageChannel[] = ["sms", "line", "email"];

export async function GET(req: NextRequest) {
  const clinicId = req.nextUrl.searchParams.get("clinic_id");
  if (!clinicId) return NextResponse.json({ error: "clinic_id required" }, { status: 400 });

  const access = await requireClinicAccess(req, clinicId, "view", { requireActive: true });
  if (!access.ok) return access.response;

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
  const { clinicId, channel, subject, body } = await req.json();
  if (!clinicId) return NextResponse.json({ error: "clinicId required" }, { status: 400 });
  if (!CHANNELS.includes(channel)) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  if (typeof body !== "string" || !body.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });

  const access = await requireClinicAccess(req, clinicId, "settings", { requireActive: true });
  if (!access.ok) return access.response;

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
