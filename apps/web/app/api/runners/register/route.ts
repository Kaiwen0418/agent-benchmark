import { NextResponse } from "next/server";
import { runnerRegisterInputSchema } from "@agentbench/protocol";
import { registerRunner } from "@/lib/db";
import { requireRunnerAuth } from "@/lib/runner-auth";

export async function POST(request: Request) {
  const authError = requireRunnerAuth(request);
  if (authError) {
    return authError;
  }

  const json = await request.json();
  const input = runnerRegisterInputSchema.parse(json);
  const runner = await registerRunner(input);
  return NextResponse.json({ runner }, { status: 201 });
}
