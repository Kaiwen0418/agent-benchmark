type HostedScoringEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export type HostedEvaluatorBreakdown = {
  type: string;
  name: string;
  score: number;
  status: "passed" | "failed" | "error";
  required: boolean;
  errorMessage: string | null;
};

export type HostedSessionBreakdown = {
  sessionId: string;
  app: string;
  taskSlug: string;
  sequenceIndex: number;
  weight: number;
  score: number;
  status: "passed" | "failed" | "error";
  summary: string;
  evaluators: HostedEvaluatorBreakdown[];
};

function evaluatorStatus(value: unknown): HostedEvaluatorBreakdown["status"] {
  return value === "passed" || value === "failed" || value === "error" ? value : "error";
}

function parseEvaluators(value: unknown): HostedEvaluatorBreakdown[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const evaluator = item as Record<string, unknown>;
    return [{
      type: typeof evaluator.type === "string" ? evaluator.type : "unknown",
      name: typeof evaluator.name === "string" ? evaluator.name : "Unnamed evaluator",
      score: typeof evaluator.score === "number" ? evaluator.score : 0,
      status: evaluatorStatus(evaluator.status),
      required: evaluator.required !== false,
      errorMessage: typeof evaluator.errorMessage === "string" ? evaluator.errorMessage : null,
    }];
  });
}

export function deriveHostedScoring(events: HostedScoringEvent[]) {
  const weights = new Map<string, number>();
  const results = new Map<string, HostedSessionBreakdown>();

  for (const event of events) {
    const sessionId = typeof event.payload.sessionId === "string" ? event.payload.sessionId : null;
    if (!sessionId) continue;

    if (event.type === "hosted.session.created") {
      weights.set(
        sessionId,
        typeof event.payload.weight === "number" && event.payload.weight >= 0 ? event.payload.weight : 1,
      );
      continue;
    }

    if (event.type !== "hosted.score") continue;
    const weight =
      typeof event.payload.weight === "number" && event.payload.weight >= 0
        ? event.payload.weight
        : weights.get(sessionId) ?? 1;
    weights.set(sessionId, weight);
    results.set(sessionId, {
      sessionId,
      app: typeof event.payload.app === "string" ? event.payload.app : "hosted-app",
      taskSlug: typeof event.payload.taskSlug === "string" ? event.payload.taskSlug : "hosted-task",
      sequenceIndex:
        typeof event.payload.sequenceIndex === "number" ? event.payload.sequenceIndex : results.size,
      weight,
      score: typeof event.payload.score === "number" ? event.payload.score : 0,
      status: evaluatorStatus(event.payload.status),
      summary: typeof event.payload.summary === "string" ? event.payload.summary : "Session scored.",
      evaluators: parseEvaluators(event.payload.evaluators),
    });
  }

  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  const earnedWeight = [...results.values()].reduce(
    (sum, result) => sum + result.score * result.weight,
    0,
  );

  return {
    score: totalWeight > 0 ? Number((earnedWeight / totalWeight).toFixed(4)) : null,
    sessions: [...results.values()].sort((left, right) => left.sequenceIndex - right.sequenceIndex),
  };
}
