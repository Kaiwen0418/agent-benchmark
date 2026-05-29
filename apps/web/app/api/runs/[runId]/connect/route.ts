import { NextResponse } from "next/server";
import { getBenchmarkCase, getBenchmarkRun } from "@/lib/db";
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
  const payload = await buildRunConnectPayload({
    run,
    benchmarkCase,
    origin: new URL(request.url).origin,
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
