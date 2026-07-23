# Data Model

## Entity Relationships

```mermaid
erDiagram
  BENCHMARK_CASES ||--o{ BENCHMARK_RUNS : selects
  BENCHMARK_CASES ||--o{ BENCHMARK_CASE_REVISIONS : publishes
  BENCHMARK_CASE_REVISIONS ||--o{ BENCHMARK_ATTEMPTS : defines
  BENCHMARK_RUNS ||--o{ BENCHMARK_ATTEMPTS : contains
  BENCHMARK_ATTEMPTS ||--o{ HOSTED_WEB_SESSIONS : orders
  HOSTED_WEB_SESSIONS ||--o{ HOSTED_WEB_EVENTS : emits
  HOSTED_WEB_SESSIONS ||--o| HOSTED_WEB_RESULTS : produces
  BENCHMARK_ATTEMPTS ||--o| BENCHMARK_ATTEMPT_SCORES : aggregates
  HOSTED_WEB_SESSIONS ||--o{ HOSTED_WEB_ACCESS_LOGS : records
  BENCHMARK_ATTEMPTS ||--o| HOSTED_CALLBACK_OUTBOX : enqueues
  BENCHMARK_RUNS ||--o{ RUN_EVENTS : streams
  BENCHMARK_RUNS ||--o{ ARTIFACTS : owns
  MODEL_CATALOG ||--o{ BENCHMARK_RUNS : identifies
  MODEL_CATALOG_SYNC_RUNS }o--|| MODEL_CATALOG : refreshes
  ORCHESTRATOR_COMMAND_DEAD_LETTERS {
    uuid id PK
    text command_id UK
  }
```

## Durable Supabase Records

### `benchmark_cases` and `public_benchmark_cases`

`benchmark_cases` stores benchmark identity, public display fields, provider, visibility, and the current revision pointer. Its `metadata` is display-only and is constrained from containing suite sessions, question variants, or evaluator task configuration.

`public_benchmark_cases` is the anonymous/authenticated discovery boundary. It contains display fields plus a sanitized metadata projection with suite identity and ordered app/task summaries. It never contains question variants, generated task configuration, canonical answers, or evaluator parameters.

`benchmark_cases.current_revision_id` points to the release used for new attempts. The base table never duplicates the private manifest.

### `benchmark_case_revisions`

An immutable, service-role-only release record containing `revision`, SHA-256 `content_hash`, and the complete validated private `manifest`. Catalog publication is atomic and idempotent through `publish_benchmark_case_catalog`, which synchronizes the public case identity before selecting the immutable revision. Normal revision updates and deletes are rejected. Historical attempts keep their revision foreign key when the case's current revision changes.

### `benchmark_runs`

The user-facing execution record. Important fields include owner (`user_id` or `guest_id`), `case_id`, `execution_mode`, lifecycle `status`, final `score`, timestamps, and error information.

Current hosted-web runs use `external-agent`. Some legacy enum values and columns remain in migrations for compatibility but are not active architecture components.

Agent and model identity is self-reported. `agent_name`, `agent_version`, and
`base_model` preserve the submitted display snapshot. A catalog selection also
stores normalized `model_provider`, canonical `model_id`, optional
`reasoning_effort`, and the server-owned `model_catalog_verified_at` timestamp.
Free-text input leaves these structured catalog columns null.

### `model_catalog` and `model_catalog_sync_runs`

`model_catalog` is the service-role-only source behind the public Web
autocomplete API. Its composite key is `(provider, model_id)`. It stores a
display name, aliases, lifecycle status, supported reasoning-effort labels,
release/verification timestamps, source references, and ranking signals.
Direct anonymous/authenticated table access is intentionally absent.

Provider APIs have identity priority over OpenRouter and LiteLLM. A lower
priority discovery source may add an alias but cannot replace an official
display name. Missing or failed sources do not delete or downgrade entries, and
callability alone cannot reactivate a curated legacy/deprecated entry.
`model_catalog_sync_runs` records each source execution independently. The
GitHub maintenance workflow invokes the package CLI with environment-scoped
service-role credentials; Web never performs catalog writes. One provider
outage or absent optional credential does not block the other sources.

### `benchmark_attempts`

One execution of a hosted suite under a run.

- status: `created | running | scoring | completed | failed | cancelled | timeout`
- `completed` means the suite finished and has a durable aggregate score; it does not imply a perfect score. Aggregate evaluator status remains in `benchmark_attempt_scores` and `scoring_summary`.
- `failed` is reserved for lifecycle or evaluator-engine errors. A non-passing evaluator result with a valid aggregate remains a completed attempt.
- suite identity: `suite_slug`, `suite_version`
- immutable definition: `case_revision_id`
- `aggregate_score` and `scoring_summary`
- metadata control fields: `generationSeed`, `caseRevisionId`, `caseRevision`, `caseRevisionContentHash`, `activeSessionId`, `activeSequenceIndex`, `completedSessionIds`

Attempt metadata must not contain `sessions`, `questionVariants`, generated `taskConfig`, canonical answers, evaluator parameters, app state, or raw session tokens. The attempt row binds a run to a suite revision and records suite-level progress; it does not duplicate the generated session manifest.

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

Generated session-specific configuration lives here, under `metadata.questionGeneration`, because it is needed only to recover, render, and score that concrete task. This metadata remains service-role/internal data and is not part of public case discovery or Web-facing run summaries.

### `hosted_web_events`

Append-only task telemetry keyed by session, attempt, and run. `type`, optional `name`, and JSON `payload` support page loads, actions, and task signals.

### `hosted_web_results`

Per-session evaluation result:

- `status`: `passed | failed | error`
- normalized score from `0` to `1`
- summary, final state, evaluator evidence
- app/task/weight snapshot for auditability
- a unique `session_id` invariant; the first persisted terminal result wins concurrent retries

### `benchmark_attempt_scores`

Aggregate suite result with score, status, summary, and a JSON breakdown of all required and optional sessions.
Each attempt has at most one aggregate score. A concurrent writer recovers and uses the existing row.

Public result pages read terminal hosted score details through filtered views, not
the lifecycle tables. `public_hosted_run_consistency_checks` exposes only the
safe display projection of cross-app checks: name, source/target task slugs,
status, score, required flag, and a generalized failure reason. It deliberately
excludes final state, generated configuration, evaluator evidence, and matched
values.

### `hosted_web_access_logs`

Operational audit records for session access and expiry. These records have a retention sweep and should not be treated as permanent benchmark evidence.

### `hosted_callback_outbox`

One durable Web-completion handoff per terminal attempt. The database transition creates the row; orchestrator workers claim, deliver, retry, and eventually mark it `delivered` or `dead`. Callback failure does not roll back the hosted terminal result.

### `orchestrator_command_dead_letters`

Durable diagnostics for Redis commands that exhausted handler retries. It
records the original command identity, Stream/message location, partition,
payload type, redacted payload, final error, attempt count, and replay state.
Sensitive payload keys and token-bearing strings are removed before
persistence. Existing rows are scrubbed online in batches of at most 500 per
maintenance sweep, avoiding a migration-time table rewrite. Dead records are
retained for 90 days by default; replayed and resolved records are retained for
30 days. Maintenance deletes at most 500 expired rows per sweep. Commands that
require a removed credential must be reissued by their source rather than
replayed from the diagnostic record.

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

If `session.expiresAt` is present, TTL is its remaining lifetime rounded up to seconds. Otherwise the cache uses `HOSTED_SESSION_REDIS_TTL_MS`. The current implementation does not take the minimum of both values.

The decoder accepts V2, V1 envelopes, and legacy raw JSON. Legacy flat app fields are migrated into `session.state` during read.

## Hosted Session Shape

Shared fields:

```ts
type HostedSessionBase = {
  id: string;
  token: string;
  accessMode?: "write" | "viewer";
  runId: string | null;
  caseId: string | null;
  attemptId: string | null;
  callbackSecret: string | null;
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
  expiresAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  firstSeenIp: string | null;
  lastSeenIp: string | null;
  firstSeenUserAgent: string | null;
  lastSeenUserAgent: string | null;
  createdAt: string;
  events: Array<Record<string, unknown>>;
  persisted: boolean;
  state: AppSpecificState;
};
```

App-specific state is a generated discriminated union. Each app owns its state in `apps/hosted-sites/src/apps/<app-slug>/types.ts`, and `runtime/generated-app-types.ts` is the generated cross-app map. A session never carries another app's state fields; Redis validation rejects mismatched app/state payloads.

The Redis envelope currently contains the raw write token, generated private task configuration inside `metadata`, and may contain a callback secret. Redis must therefore remain private. Token hashing, credential minimization, and ACL separation are tracked in [Issue #62](https://github.com/Kaiwen0418/agent-benchmark/issues/62).

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

- Redis is authoritative for the latest available mutable task state during an active session, but current whole-envelope writes are not concurrency-safe.
- Supabase is authoritative for durable lifecycle, audit, and scoring records.
- `benchmark_case_revisions` is authoritative for the suite manifest used by an attempt. Attempts store only the revision/seed/progress binding; generated per-session question snapshots remain on `hosted_web_sessions.metadata`.
- The orchestrator is the only application writer for attempts, hosted sessions, and hosted results; hosted-sites may read session rows only for cache recovery.
- The process-local Map is not authoritative and may be lost at any time.
- `metadata.appState` is a recovery snapshot, not a separately writable domain model.
- Attempt progression is determined by orchestrator metadata plus persisted session/result rows.
- Session cache keys and ingest records are separate. Durable commands use partitioned `agentbench:orchestrator:commands:p<N>` Streams, consumer group `hosted-orchestrator`, 24-hour command result keys, short-lived response lists, and partition lease keys.

See [Data Ownership](./data-ownership.md) for the complete reader/writer matrix and [Consistency and Failure](./consistency-and-failure.md) for implemented guarantees.
