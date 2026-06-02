import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function diagnoseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let hostname = "(invalid url)";
  try { hostname = new URL(url).hostname; } catch { /* keep default */ }
  const hl = hostname.length;
  return {
    urlExists:           url.length > 0,
    urlStartsHttps:      url.startsWith("https://"),
    urlEndsSupabaseCo:   url.endsWith(".supabase.co"),
    urlLength:           url.length,
    hostname,
    hostnameLength:      hl,
    hostnameFirst5:      hostname.slice(0, 5),
    hostnameLast5:       hostname.slice(-5),
    keyExists:           key.length > 0,
    keyStartsSbSecret:   key.startsWith("sb_secret_"),
    keyLength:           key.length,
  };
}

// モジュール初期化時に必ず出力
console.error("[supabase-env]", diagnoseEnv());

// URL値の詳細診断（service role keyは出力禁止）
const _rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
console.error("[supabase-url-bytes]", {
  length:    _rawUrl.length,
  charCodes: Array.from(_rawUrl.slice(0, 50)).map(c => c.charCodeAt(0)),
});
console.error("[supabase-url-json]", JSON.stringify(_rawUrl));

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
