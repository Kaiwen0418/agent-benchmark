import type { BenchmarkCase, BenchmarkRun } from "@agentbench/protocol";
import { getOrCreateHostedWebAttemptConnection, isHostedWebCase } from "./hosted-web";
import { hasRegisteredRunMetadata } from "./run-metadata";

function getGoal(benchmarkCase: BenchmarkCase | null) {
  if (!benchmarkCase) {
    return "Complete the benchmark objective using only the tools provided for this run.";
  }

  return benchmarkCase.description;
}

export function agentIdentityConfirmationInstruction() {
  return [
    "Before taking any benchmark action, determine your own agent name and base model from the current runtime.",
    'Ask the user: "I currently identify as [agent name], using [base model]. Should I complete this benchmark under this identity?"',
    "Wait for explicit confirmation. If the user corrects either value, use the corrected identity when registering metadata on the connection page.",
    "Do not register metadata, open a hosted case, or perform benchmark work until the user confirms the identity.",
  ].join(" ");
}

export function buildAgentRunGuidance(params: {
  runId: string;
  connectUrl: string;
  sessionCount?: number;
  timeLimitMinutes?: number | null;
}) {
  const timeLimit = params.timeLimitMinutes
    ? `You have ${params.timeLimitMinutes} minute${params.timeLimitMinutes === 1 ? "" : "s"} to complete each hosted task.`
    : "";
  const suiteInstructions = [
    "Complete the entire ordered suite, not only the current case. A completed case is an intermediate milestone, not a stopping condition.",
    "After each case completes, return to this connection page and use Proceed to open the next allocated active case. Repeat until the entire suite is completed.",
    "Stop only when the entire suite is completed, the run has reached a terminal failure, cancellation, or timeout state, or further progress is clearly blocked. Report any blocker and the last confirmed suite progress.",
  ];
  return {
    prompt: [
      agentIdentityConfirmationInstruction(),
      "Open the AgentBench connection page below.",
      "Register the agent identity in the form, then open only the allocated active hosted case.",
      ...suiteInstructions,
      timeLimit,
      params.connectUrl,
    ].filter(Boolean).join("\n"),
    instructions: [
      agentIdentityConfirmationInstruction(),
      `Open the connection page for run ${params.runId}.`,
      ...(params.sessionCount === undefined ? [] : [
        `This suite contains ${params.sessionCount} hosted session${params.sessionCount === 1 ? "" : "s"}.`,
      ]),
      timeLimit,
      "Register the agent name, version, base model, and optional metadata in the form on this page.",
      "Read the benchmark objective and hosted suite details. Open only the active hosted case shown on this page.",
      "Use only the session URLs allocated for this run and the tools and sites exposed for this run.",
      ...suiteInstructions,
    ].filter(Boolean),
  };
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
  const timeLimitMinutes = hostedWeb?.timeLimitMinutes ?? null;
  const guidance = buildAgentRunGuidance({
    runId: run.id,
    connectUrl,
    sessionCount: hostedWeb?.sessions.length,
    timeLimitMinutes,
  });

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
    instructions: guidance.instructions,
    prompt: guidance.prompt,
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
          timeLimitMinutes: hostedWeb.timeLimitMinutes,
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
