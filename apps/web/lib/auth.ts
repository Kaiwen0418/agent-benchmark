import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import crypto from "node:crypto";

export const GUEST_COOKIE_NAME = "agentbench_guest_id";

function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export async function getServerSupabase() {
  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }

  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });
}

export async function getCurrentUser() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getOrCreateGuestId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (existing) {
    return { guestId: existing, isNew: false };
  }

  return { guestId: crypto.randomUUID(), isNew: true };
}

export function isSupabaseEnabled() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY,
  );
}

function isLocalHost(host: string | null) {
  if (!host) {
    return false;
  }

  const normalized = host.toLowerCase();
  return (
    normalized.startsWith("localhost:") ||
    normalized === "localhost" ||
    normalized.startsWith("127.0.0.1:") ||
    normalized === "127.0.0.1"
  );
}

export function isDevQuotaBypassed(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  return isLocalHost(forwardedHost) || isLocalHost(host);
}
