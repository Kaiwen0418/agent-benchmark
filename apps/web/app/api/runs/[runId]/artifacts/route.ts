import { NextResponse } from "next/server";
import { getBenchmarkRun, listArtifacts } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await getBenchmarkRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const artifacts = await listArtifacts(runId);
  return NextResponse.json({ artifacts });
}
