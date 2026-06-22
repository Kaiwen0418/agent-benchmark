import { createClient } from "@supabase/supabase-js";
import type { Database } from "@agentbench/shared";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new SupabaseServiceUnavailableError("Supabase server credentials are not configured.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export class SupabaseServiceUnavailableError extends Error {
  code = "service_unavailable" as const;
  status = 503 as const;

  constructor(message = "The benchmark service is temporarily unavailable.", options?: ErrorOptions) {
    super(message, options);
    this.name = "SupabaseServiceUnavailableError";
  }
}
