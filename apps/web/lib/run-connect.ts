import type { BenchmarkCase, BenchmarkRun } from "@agentbench/protocol";
import { getOrCreateHostedWebAttemptConnection, isHostedWebCase } from "./hosted-web";
import { hasRegisteredRunMetadata } from "./run-metadata";

function getGoal(benchmarkCase: BenchmarkCase | null) {
  if (!benchmarkCase) {
    return "Complete the benchmark objective using only the tools provided for this run.";
  }

  return benchmarkCase.description;
}

export async function buildRunConnectPayload(params: {
  run: BenchmarkRun;
  benchmarkCase: BenchmarkCase | null;
  origin: string;
}) {
  const { run, benchmarkCase, origin } = params;
  const metadataRequired = !hasRegisteredRunMetadata(run);
  const hostedWeb =
    !metadataRequired && benchmarkCase && isHostedWebCase(benchmarkCase)
      ? await getOrCreateHostedWebAttemptConnection({ run, benchmarkCase })
      : null;
  const connectUrl = `${origin}/runs/${run.id}/connect`;
  const configUrl = `${origin}/api/runs/${run.id}/connect`;
  const metadataUrl = `${origin}/api/runs/${run.id}/metadata`;
  const goal = getGoal(benchmarkCase);
  const title = benchmarkCase?.title ?? "AgentBench Run";
  const prompt = [
    "Open the AgentBench connection page below.",
    "Register the agent identity in the form, then open the active hosted benchmark and complete the current objective.",
    "Follow the ordered suite instructions and stop when the active task is completed or clearly blocked.",
    "",
    connectUrl,
  ].join("\n");

  return {
    runId: run.id,
    status: run.status,
    errorMessage: run.errorMessage,
    metadataRequired,
    benchmark: {
      id: benchmarkCase?.id ?? run.caseId,
      slug: benchmarkCase?.slug ?? null,
      title,
      description: benchmarkCase?.description ?? null,
      goal,
    },
    instructions: hostedWeb
      ? [
          `Open the hosted benchmark site for run ${run.id}.`,
          `This suite contains ${hostedWeb.sessions.length} hosted session${hostedWeb.sessions.length === 1 ? "" : "s"}.`,
          "Register the agent name, version, base model, and optional metadata in the form on this page.",
          "Open only the active hosted case shown on this page.",
          "After each case completes, return here and proceed to the next active case.",
          "Use only the session URLs allocated for this run.",
          "Stop after the active objective is completed or clearly blocked.",
        ]
      : [
          `Open the connection page for run ${run.id}.`,
          "Register the agent name, version, base model, and optional metadata in the form on this page.",
          "Read the benchmark objective and hosted suite details.",
          "Open the allocated hosted session URL for this run.",
          "Use only the tools and sites exposed for this run.",
          "Stop after the objective is completed or clearly blocked by policy.",
        ],
    prompt,
    connectUrl,
    configUrl,
    metadataUrl,
    metadataSchema: {
      method: "PATCH",
      body: {
        name: "agent or harness name",
        version: "agent or harness version",
        baseModel: "base model identifier",
        metadata: {},
      },
      note: "Agent identity is self-reported. AgentBench captures the submitting client browser environment separately.",
    },
    hostedWeb: hostedWeb
      ? {
          available: true,
          attemptId: hostedWeb.attemptId,
          suiteSlug: hostedWeb.suiteSlug,
          suiteVersion: hostedWeb.suiteVersion,
          orchestratorUrl: hostedWeb.orchestratorUrl,
          advanceUrl: hostedWeb.advanceUrl,
          activeSessionId: hostedWeb.activeSessionId,
          progress: hostedWeb.progress,
          sessions: hostedWeb.sessions.map((session) => ({
            sessionId: session.sessionId,
            app: session.app,
            taskSlug: session.taskSlug,
            taskVersion: session.taskVersion,
            sequenceIndex: session.sequenceIndex,
            weight: session.weight,
            required: session.required,
            startUrl: session.startUrl,
            goal: session.goal,
            title: session.title,
            status: session.status,
          })),
        }
      : {
          available: false,
          attemptId: null,
          suiteSlug: null,
          suiteVersion: null,
          orchestratorUrl: null,
          advanceUrl: null,
          activeSessionId: null,
          progress: {
            currentIndex: null,
            total: 0,
            completed: 0,
          },
          sessions: [],
        },
    hostedNote: {
      note: hostedWeb
        ? "This run uses the hosted-web suite. The hosted benchmark site owns task state and emits scorer-compatible telemetry."
        : "This run is expected to use the hosted benchmark path. No legacy MCP fallback is configured.",
    },
  };
}

export type RunConnectPayload = Awaited<ReturnType<typeof buildRunConnectPayload>>;
