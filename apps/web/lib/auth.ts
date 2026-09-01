import { cookies } from "next/headers";
import crypto, { timingSafeEqual } from "node:crypto";
import { auth, isAuthRuntimeConfigured } from "@/auth";
import { getAuthIdentityRepository } from "./database";

export const GUEST_COOKIE_NAME = "agentbench_guest_id";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
};

let nextSessionPruneAt = 0;

async function maybePruneExpiredSessions(now = Date.now()) {
  if (now < nextSessionPruneAt) return;
  nextSessionPruneAt = now + 60 * 60 * 1_000;
  try {
    await getAuthIdentityRepository().deleteExpiredSessions(new Date(now));
  } catch (error) {
    console.error("[web] failed to prune expired Auth.js sessions", error);
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isAuthRuntimeConfigured()) return null;
  const session = await auth();
  await maybePruneExpiredSessions();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function guestSignature(guestId: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`guest:v1:${guestId}`).digest("base64url");
}

export function encodeGuestCookie(guestId: string, secret = process.env.AUTH_SECRET) {
  if (!secret) return guestId;
  return `v1.${guestId}.${guestSignature(guestId, secret)}`;
}

export function decodeGuestCookie(
  value: string | undefined,
  options: { secret?: string; allowLegacy?: boolean } = {},
) {
  if (!value) return null;
  const secret = options.secret ?? process.env.AUTH_SECRET;
  if (UUID_PATTERN.test(value)) {
    return options.allowLegacy === false ? null : { guestId: value, legacy: Boolean(secret) };
  }
  if (!secret) return null;

  const [version, guestId, providedSignature, extra] = value.split(".");
  if (version !== "v1" || !UUID_PATTERN.test(guestId ?? "") || !providedSignature || extra) {
    return null;
  }
  const expected = Buffer.from(guestSignature(guestId, secret));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  return { guestId, legacy: false };
}

export async function getOrCreateGuestId() {
  const cookieStore = await cookies();
  const parsed = decodeGuestCookie(cookieStore.get(GUEST_COOKIE_NAME)?.value, { allowLegacy: true });

  if (parsed) {
    return {
      guestId: parsed.guestId,
      cookieValue: encodeGuestCookie(parsed.guestId),
      shouldSetCookie: parsed.legacy,
    };
  }

  const guestId = crypto.randomUUID();
  return { guestId, cookieValue: encodeGuestCookie(guestId), shouldSetCookie: true };
}

export async function getClaimableGuestId() {
  const cookieStore = await cookies();
  return decodeGuestCookie(cookieStore.get(GUEST_COOKIE_NAME)?.value, {
    allowLegacy: false,
  })?.guestId ?? null;
}

export const guestCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
};

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
