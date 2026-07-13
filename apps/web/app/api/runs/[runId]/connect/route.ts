import { NextResponse } from "next/server";
import { getBenchmarkCase, getBenchmarkRun } from "@/lib/db";
import { HostedWebSessionError } from "@/lib/hosted-web";
import { buildRunConnectPayload } from "@/lib/run-connect";
import { negativeRunConnectCacheHeaders } from "@/lib/run-connect-cache";
import { checkRunConnectRateLimit } from "@/lib/connect-rate-limit";
import { terminalRunStatuses } from "@/lib/run-lifecycle";
import { SupabaseServiceUnavailableError } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const rateLimit = checkRunConnectRateLimit(request, runId);
  const rateLimitHeaders = {
    "RateLimit-Limit": String(rateLimit.limit),
    "RateLimit-Remaining": String(rateLimit.remaining),
    "RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1_000)),
  };

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many connection requests. Wait before trying again.",
        retryable: true,
      },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let payload;
  try {
    const run = await getBenchmarkRun(runId);
    if (!run) {
      return NextResponse.json(
        { error: "run_not_found", message: "Run not found", retryable: false },
        { status: 404, headers: negativeRunConnectCacheHeaders(404) },
      );
    }
    if (terminalRunStatuses.has(run.status)) {
      return NextResponse.json(
        {
          error: "run_terminal",
          message: `This benchmark run has already ${run.status === "completed" ? "completed" : "ended"}.`,
          retryable: false,
        },
        { status: 410, headers: negativeRunConnectCacheHeaders(410) },
      );
    }
    const benchmarkCase = await getBenchmarkCase(run.caseId);
    payload = await buildRunConnectPayload({
      run,
      benchmarkCase,
      origin: new URL(request.url).origin,
    });
  } catch (error) {
    if (error instanceof HostedWebSessionError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          retryable: error.retryable,
          hostedSitesUrl: error.hostedSitesUrl,
        },
        { status: error.status, headers: rateLimitHeaders },
      );
    }

    if (error instanceof SupabaseServiceUnavailableError) {
      return NextResponse.json(
        { error: error.code, message: "The benchmark service is temporarily unavailable. Please try again shortly.", retryable: true },
        { status: error.status, headers: rateLimitHeaders },
      );
    }

    console.error("[web] failed to build run connect payload", error);
    return NextResponse.json(
      {
        error: "service_unavailable",
        message: "The benchmark service is temporarily unavailable. Please try again shortly.",
        retryable: true,
      },
      { status: 503, headers: rateLimitHeaders },
    );
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      ...rateLimitHeaders,
    },
  });
}
