import { NextResponse } from "next/server";
import { createRunInputSchema } from "@agentbench/protocol";
import { createBenchmarkRun } from "@/lib/db";

export async function POST(request: Request) {
  const json = await request.json();
  const input = createRunInputSchema.parse(json);

  const run = await createBenchmarkRun({
    caseId: input.caseId,
    userId: null,
  });

  return NextResponse.json({ run }, { status: 201 });
}
