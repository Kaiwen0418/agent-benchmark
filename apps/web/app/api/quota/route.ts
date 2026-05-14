import { NextResponse } from "next/server";
import {
  getCurrentUser,
  getOrCreateGuestId,
  GUEST_COOKIE_NAME,
  isDevQuotaBypassed,
} from "@/lib/auth";
import { getQuotaStatus } from "@/lib/db";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const guest = user ? null : await getOrCreateGuestId();
  const quota = isDevQuotaBypassed(request)
    ? {
        mode: user ? "user" : "guest",
        isAuthenticated: Boolean(user),
        used: 0,
        limit: 999,
        remaining: 999,
        resetAt: null,
      }
    : await getQuotaStatus({
        userId: user?.id ?? null,
        guestId: guest?.guestId ?? null,
      });

  const response = NextResponse.json({ quota });

  if (guest?.isNew) {
    response.cookies.set(GUEST_COOKIE_NAME, guest.guestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  return response;
}
