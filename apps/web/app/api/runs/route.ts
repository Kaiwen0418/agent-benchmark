import { NextResponse } from "next/server";
import { createRunInputSchema } from "@agentbench/protocol";
import {
  getCurrentUser,
  getOrCreateGuestId,
  GUEST_COOKIE_NAME,
  isDevQuotaBypassed,
} from "@/lib/auth";
import { BenchmarkCaseUnavailableError, createBenchmarkRun, getQuotaStatus } from "@/lib/db";

export async function POST(request: Request) {
  const json = await request.json();
  const input = createRunInputSchema.parse(json);
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

  if (quota.remaining <= 0) {
    const response = NextResponse.json(
      {
        error: quota.mode === "guest" ? "trial_limit_reached" : "daily_limit_reached",
        message:
          quota.mode === "guest"
            ? "Guest trial used. Sign in to continue with 3 daily runs."
            : "Daily run limit reached. Try again after reset.",
        quota,
      },
      { status: 403 },
    );

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

  let run;
  try {
    run = await createBenchmarkRun({
      caseId: input.caseId,
      userId: user?.id ?? null,
      guestId: guest?.guestId ?? null,
      executionMode: input.executionMode,
      isPublic: input.isPublic,
    });
  } catch (error) {
    if (error instanceof BenchmarkCaseUnavailableError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }
    throw error;
  }
  const nextQuota = {
    ...quota,
    used: quota.used + 1,
    remaining: Math.max(0, quota.remaining - 1),
  };
  const response = NextResponse.json({ run, quota: nextQuota }, { status: 201 });

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
