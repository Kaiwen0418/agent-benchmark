import { getBenchmarkRun, getRunStreamFingerprint, listArtifacts, listRunEvents } from "@/lib/db";

const encoder = new TextEncoder();
const STREAM_MAX_DURATION_MS = 25_000;
const STREAM_POLL_MS = 5_000;
const STREAM_HEARTBEAT_MS = 10_000;

export const dynamic = "force-dynamic";

type RunStreamPayload = {
  run: Awaited<ReturnType<typeof getBenchmarkRun>>;
  events: Awaited<ReturnType<typeof listRunEvents>>;
  artifacts: Awaited<ReturnType<typeof listArtifacts>>;
};

type RunStreamFingerprint = Awaited<ReturnType<typeof getRunStreamFingerprint>>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSseChunk(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function makeFingerprint(payload: RunStreamPayload) {
  return JSON.stringify({
    run: payload.run
      ? {
          id: payload.run.id,
          status: payload.run.status,
          score: payload.run.score,
          errorMessage: payload.run.errorMessage,
          completedAt: payload.run.completedAt,
          startedAt: payload.run.startedAt,
          runnerId: payload.run.runnerId,
        }
      : null,
    lastEventId: payload.events[payload.events.length - 1]?.id ?? null,
    lastArtifactId: payload.artifacts[payload.artifacts.length - 1]?.id ?? null,
  });
}

function stringifyFingerprint(fingerprint: RunStreamFingerprint) {
  return JSON.stringify(fingerprint);
}

function isTerminal(status: string | null | undefined) {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "timeout";
}

async function loadSnapshot(runId: string): Promise<RunStreamPayload> {
  const [run, events, artifacts] = await Promise.all([
    getBenchmarkRun(runId),
    listRunEvents(runId),
    listArtifacts(runId),
  ]);

  return { run, events, artifacts };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const initialSnapshot = await loadSnapshot(runId);

  if (!initialSnapshot.run) {
    return new Response(JSON.stringify({ error: "Run not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
  const initialRun = initialSnapshot.run;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastFingerprint = "";
      let lastHeartbeatAt = 0;
      const startedAt = Date.now();

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        controller.close();
      };

      request.signal.addEventListener("abort", close);

      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      lastFingerprint = makeFingerprint(initialSnapshot);
      controller.enqueue(toSseChunk("snapshot", initialSnapshot));

      if (isTerminal(initialRun.status)) {
        controller.enqueue(toSseChunk("terminal", { status: initialRun.status }));
        close();
        return;
      }

      while (!closed) {
        await sleep(STREAM_POLL_MS);

        const fingerprintSnapshot = await getRunStreamFingerprint(runId);
        if (!fingerprintSnapshot.run) {
          controller.enqueue(toSseChunk("error", { message: "Run not found" }));
          close();
          break;
        }

        const fingerprint = stringifyFingerprint(fingerprintSnapshot);
        if (fingerprint !== lastFingerprint) {
          const snapshot = await loadSnapshot(runId);
          if (!snapshot.run) {
            controller.enqueue(toSseChunk("error", { message: "Run not found" }));
            close();
            break;
          }
          lastFingerprint = fingerprint;
          controller.enqueue(toSseChunk("snapshot", snapshot));

          if (isTerminal(snapshot.run.status)) {
            controller.enqueue(toSseChunk("terminal", { status: snapshot.run.status }));
            close();
            break;
          }
        }

        const now = Date.now();
        if (now - lastHeartbeatAt >= STREAM_HEARTBEAT_MS) {
          controller.enqueue(toSseChunk("heartbeat", { ts: new Date(now).toISOString() }));
          lastHeartbeatAt = now;
        }

        if (now - startedAt >= STREAM_MAX_DURATION_MS) {
          close();
          break;
        }

        await sleep(STREAM_POLL_MS);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
