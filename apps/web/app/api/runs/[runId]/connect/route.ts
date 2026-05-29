import { NextResponse } from "next/server";
import { getBenchmarkCase, getBenchmarkRun } from "@/lib/db";
import { HostedWebSessionError } from "@/lib/hosted-web";
import { buildRunConnectPayload } from "@/lib/run-connect";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const run = await getBenchmarkRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const benchmarkCase = await getBenchmarkCase(run.caseId);
  let payload;
  try {
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

    console.error("[web] failed to build run connect payload", error);
    return NextResponse.json(
      {
        error: "run_connect_failed",
        message: "Unable to prepare this run connection. Try again or contact support if it persists.",
        retryable: true,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
