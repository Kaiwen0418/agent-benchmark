import { NextResponse } from "next/server";
import { runnerRegisterInputSchema } from "@agentbench/protocol";
import { registerRunner } from "@/lib/db";

export async function POST(request: Request) {
  const json = await request.json();
  const input = runnerRegisterInputSchema.parse(json);
  const runner = await registerRunner(input);
  return NextResponse.json({ runner }, { status: 201 });
}
