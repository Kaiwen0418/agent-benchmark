import type { HostedAttemptReadModel } from "@agentbench/shared";
import type {
  AttemptLifecycleAdvanceSession,
  AttemptLifecycleSession,
  CompleteSessionCommandResult,
  ResolveAdvanceCommandResult,
  TimeoutAttemptCommandResult,
} from "./attempt-lifecycle";
import type { HostedWebScoreResult, HostedWebSuiteScoreResult } from "@agentbench/scoring";

type AttemptHandlersDeps<TReadModel extends HostedAttemptReadModel> = {
  initializeAttempt: (params: {
    runId: string | null;
    caseId: string | null;
    callbackSecret: string | null;
    suiteSlug: string;
    suiteVersion: string;
    sessions: Array<{
      app: string;
      taskSlug: string;
      taskVersion: string;
      sequenceIndex: number;
      weight: number;
      required: boolean;
      title: string | null;
      goal: string | null;
      startPath: string | null;
      seedVersion: string | null;
      metadata: Record<string, unknown>;
    }>;
  }) => Promise<{
    attemptId: string;
    suiteSlug: string;
    suiteVersion: string;
    metadata: Record<string, unknown>;
    sessions: Array<{
      sessionId: string;
      attemptId: string | null;
      token: string;
      app: string;
      taskSlug: string;
      taskVersion: string;
      sequenceIndex: number;
      weight: number;
      required: boolean;
      startUrl: string;
      goal: string;
      title: string | null;
      status: string;
    }>;
  }>;
  completeSessionCommand: (session: AttemptLifecycleSession, result: HostedWebScoreResult) => Promise<CompleteSessionCommandResult>;
  resolveAdvanceCommand: (
    attemptId: string,
    currentSessionId: string,
  ) => Promise<ResolveAdvanceCommandResult>;
  timeoutAttemptCommand: (params: {
    attemptId: string;
    runId: string | null;
    expiredSessionId: string;
    expiredTaskSlug: string;
  }) => Promise<TimeoutAttemptCommandResult>;
  loadAttemptReadModel: (attemptId: string) => Promise<TReadModel>;
  forwardRunEvent: (session: AttemptLifecycleSession, type: string, payload: Record<string, unknown>) => Promise<void>;
  forwardCompletion: (
    session: AttemptLifecycleSession,
    result: Pick<HostedWebSuiteScoreResult, "status" | "score" | "summary">,
  ) => Promise<void>;
  publicBaseUrl: string;
  defaultStartPathForApp: (app: string) => string;
};

export type CompleteSessionHandlerResponse = {
  statusCode: number;
  body: HostedWebScoreResult;
};

export type ResolveAdvanceHandlerResponse = {
  statusCode: number;
  body:
    | {
        error: "attempt_session_mismatch";
        message: string;
      }
    | {
        attemptId: string;
        currentSessionId: string;
        complete: boolean;
        nextSessionId: string | null;
        nextStartUrl: string | null;
      };
};

export type AttemptOverviewHandlerResponse<TReadModel extends HostedAttemptReadModel = HostedAttemptReadModel> = {
  statusCode: number;
  body: TReadModel;
};

export type TimeoutAttemptHandlerResponse = {
  statusCode: number;
  body: {
    attemptId: string;
    runId: string | null;
    ok: boolean;
    summary: string | null;
  };
};

export type InitializeAttemptHandlerResponse = {
  statusCode: number;
  body: {
    attemptId: string;
    suiteSlug: string;
    suiteVersion: string;
    metadata: Record<string, unknown>;
    sessions: Array<{
      sessionId: string;
      attemptId: string | null;
      token: string;
      app: string;
      taskSlug: string;
      taskVersion: string;
      sequenceIndex: number;
      weight: number;
      required: boolean;
      startUrl: string;
      goal: string;
      title: string | null;
      status: string;
    }>;
  };
};

function nextStartUrl(
  publicBaseUrl: string,
  defaultStartPathForApp: (app: string) => string,
  nextSession: AttemptLifecycleAdvanceSession | null,
) {
  if (!nextSession) {
    return null;
  }

  return `${publicBaseUrl}${nextSession.startPath ?? defaultStartPathForApp(nextSession.app)}?session=${encodeURIComponent(nextSession.token)}`;
}

export function createAttemptHandlers<TReadModel extends HostedAttemptReadModel>(deps: AttemptHandlersDeps<TReadModel>) {
  async function handleInitializeAttempt(params: {
    runId: string | null;
    caseId: string | null;
    callbackSecret: string | null;
    suiteSlug: string;
    suiteVersion: string;
    sessions: Array<{
      app: string;
      taskSlug: string;
      taskVersion: string;
      sequenceIndex: number;
      weight: number;
      required: boolean;
      title: string | null;
      goal: string | null;
      startPath: string | null;
      seedVersion: string | null;
      metadata: Record<string, unknown>;
    }>;
  }): Promise<InitializeAttemptHandlerResponse> {
    return {
      statusCode: 201,
      body: await deps.initializeAttempt(params),
    };
  }

  async function handleCompleteSession(params: {
    session: AttemptLifecycleSession;
    result: HostedWebScoreResult;
  }): Promise<CompleteSessionHandlerResponse> {
    const completion = await deps.completeSessionCommand(params.session, params.result);
    await deps.forwardRunEvent(params.session, "hosted.score", completion.result);
    if (completion.attemptResult.complete && completion.attemptResult.aggregate) {
      await deps.forwardCompletion(params.session, completion.attemptResult.aggregate);
    }

    return {
      statusCode: 200,
      body: completion.result,
    };
  }

  async function handleResolveAdvance(params: {
    attemptId: string;
    currentSessionId: string;
  }): Promise<ResolveAdvanceHandlerResponse> {
    const advance = await deps.resolveAdvanceCommand(params.attemptId, params.currentSessionId);
    if (!advance.ok) {
      return {
        statusCode: 400,
        body: {
          error: "attempt_session_mismatch",
          message: "Session does not belong to this attempt",
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        attemptId: advance.attemptId,
        currentSessionId: advance.currentSessionId,
        complete: advance.complete,
        nextSessionId: advance.nextSession?.id ?? null,
        nextStartUrl: nextStartUrl(deps.publicBaseUrl, deps.defaultStartPathForApp, advance.nextSession),
      },
    };
  }

  async function handleAttemptOverview(params: {
    attemptId: string;
  }): Promise<AttemptOverviewHandlerResponse<TReadModel>> {
    return {
      statusCode: 200,
      body: await deps.loadAttemptReadModel(params.attemptId),
    };
  }

  async function handleTimeoutAttempt(params: {
    attemptId: string;
    runId: string | null;
    expiredSessionId: string;
    expiredTaskSlug: string;
  }): Promise<TimeoutAttemptHandlerResponse> {
    const timeout = await deps.timeoutAttemptCommand(params);
    return {
      statusCode: timeout.ok ? 200 : 409,
      body: {
        attemptId: timeout.attemptId,
        runId: timeout.runId,
        ok: timeout.ok,
        summary: timeout.summary,
      },
    };
  }

  return {
    handleInitializeAttempt,
    handleCompleteSession,
    handleResolveAdvance,
    handleAttemptOverview,
    handleTimeoutAttempt,
  };
}
