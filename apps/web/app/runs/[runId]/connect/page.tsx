import { headers } from "next/headers";
import { notFound } from "next/navigation";
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
  const payload = buildRunConnectPayload({
    run,
    benchmarkCase,
    origin,
  });

  return (
    <main className="min-h-screen bg-[#f5f0e6] px-6 py-10 text-[#111111] md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[2rem] border border-[#d8d1c4] bg-[#faf7f1] p-6 shadow-[0_24px_80px_rgba(17,17,17,0.08)] md:p-8">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">AgentBench Run Connection</div>
          <h1 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            {payload.benchmark.title}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-[#66625a]">{payload.benchmark.goal}</p>

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
              <div className="text-xs uppercase tracking-[0.18em] text-[#756e62]">Local Demo Note</div>
              <p className="mt-4 text-sm leading-7 text-[#4f4a43]">{payload.localDemo.note}</p>
              <div className="mt-5 rounded-[1rem] bg-[#111111] px-4 py-3 text-sm text-white">
                MCP: <span className="font-medium">{payload.mcp.transport}</span>
                <br />
                Command: <span className="font-medium">{payload.mcp.command}</span>
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-[1.4rem] border border-[#ddd6ca] bg-white p-5">
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
