# Benchmark Specification

## Definition Layers

A hosted benchmark is defined across two explicit layers:

1. Suite metadata selects ordered sessions and scoring weights.
2. A hosted app definition implements state, routes, actions, final-state projection, and evaluation.

Suite metadata is stored with the benchmark case and validated through `HostedWebSuiteMetadata`. App implementations live under `apps/hosted-sites/src/apps/<app-id>` and register through the app registry.

## Suite Metadata

```ts
type HostedWebSuiteMetadata = {
  suiteSlug: string;
  suiteVersion: string;
  sessions: Array<{
    app: string;
    taskSlug: string;
    taskVersion: string;
    seedVersion?: string;
    sequenceIndex: number;
    weight: number;
    required: boolean;
    title?: string;
    goal?: string;
    startPath?: string;
    metadata: Record<string, unknown>;
  }>;
};
```

`sequenceIndex` defines progression. `weight` affects aggregate score. A failed `required` session prevents a passing suite result.

## App Definition Requirements

Each app must provide:

- a stable app ID
- typed app-specific state
- deterministic seed data
- validators for persisted state
- default goal and start path
- route handlers and state mutations
- final-state projection
- deterministic evaluators
- tests for actions, hydration, isolation, and scoring

## Evaluation Contract

An evaluator returns:

- `status`: `passed | failed | error`
- normalized `score`: `0..1`
- human-readable `summary`
- evaluator-level evidence
- optional breakdown for debugging and aggregation

Prefer backend-state checks. UI-state or final-response checks should be used only when the success condition cannot be represented by controlled server state.

## Versioning

Changing seed data, success conditions, task wording that affects behavior, or app state shape requires a task/seed/suite version change. Historical results must retain the exact versions used during execution.

Redis envelope versioning is independent from benchmark versioning. It describes storage compatibility, not task semantics.

## Design Rules

- deterministic and replayable
- isolated per session
- observable through structured events
- scoreable without trusting the agent
- small enough to run many concurrent sessions
- explicit about required versus optional criteria
- free of external production-system side effects

## Review Checklist

- Can two sessions execute concurrently without sharing state?
- Can persisted state be validated and safely hydrated?
- Does the evaluator explain failures with evidence?
- Are task and seed versions explicit?
- Is the terminal action idempotent?
- Does the app work behind a load-balanced hosted-sites deployment?
