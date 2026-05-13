import { NextResponse } from "next/server";
import { appendRunEventInputSchema } from "@agentbench/protocol";
import { appendRunEvent, getBenchmarkRun, listRunEvents } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await getBenchmarkRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const events = await listRunEvents(runId);
  return NextResponse.json({ events });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const json = await request.json();
  const input = appendRunEventInputSchema.parse(json);

  const run = await getBenchmarkRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const result = await appendRunEvent(runId, input);
  return NextResponse.json(result, { status: 201 });
}
