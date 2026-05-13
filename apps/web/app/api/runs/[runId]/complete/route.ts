import { NextResponse } from "next/server";
import { completeRunInputSchema } from "@agentbench/protocol";
import { completeBenchmarkRun } from "@/lib/db";
import { requireRunnerAuth } from "@/lib/runner-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const authError = requireRunnerAuth(request);
  if (authError) {
    return authError;
  }

  const { runId } = await params;
  const json = await request.json();
  const input = completeRunInputSchema.parse(json);
  const run = await completeBenchmarkRun(runId, input);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
