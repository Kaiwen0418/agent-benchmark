# Data Model

> [中文](./data-model.zh-CN.md) | English

## Entity Relationships

```mermaid
erDiagram
  BENCHMARK_CASES ||--o{ BENCHMARK_RUNS : selects
  BENCHMARK_RUNS ||--o{ BENCHMARK_ATTEMPTS : contains
  BENCHMARK_ATTEMPTS ||--o{ HOSTED_WEB_SESSIONS : orders
  HOSTED_WEB_SESSIONS ||--o{ HOSTED_WEB_EVENTS : emits
  HOSTED_WEB_SESSIONS ||--o{ HOSTED_WEB_RESULTS : produces
  BENCHMARK_ATTEMPTS ||--o{ BENCHMARK_ATTEMPT_SCORES : aggregates
  HOSTED_WEB_SESSIONS ||--o{ HOSTED_WEB_ACCESS_LOGS : records
  BENCHMARK_RUNS ||--o{ RUN_EVENTS : streams
  BENCHMARK_RUNS ||--o{ ARTIFACTS : owns
```

## Durable Supabase Records

### `benchmark_runs`

The user-facing execution record. Important fields include owner (`user_id` or `guest_id`), `case_id`, `execution_mode`, lifecycle `status`, final `score`, timestamps, and error information.

Current hosted-web runs use `external-agent`. Some legacy enum values and columns remain in migrations for compatibility but are not active architecture components.

### `benchmark_attempts`

One execution of a hosted suite under a run.

- status: `created | running | scoring | completed | failed | cancelled | timeout`
- suite identity: `suite_slug`, `suite_version`
- `aggregate_score` and `scoring_summary`
- metadata control fields: `activeSessionId`, `activeSequenceIndex`, `completedSessionIds`

### `hosted_web_sessions`

One ordered task in an attempt.

- identity: `app`, `task_slug`, `task_version`, `seed_version`
- ordering: `sequence_index`
- scoring: `weight`, `required`
- lifecycle: `created | active | scoring | completed | failed | expired`
- routing: `start_url`
- authentication: `session_token_hash`; raw token is never persisted
- recovery metadata: suite fields, title, goal, start path, and app-specific state snapshot
- access metadata: count, first/last IP, user agent, access time, expiry

### `hosted_web_events`

Append-only task telemetry keyed by session, attempt, and run. `type`, optional `name`, and JSON `payload` support page loads, actions, and task signals.

### `hosted_web_results`

Per-session evaluation result:

- `status`: `passed | failed | error`
- normalized score from `0` to `1`
- summary, final state, evaluator evidence
- app/task/weight snapshot for auditability

### `benchmark_attempt_scores`

Aggregate suite result with score, status, summary, and a JSON breakdown of all required and optional sessions.

### `hosted_web_access_logs`

Operational audit records for session access and expiry. These records have a retention sweep and should not be treated as permanent benchmark evidence.

## Redis Runtime Schema

Key:

```text
hosted-sites:session:<opaque-token>
```

Value:

```ts
type RedisHostedSessionEnvelopeV2 = {
  schemaVersion: 2;
  session: HostedSession;
};
```

TTL is the smaller practical boundary derived from `session.expiresAt` or `HOSTED_SESSION_REDIS_TTL_MS`, rounded up to seconds.

The decoder accepts V2, V1 envelopes, and legacy raw JSON. Legacy flat app fields are migrated into `session.state` during read.

## Hosted Session Shape

Shared fields:

```ts
type HostedSessionBase = {
  id: string;
  token: string;
  runId: string | null;
  caseId: string | null;
  attemptId: string | null;
  app: HostedAppId;
  suiteSlug: string;
  suiteVersion: string;
  taskSlug: string;
  taskVersion: string;
  sequenceIndex: number;
  weight: number;
  required: boolean;
  title: string | null;
  goal: string;
  startPath: string | null;
  seedVersion: string;
  metadata: Record<string, unknown>;
  status: "created" | "active" | "completed" | "failed" | "expired";
  events: Array<Record<string, unknown>>;
  state: AppSpecificState;
};
```

App-specific state is a discriminated union:

| App | State fields |
| --- | --- |
| `shopping-lite` | `products`, `cart`, `orders` |
| `wiki-lite` | `wikiArticles`, `wikiAnswerSubmissions` |
| `forum-lite` | `threads`, `moderationActions` |
| `repo-lite` | `files`, `issues`, `mergeRequests` |

A session never carries another app's state fields. Redis validation rejects mismatched app/state payloads.

## State Machines

```mermaid
stateDiagram-v2
  [*] --> created
  created --> active
  active --> completed: evaluation passed
  active --> failed: evaluation failed/error
  created --> expired
  active --> expired
```

```mermaid
stateDiagram-v2
  [*] --> created
  created --> running
  running --> scoring
  running --> completed
  running --> failed
  running --> timeout
  created --> cancelled
  running --> cancelled
```

## Source-of-Truth Rules

- Redis is authoritative for mutable task state during an active session.
- Supabase is authoritative for durable lifecycle, audit, and scoring records.
- The orchestrator is the only application writer for attempts, hosted sessions, and hosted results; hosted-sites may read session rows only for cache recovery.
- The process-local Map is not authoritative and may be lost at any time.
- `metadata.appState` is a recovery snapshot, not a separately writable domain model.
- Attempt progression is determined by orchestrator metadata plus persisted session/result rows.
- Session cache keys and ingest records are separate. Durable commands use partitioned `agentbench:orchestrator:commands:p<N>` Streams, consumer group `hosted-orchestrator`, 24-hour command result keys, short-lived response lists, and partition lease keys.
