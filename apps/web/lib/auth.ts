import { cookies } from "next/headers";
import crypto from "node:crypto";

export const GUEST_COOKIE_NAME = "agentbench_guest_id";

export type CurrentUser = {
  id: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Auth.js will replace this seam; the current public experience is guest-only.
  return null;
}

export async function getOrCreateGuestId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (existing) {
    return { guestId: existing, isNew: false };
  }

  return { guestId: crypto.randomUUID(), isNew: true };
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
