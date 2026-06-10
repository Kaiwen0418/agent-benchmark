import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@agentbench/shared";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase env vars are missing.");
  }

  return createBrowserClient<Database>(url, anonKey);
}
