import { NextResponse } from "next/server";
import { listHostedSessionDeadlines } from "@/lib/hosted-web";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const sessions = await listHostedSessionDeadlines(runId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[web] failed to load hosted session deadlines", error);
    return NextResponse.json(
      { error: "Failed to load hosted session deadlines" },
      { status: 503 },
    );
  }
}
