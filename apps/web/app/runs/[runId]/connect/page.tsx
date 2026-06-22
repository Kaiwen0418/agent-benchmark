import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RunMetadataForm } from "@/components/run/RunMetadataForm";
import { getBenchmarkCase, getBenchmarkRun } from "@/lib/db";
import { buildRunConnectPayload } from "@/lib/run-connect";

function getOrigin(host: string | null, proto: string | null) {
  if (!host) {
    return "http://localhost:3000";
  }

  return `${proto ?? "https"}://${host}`;
}

export default async function RunConnectPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getBenchmarkRun(runId);

  if (!run) {
    notFound();
  }

  const benchmarkCase = await getBenchmarkCase(run.caseId);
  const headerStore = await headers();
  const origin = getOrigin(headerStore.get("x-forwarded-host") ?? headerStore.get("host"), headerStore.get("x-forwarded-proto"));
  const payload = await buildRunConnectPayload({
    run,
    benchmarkCase,
    origin,
  });
  const metadata = { ...run.metadata };
  delete metadata.identityReportedAt;
  const metadataLocked = ["completed", "failed", "cancelled", "timeout"].includes(run.status);

  return (
    <main className="min-h-screen bg-[#f5f0e6] px-6 py-10 text-[#111111] md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[2rem] border border-[#d8d1c4] bg-[#faf7f1] p-6 shadow-[0_24px_80px_rgba(17,17,17,0.08)] md:p-8">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">AgentBench Run Connection</div>
          <h1 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            {payload.benchmark.title}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-[#66625a]">{payload.benchmark.goal}</p>
          {payload.status === "timeout" || payload.status === "failed" ? (
            <div className="mt-6 rounded-[1.4rem] border border-[#e3b4aa] bg-[#fff7f4] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[#8a2d1f]">
                {payload.status === "timeout" ? "Run timed out" : "Run failed"}
              </div>
              <p className="mt-2 text-sm leading-7 text-[#5b3d37]">
                {payload.errorMessage ?? "This run no longer has an active hosted session."}
              </p>
            </div>
          ) : null}

          <RunMetadataForm
            runId={run.id}
            initialAgent={run.agent}
            initialMetadata={metadata}
            locked={metadataLocked}
          />

          <div className="mt-8 grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[1.4rem] border border-[#ddd6ca] bg-white p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Instructions For Agents</div>
              <ol className="mt-4 space-y-3 text-sm leading-7 text-[#302d29]">
                {payload.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="rounded-[1.4rem] border border-[#ddd6ca] bg-[#f1eee7] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">
                {payload.hostedWeb.available ? "Hosted Suite" : "Local Demo Note"}
              </div>
              <p className="mt-4 text-sm leading-7 text-[#4f4a43]">{payload.hostedNote.note}</p>
              <div className="mt-5 rounded-[1rem] bg-[#111111] px-4 py-3 text-sm text-white">
                {payload.hostedWeb.available ? (
                  <>
                    Suite: <span className="font-medium">{payload.hostedWeb.suiteSlug ?? "hosted-web"}</span>
                    <br />
                    Attempt: <span className="font-medium">{payload.hostedWeb.attemptId ?? "not allocated"}</span>
                    <br />
                    Active Session: <span className="font-medium">{payload.hostedWeb.activeSessionId ?? "not allocated"}</span>
                    <br />
                    Progress: <span className="font-medium">
                      {payload.hostedWeb.progress.total > 0 && payload.hostedWeb.progress.currentIndex !== null
                        ? `${payload.hostedWeb.progress.currentIndex + 1} / ${payload.hostedWeb.progress.total}`
                        : `${payload.hostedWeb.progress.completed} / ${payload.hostedWeb.progress.total}`}
                    </span>
                  </>
                ) : (
                  <>
                    Status: <span className="font-medium">{payload.status}</span>
                  </>
                )}
              </div>
              {payload.hostedWeb.orchestratorUrl ? (
                <a
                  href={payload.hostedWeb.orchestratorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-full bg-[#111111] px-5 py-2.5 text-sm font-medium text-white"
                >
                  Open Active Benchmark
                </a>
              ) : null}
            </section>
          </div>

          <section className="mt-6 rounded-[1.4rem] border border-[#ddd6ca] bg-white p-5">
            {payload.hostedWeb.available ? (
              <div className="mb-5 grid gap-3">
                {payload.hostedWeb.sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="flex items-start justify-between gap-3 rounded-[1rem] border border-[#e4ddd1] bg-[#faf7f1] px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-[#111111]">
                        {session.title ?? session.taskSlug}
                      </div>
                      <div className="mt-1 text-xs text-[#6b655b]">
                        Session {session.sequenceIndex + 1} · {session.app}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-[#4f4a43]">{session.goal}</div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                      session.status === "completed"
                        ? "bg-[#e8f7ec] text-[#1f6b35]"
                        : session.status === "failed" || session.status === "expired"
                          ? "bg-[#fff1ed] text-[#8a2d1f]"
                          : session.status === "active"
                            ? "bg-[#eef6ff] text-[#245a8a]"
                            : "bg-[#efede6] text-[#4d483f]"
                    }`}>
                      {session.status.replaceAll("-", " ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Prompt</div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1rem] bg-[#f6f3ed] p-4 text-sm leading-7 text-[#25221d]">
              {payload.prompt}
            </pre>
          </section>

          <section className="mt-6 rounded-[1.4rem] border border-[#ddd6ca] bg-white p-5">
            <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Machine Readable Config</div>
            <pre className="mt-4 overflow-x-auto rounded-[1rem] bg-[#111111] p-4 text-xs leading-6 text-[#d7ff00]">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </section>
        </div>
      </div>
      <script
        id="agentbench-run-config"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
      />
    </main>
  );
}
