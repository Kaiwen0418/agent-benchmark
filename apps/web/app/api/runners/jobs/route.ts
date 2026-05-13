import { NextResponse } from "next/server";
import { listRunners, assignRunnerJob } from "@/lib/db";
import { requireRunnerAuth } from "@/lib/runner-auth";

export async function GET(request: Request) {
  const authError = requireRunnerAuth(request);
  if (authError) {
    return authError;
  }

  const runnerId = new URL(request.url).searchParams.get("runnerId");

  if (!runnerId) {
    return NextResponse.json({ error: "runnerId is required" }, { status: 400 });
  }

  const runner = (await listRunners()).find((item) => item.id === runnerId);
  if (!runner) {
    return NextResponse.json({ error: "Runner not found" }, { status: 404 });
  }

  const run = await assignRunnerJob(runnerId);

  if (!run) {
    return NextResponse.json({ job: null });
  }

  return NextResponse.json({
    job: {
      runId: run.id,
      caseId: run.caseId,
      liveViewUrl: run.liveViewUrl,
      status: run.status,
    },
  });
}
