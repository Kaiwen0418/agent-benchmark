import { NextResponse } from "next/server";
import { runnerHeartbeatInputSchema } from "@agentbench/protocol";
import { heartbeatRunner } from "@/lib/db";
import { requireRunnerAuth } from "@/lib/runner-auth";

export async function POST(request: Request) {
  const authError = requireRunnerAuth(request);
  if (authError) {
    return authError;
  }

  const json = await request.json();
  const input = runnerHeartbeatInputSchema.parse(json);
  const runner = await heartbeatRunner(input);

  if (!runner) {
    return NextResponse.json({ error: "Runner not found" }, { status: 404 });
  }

  return NextResponse.json({ runner });
}
