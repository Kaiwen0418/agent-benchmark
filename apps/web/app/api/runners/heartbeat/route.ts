import { NextResponse } from "next/server";
import { runnerHeartbeatInputSchema } from "@agentbench/protocol";
import { heartbeatRunner } from "@/lib/db";

export async function POST(request: Request) {
  const json = await request.json();
  const input = runnerHeartbeatInputSchema.parse(json);
  const runner = await heartbeatRunner(input);

  if (!runner) {
    return NextResponse.json({ error: "Runner not found" }, { status: 404 });
  }

  return NextResponse.json({ runner });
}
