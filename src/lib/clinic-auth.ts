import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./supabase-browser";
import type { Clinic } from "./types";

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await getSupabaseBrowser().auth.getUser();
  return user;
}

export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await getSupabaseBrowser().auth.getSession();
  return session?.access_token ?? null;
}

export async function getUserClinics(): Promise<Clinic[]> {
  const token = await getAccessToken();
  if (!token) return [];
  const res = await fetch("/api/clinic/list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getCurrentClinic(): Promise<Clinic | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch("/api/clinic/current", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}
