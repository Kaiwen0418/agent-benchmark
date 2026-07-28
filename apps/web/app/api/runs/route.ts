import { NextResponse } from "next/server";
import { createRunInputSchema } from "@agentbench/protocol";
import {
  getCurrentUser,
  getOrCreateGuestId,
  GUEST_COOKIE_NAME,
  isDevQuotaBypassed,
} from "@/lib/auth";
import {
  BenchmarkCaseUnavailableError,
  createBenchmarkRun,
  getQuotaStatus,
  InvalidModelCatalogSelectionError,
} from "@/lib/db";
import { captureBrowserEnvironment } from "@/lib/run-metadata";
import { isCalibrationControlsEnabled } from "@/lib/calibration";

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsedInput = createRunInputSchema.safeParse(json);
  if (!parsedInput.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "Run configuration is invalid." },
      { status: 400 },
    );
  }
  const input = parsedInput.data;
  const hasCalibrationRevision = input.caseRevisionId !== undefined;
  const hasCalibrationSeed = input.generationSeed !== undefined;
  if (hasCalibrationRevision !== hasCalibrationSeed) {
    return NextResponse.json(
      {
        error: "invalid_calibration",
        message: "Calibration revision and generation seed must be provided together.",
      },
      { status: 400 },
    );
  }
  if ((hasCalibrationRevision || hasCalibrationSeed) && !isCalibrationControlsEnabled()) {
    return NextResponse.json(
      {
        error: "calibration_unavailable",
        message: "Calibration controls are available only in development deployments.",
      },
      { status: 403 },
    );
  }
  const user = await getCurrentUser();
  const guest = user ? null : await getOrCreateGuestId();
  let quota;
  try {
    quota = isDevQuotaBypassed(request)
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
  } catch (error) {
    console.error("[web] benchmark database unavailable during quota check", error);
    return NextResponse.json(
      {
        error: "service_unavailable",
        message: "The benchmark service is temporarily unavailable. Please try again shortly.",
        retryable: true,
      },
      { status: 503 },
    );
  }

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
      agent: input.agent,
      browserEnvironment: captureBrowserEnvironment(request.headers),
      calibration: input.caseRevisionId && input.generationSeed
        ? {
            caseRevisionId: input.caseRevisionId,
            generationSeed: input.generationSeed,
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof InvalidModelCatalogSelectionError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof BenchmarkCaseUnavailableError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }
    console.error("[web] benchmark database unavailable during run creation", error);
    return NextResponse.json(
      {
        error: "service_unavailable",
        message: "The benchmark service is temporarily unavailable. Please try again shortly.",
        retryable: true,
      },
      { status: 503 },
    );
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
