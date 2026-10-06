import { NextResponse } from "next/server";
import { getCurrentGuestId, getCurrentUser } from "@/lib/auth";
import { cancelBenchmarkRun, getBenchmarkRun } from "@/lib/db";
import { cancelHostedAttemptForRun } from "@/lib/hosted-web";
import { isRunOwnedBy, type RunOwnerIdentity } from "@/lib/run-cancellation";
import { terminalRunStatuses } from "@/lib/run-lifecycle";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const user = await getCurrentUser();
  const guestId = user ? null : await getCurrentGuestId();
  const owner: RunOwnerIdentity | null = user
    ? { userId: user.id }
    : guestId
      ? { guestId }
      : null;
  const run = owner ? await getBenchmarkRun(runId) : null;
  if (!run || !owner || !isRunOwnedBy(run, owner)) {
    return NextResponse.json({ error: "run_not_found", message: "Run not found." }, { status: 404 });
  }

  if (run.status === "cancelled") {
    return NextResponse.json({ run });
  }
  if (terminalRunStatuses.has(run.status)) {
    return NextResponse.json(
      { error: "run_terminal", message: `This run has already ${run.status === "completed" ? "completed" : "ended"}.` },
      { status: 409 },
    );
  }

  const hostedCancellation = await cancelHostedAttemptForRun(runId);
  if (!hostedCancellation) {
    return NextResponse.json(
      { error: "orchestrator_unavailable", message: "The run could not be stopped. It is still being monitored." },
      { status: 503 },
    );
  }
  if (hostedCancellation.statusCode === 409) {
    return NextResponse.json(
      { error: "attempt_terminal", message: "The hosted attempt has already ended. Refreshing the run state is required." },
      { status: 409 },
    );
  }
  if (!hostedCancellation.body.ok) {
    return NextResponse.json(
      { error: "cancellation_failed", message: "The run could not be stopped. It is still being monitored." },
      { status: 503 },
    );
  }

  const cancelled = await cancelBenchmarkRun(runId, owner);
  if (!cancelled) {
    return NextResponse.json({ error: "run_not_found", message: "Run not found." }, { status: 404 });
  }
  if (cancelled.status !== "cancelled") {
    return NextResponse.json(
      { error: "run_terminal", message: "The run reached another terminal state before cancellation completed." },
      { status: 409 },
    );
  }

  return NextResponse.json({ run: cancelled });
}
