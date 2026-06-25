import { NextResponse } from "next/server";
import { getBenchmarkCase, getBenchmarkRun } from "@/lib/db";
import { HostedWebSessionError } from "@/lib/hosted-web";
import { buildRunConnectPayload } from "@/lib/run-connect";
import { SupabaseServiceUnavailableError } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  let payload;
  try {
    const run = await getBenchmarkRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
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
        { status: error.status },
      );
    }

    if (error instanceof SupabaseServiceUnavailableError) {
      return NextResponse.json(
        { error: error.code, message: "The benchmark service is temporarily unavailable. Please try again shortly.", retryable: true },
        { status: error.status },
      );
    }

    console.error("[web] failed to build run connect payload", error);
    return NextResponse.json(
      {
        error: "service_unavailable",
        message: "The benchmark service is temporarily unavailable. Please try again shortly.",
        retryable: true,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
