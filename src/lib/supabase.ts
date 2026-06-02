import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function diagnoseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let urlHostname = "";
  try { urlHostname = new URL(url).hostname; } catch { urlHostname = "(invalid url)"; }
  return {
    urlExists:           url.length > 0,
    urlStartsHttps:      url.startsWith("https://"),
    urlEndsSupabaseCo:   url.endsWith(".supabase.co"),
    urlHostname,
    urlLength:           url.length,
    keyExists:           key.length > 0,
    keyStartsSbSecret:   key.startsWith("sb_secret_"),
    keyLength:           key.length,
  };
}

// モジュール初期化時に必ず出力
console.error("[supabase-env]", diagnoseEnv());

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  // createClient 直前に必ず出力
  console.error("[supabase-env]", diagnoseEnv());
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
