import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function diagnoseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let urlHostname = "";
  try { urlHostname = new URL(url).hostname; } catch { urlHostname = "(invalid url)"; }
  return {
    url_exists:           url.length > 0,
    url_starts_https:     url.startsWith("https://"),
    url_ends_supabase_co: url.endsWith(".supabase.co"),
    url_hostname:         urlHostname,
    url_length:           url.length,
    key_exists:           key.length > 0,
    key_starts_sb_secret: key.startsWith("sb_secret_"),
    key_length:           key.length,
  };
}

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error("[supabase] env diagnosis:", diagnoseEnv());
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!key) {
    console.error("[supabase] env diagnosis:", diagnoseEnv());
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  console.info("[supabase] env diagnosis:", diagnoseEnv());
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
