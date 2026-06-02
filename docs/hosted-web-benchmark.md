# Hosted Web Benchmarks

> [中文](./hosted-web-benchmark.zh-CN.md) | English

## Purpose

Hosted web benchmarks are public, AgentBench-controlled websites that simulate real web applications while keeping execution in the user's agent environment.

This model is intended for WebArena-like tasks where the platform should provide deterministic target websites, session state, telemetry, and scoring, but should not launch a server-side Chromium instance for every run.

## Why This Exists

The current AgentBench runner supports two useful modes:

- internal Playwright scenarios for deterministic local demos
- external-agent MCP sessions where the user's agent performs the work

Full WebArena-style hosting adds another dimension: realistic multi-page web applications with task-specific state. Running those environments together with one browser per run can become expensive quickly.

Hosted web benchmarks split the problem:

- AgentBench hosts the benchmark websites.
- The user's agent controls its own browser.
- The website and platform report observed behavior and server-side state.
- Scoring is based on controlled benchmark state, not browser execution ownership.

This preserves much of the benchmark value while avoiding server-side browser fan-out.

## Non-goals

This model is not a drop-in replacement for canonical WebArena evaluation.

It does not guarantee:

- identical scores to WebArena papers or leaderboards
- full trajectory compatibility with WebArena's Python harness
- server-owned browser isolation
- complete visibility into browser-native UI, extensions, downloads, or cross-origin frames

When exact WebArena comparability matters, AgentBench should use a dedicated WebArena provider with the original environment and evaluator.

## High-level Architecture

```text
External Agent Browser
  |
  | opens task start URL with run/session token
  v
Hosted Benchmark Site
  |
  | telemetry events, task signals, screenshots
  v
AgentBench Web API
  |
  | run_events, artifacts, score updates
  v
Live Viewer and Scorer
```

The platform owns the benchmark site and task state. The agent owns browser execution.

## Run, Attempt, Session

Hosted-web benchmarks should support both single-site tasks and multi-site suites.

The long-term hierarchy is:

```text
benchmark_runs
  user-facing execution record

benchmark_attempts
  one concrete suite execution under a run

hosted_web_sessions
  one site/task session inside an attempt

hosted_web_results
  per-session score and final-state evidence

benchmark_attempt_scores
  aggregate score across all sessions in an attempt
```

This avoids tying `benchmark_runs` directly to a single hosted site. A run can later execute a suite such as:

```text
webarena-lite-v1
  01 shopping-lite / constrained checkout
  02 forum-lite / reply to thread
  03 repo-lite / create merge request
  04 wiki-lite / retrieve answer
```

Current single-site hosted runs create one implicit `benchmark_attempt` when Supabase service-role access is available. Local preview and mock-store runs can still leave `attempt_id` null so hosted-sites remains usable without a database-backed run row.

### Orchestrator URL

Multi-site hosted suites should eventually expose one agent-facing orchestrator URL:

```text
https://hosted.agentbench.dev/attempt/<attempt-token>
```

The orchestrator owns:

- ordered session list
- current task pointer
- next-task routing
- suite completion detection
- aggregate scoring trigger

Agents should not need to manually juggle several site URLs.

## Target Service Boundaries

The hosted-web architecture should eventually separate four responsibilities:

```text
apps/web
  run control plane
  auth and quota
  live viewer and replay
  public API

apps/hosted-sites
  benchmark websites
  task UI
  telemetry emission
  task-side state changes

hosted session service
  session allocation
  seed data
  token issuance
  lifecycle and expiry
  cleanup

scoring service
  evaluator execution
  backend_state checks
  ui_state checks
  final_response checks
  score aggregation
```

These do not need to be independent processes at first. The first implementation should keep deployment simple with `apps/web` and `apps/hosted-sites`, while keeping session and scoring code behind package boundaries that can later become services.

Recommended progression:

1. `apps/web + apps/hosted-sites`: session and scoring logic are modules.
2. Add persistent tables for hosted sessions, task state, events, and score results.
3. Extract `packages/scoring` for evaluator types and deterministic aggregation.
4. Extract `packages/hosted-sessions` for token, seed, lifecycle, and cleanup logic.
5. Split `session-service` and `scoring-service` only when multiple hosted sites, async scoring, LLM judges, or cleanup pressure justify it.

`apps/web` should own run lifecycle. `apps/hosted-sites` should own task UI and task-side state mutation. Scoring should read benchmark state and produce evaluator-level results. Session management should own setup and cleanup.

## Core Components

### Hosted Benchmark Site

A long-running public website that simulates a real application, such as:

- shopping
- forum
- email
- documents
- admin console
- CRM
- project tracker

The site must support session-scoped data so multiple runs can use the same deployment concurrently.

### Session Allocator

The web app creates a benchmark run and allocates a benchmark session.

The session binds:

- run id
- benchmark case id
- task template id
- seed data version
- initial account or tenant
- start URL
- scoring policy

The start URL should include an opaque session token, for example:

```text
https://shop.benchmark.example/tasks/start?session=<session-token>
```

The token should not expose raw database ids or secrets.

### Telemetry Script

Hosted benchmark sites should emit structured run events.

Initial event types:

```ts
type HostedWebTelemetryEvent =
  | { type: "page.load"; url: string; title: string }
  | { type: "navigation"; from: string; to: string }
  | { type: "click"; selector: string; text?: string; role?: string }
  | { type: "input"; selector: string; valuePreview: string }
  | { type: "submit"; selector: string }
  | { type: "task.signal"; name: string; payload: Record<string, unknown> };
```

Telemetry should be good enough for replay and debugging, but it should not be the primary scoring source.

### Scorer

Scoring should inspect server-side benchmark state whenever possible.

Examples:

- order was created with the required product and price constraints
- forum reply was posted under the correct thread
- draft email exists and no email was sent
- document was updated with required fields
- admin setting changed to the expected value

User actions are useful for observability, but state is the stronger success signal.

### Reset and Cleanup

Each run must have a deterministic initial state and a cleanup path.

Preferred model:

- one long-running site deployment
- one tenant or workspace per run session
- seeded rows tagged with `session_id`
- scorer reads only that session's state
- cleanup deletes or archives that session after completion

Avoid starting a full application stack per run unless isolation requirements force it.

## Session Isolation

The preferred isolation model is tenant-per-session.

Business tables should include a session or tenant key:

```sql
session_id uuid not null
```

Run setup:

1. create benchmark run
2. allocate session id
3. seed task-specific data for that session
4. return start URL and task goal
5. mark the run `waiting_for_agent`

Run completion:

1. scorer reads session-scoped state
2. scorer emits score and failure reasons
3. platform stores artifacts and final status
4. cleanup archives or deletes session data

This allows many runs to share the same hosted site while keeping benchmark state separate.

## Telemetry Policy

First implementation should avoid full DOM diffs and continuous video.

Recommended defaults:

- record page loads and navigations
- record click, input, submit, and task signal events
- capture screenshots only on important state transitions
- capture a final DOM snapshot on completion or failure
- use heartbeats every 5 to 10 seconds while active

Screenshot frequency can increase when a live viewer is actively watching the run.

Input values should be redacted or truncated by default. Store previews only when they are needed for replay or scoring, and avoid recording credentials or private tokens.

## Scoring Policy

The scoring hierarchy should be:

1. deterministic server-side state checks
2. deterministic DOM or page-state checks
3. LLM judge for free-form content quality
4. manual review for ambiguous cases

State-based scoring should be the default for production benchmark cases.

Example shopping scorer:

```text
Pass when:
- session has exactly one submitted order
- order contains the requested product category
- total price is below the task limit
- no disallowed product was added
```

Example email scorer:

```text
Pass when:
- session has one draft response
- draft includes required entities
- no message was sent
```

## Relationship to WebArena

Hosted web benchmarks can use WebArena as a task inspiration source, but they should be labeled separately unless they run the original WebArena environment and evaluator.

Recommended naming:

- `native`: current deterministic AgentBench mock cases
- `hosted-web`: public AgentBench-hosted benchmark sites with external browser execution
- `webarena`: canonical WebArena environment and evaluator integration

This distinction prevents users from confusing WebArena-like tasks with WebArena-comparable results.

## Fit With Current Repository

Current components map naturally to this model:

- `apps/web`: run creation, session allocation, telemetry ingestion, live viewer
- `apps/mock-sites`: can evolve into hosted benchmark sites
- `apps/runner`: remains useful for internal Playwright demos and future canonical providers
- `packages/protocol`: shared event and run schemas
- `packages/scoring`: future home for deterministic scorers

For the first version, `apps/mock-sites` can host one session-aware task while `apps/web` records telemetry and score events.

## Replacing Mock Sites

The long-term goal is for hosted web benchmarks to replace the current static `mock-sites` mode.

Today `apps/mock-sites` serves static HTML pages and the internal runner executes hard-coded Playwright scenarios against them. That is useful for demos, but it has three limits:

- benchmark state is mostly page-local rather than session-scoped server state
- success is simulated by the runner rather than evaluated from task state
- tasks cannot scale toward WebArena-like workflows without turning static pages into an application layer

The replacement should move AgentBench from static mock pages to session-aware hosted benchmark sites.

Target shape:

```text
apps/hosted-sites or evolved apps/mock-sites
  benchmark applications
  task templates
  session-scoped seed data
  telemetry script
  task signal API

apps/web
  run creation
  hosted session allocation
  telemetry ingestion
  scoring orchestration
  live viewer

packages/scoring
  deterministic evaluator definitions
  scorer implementations
  shared score result types
```

The internal Playwright runner can remain for regression and smoke tests, but it should no longer be the primary benchmark execution path.

## Thin Benchmark Apps

Hosted benchmark sites should not try to clone heavy products such as Magento, GitLab, Postmill, Kiwix, or OpenStreetMap.

The goal is to reproduce the task pressure, not the full application.

AgentBench should implement thin benchmark apps:

```text
task surface + session state + scorer
```

Not:

```text
complete product clone
```

Each app should implement only the pages, interactions, and persisted state needed by benchmark tasks.

### WebArena Site Mapping

| WebArena-style site | Avoid cloning | Implement instead |
| --- | --- | --- |
| Shopping | full catalog, inventory, promotion, payment, account system | product search, filters, cart, checkout, order state |
| Shopping admin | full commerce admin | product edit, order status, discount rule, setting toggle |
| GitLab | git storage, CI, permissions, full merge request engine | issue list, file browser, file editor, branch picker, merge request form |
| Forum | full community platform | thread list, post detail, reply, vote, moderation action |
| Wikipedia/Kiwix | full offline encyclopedia | small deterministic wiki corpus with links and citations |
| Map/OpenStreetMap | tile server, routing engine, geocoder | place search, place details, distance table, route result fixture |

This keeps the benchmark realistic enough for agents while keeping the implementation controllable.

### Recommended App Set

Initial hosted apps:

- `email-lite`: inbox, thread, draft, send, labels
- `shopping-lite`: product catalog, filters, cart, checkout
- `repo-lite`: issues, files, editor, merge requests
- `forum-lite`: threads, replies, votes, moderation
- `wiki-lite`: deterministic article corpus and search
- `admin-lite`: settings, product edits, order status
- `map-lite`: place search and route fixtures

The `lite` suffix is an implementation detail. User-facing labels should describe the task domain, not expose that the site is partial.

### Implementation Boundary

Create a separate app once the first session-aware PoC works:

```text
apps/hosted-sites
  src/
    server.ts
    apps/
      email/
      shopping/
      repo/
      forum/
      wiki/
      admin/
      map/
    tasks/
      definitions.ts
      seed.ts
    telemetry/
      client.ts
      server.ts
    scoring/
      evaluate.ts
```

The first PoC may evolve `apps/mock-sites`, but the replacement path should move to `apps/hosted-sites` so static demo pages and hosted benchmark apps do not share the same boundary.

### Shared App Requirements

Every hosted benchmark app should provide:

- session-scoped seed data
- deterministic start URL
- telemetry event emission
- task signal emission for important state changes
- server-side state that can be scored
- cleanup by session id

Hosted apps should avoid adding one relational table set per site. Use runtime state for mutable task data and persist only sanitized events and final result snapshots.

### Runtime State Models

Suggested runtime state domains:

```text
email-lite: threads, messages, drafts, sent messages
shopping-lite: products, carts, orders
repo-lite: projects, issues, files, merge requests, file changes
forum-lite: threads, posts, votes, moderation actions
wiki-lite: pages, search index
admin-lite: settings, audit log
map-lite: places, routes
```

These models may live in memory, Redis/KV, or a site-local store. The AgentBench control-plane database should not mirror every hosted app's business schema.

### First PoC Choice

Start with `shopping-lite` or `repo-lite`.

`shopping-lite` advantages:

- easy to explain in the UI
- clear backend-state scorer
- good coverage of search, filtering, cart, and checkout
- close to WebArena shopping tasks

`repo-lite` advantages:

- strong WebArena/GitLab flavor without running GitLab
- useful for code-agent workflows
- clear state validation through issues, file edits, and merge requests

Recommended first task:

```text
shopping-lite / constrained checkout
```

Reason:

- simpler state model
- fast to seed
- easy binary scoring
- good fit for live replay

Example success conditions:

```text
backend_state:
- submitted order exists for the session
- order contains exactly one charger product
- total price is less than or equal to 30
- order shipping method is standard
- no restricted product appears in the order

ui_state:
- final page shows order confirmation

final_response:
- agent reports submitted order id
```

### Build Order

1. Implement `shopping-lite` with session-scoped seed data.
2. Add hosted session allocation in `apps/web`.
3. Return hosted start URL from the run connect payload.
4. Emit telemetry from the hosted site into `run_events`.
5. Implement `backend_state` scorer for the checkout task.
6. Surface evaluator-level score details in run events.
7. Move app code into `apps/hosted-sites`.
8. Port the remaining static mock cases into thin apps.

## WebArena-Verified-style Evaluation Model

Hosted web benchmarks should use a WebArena-Verified-inspired scorer shape.

Each task can define success conditions across four evaluator families:

- `retrieve_value`: validates information the agent reports back
- `backend_state`: validates persisted application state
- `ui_state`: validates page-visible state
- `final_response`: validates the agent's final response format and content

These families are independent. A task may use only one, but production-grade tasks should prefer `backend_state` when possible.

Example task definition:

```ts
type HostedWebTaskDefinition = {
  id: string;
  slug: string;
  title: string;
  goal: string;
  app: "shopping" | "email" | "forum" | "docs" | "admin";
  startPath: string;
  seedVersion: string;
  maxSteps?: number;
  evaluators: HostedWebEvaluator[];
};

type HostedWebEvaluator =
  | RetrieveValueEvaluator
  | BackendStateEvaluator
  | UiStateEvaluator
  | FinalResponseEvaluator;
```

### `retrieve_value`

Use this when the task asks the agent to find or report information.

Example:

```ts
type RetrieveValueEvaluator = {
  type: "retrieve_value";
  key: string;
  source: "final_response" | "task_signal";
  match:
    | { mode: "exact"; value: string }
    | { mode: "must_include"; values: string[] }
    | { mode: "numeric"; op: "eq" | "lt" | "lte" | "gt" | "gte"; value: number }
    | { mode: "llm_fuzzy"; reference: string; rubric: string };
};
```

This maps to the original WebArena string matching family, but keeps the result structured.

### `backend_state`

Use this for task completion whenever the benchmark site owns the relevant state.

Example:

```ts
type BackendStateEvaluator = {
  type: "backend_state";
  entity: "order" | "draft" | "post" | "document" | "setting";
  query: Record<string, unknown>;
  assertions: Array<
    | { field: string; op: "exists" }
    | { field: string; op: "equals"; value: unknown }
    | { field: string; op: "contains"; value: string }
    | { field: string; op: "lte" | "gte" | "lt" | "gt"; value: number }
    | { field: string; op: "not_exists" }
  >;
};
```

This should be the default scoring source because it is deterministic and path-independent.

### `ui_state`

Use this when the visible UI state matters or when backend state is insufficient.

Example:

```ts
type UiStateEvaluator = {
  type: "ui_state";
  url?: { mode: "contains" | "exact"; value: string };
  selectors: Array<{
    selector: string;
    assertion:
      | { mode: "exists" }
      | { mode: "text_includes"; value: string }
      | { mode: "value_equals"; value: string };
  }>;
};
```

This should be used carefully because DOM selectors are more brittle than server-side state.

### `final_response`

Use this to validate the final agent message.

Example:

```ts
type FinalResponseEvaluator = {
  type: "final_response";
  schema?: Record<string, unknown>;
  requiredFields?: string[];
  assertions?: Array<
    | { field: string; op: "equals"; value: unknown }
    | { field: string; op: "must_include"; values: string[] }
    | { field: string; op: "llm_fuzzy"; reference: string; rubric: string }
  >;
};
```

For hosted web benchmarks, the final response should not be the only evidence of success unless the task is purely informational.

## Score Result Shape

Scorers should produce evaluator-level results, not only a single number.

```ts
type HostedWebScoreResult = {
  score: number;
  status: "passed" | "failed" | "error";
  summary: string;
  evaluators: Array<{
    type: "retrieve_value" | "backend_state" | "ui_state" | "final_response";
    name: string;
    score: number;
    status: "passed" | "failed" | "error";
    evidence?: Record<string, unknown>;
    errorMessage?: string;
  }>;
};
```

The aggregate score should initially be strict:

- all required evaluators pass: `1`
- any required evaluator fails: `0`
- optional evaluators can be recorded without changing pass/fail

Partial scoring can be added later, but strict binary scoring is easier to reason about while replacing the mock-site path.

## Migration Path From `mock-sites`

Migration should happen in stages.

### Stage 1: Session-aware Mock Site

Keep the existing app name but add session-aware behavior.

Deliverables:

- one hosted task with a `session_id`
- deterministic seed data
- telemetry script
- backend-state scorer
- start URL returned in run connect payload

Candidate task: email draft or shopping checkout.

### Stage 2: Hosted Provider Metadata

Add provider metadata to benchmark cases.

Deliverables:

- `provider = "hosted-web"` for new cases
- task metadata with suite/session shape, start path, app name, seed version, and evaluator list
- run connect payload includes `hostedWeb.attemptId`, ordered `sessions[]`, and an orchestrator URL placeholder
- existing MCP details become optional for hosted-web runs

### Stage 3: Scoring Package

Move scoring into a shared package.

Deliverables:

- `packages/scoring`
- evaluator result types
- backend state evaluator
- final response evaluator
- deterministic score aggregation

### Stage 4: Replace Static Pages

Turn current static mock workflows into hosted benchmark applications.

Mapping:

- `web-search` becomes a retrieval task with `retrieve_value` and `final_response`
- `invoice-download` becomes a document/accounting task with `backend_state` or artifact validation
- `email-draft` becomes an email app task with `backend_state` and `final_response`
- `safety-test` becomes a policy task with `backend_state`, `ui_state`, and forbidden-action checks

### Stage 5: Deprecate Internal Demo Runner as Primary Path

Keep internal Playwright execution for smoke tests and demos, but move normal benchmark runs to hosted-web external execution.

Deliverables:

- homepage defaults to hosted-web cases
- internal mode is hidden behind dev/demo controls
- runner no longer owns primary success scores for hosted-web cases
- live viewer reads telemetry and score events from the hosted-web flow

## Suggested Data Model Additions

The first persistent schema is intentionally scoped to hosted attempts, hosted sessions, lightweight hosted events, final score results, and aggregate attempt scores.

`benchmark_cases` additions:

```sql
provider text not null default 'native'
metadata jsonb not null default '{}'
```

Hosted session and event tables:

```sql
benchmark_attempts
hosted_web_sessions
hosted_web_events
hosted_web_results
benchmark_attempt_scores
hosted_web_access_logs
```

`hosted_web_results.final_state` stores app-specific final snapshots as JSON evidence, for example the submitted order for `shopping-lite` or the merge request for `repo-lite`.

The session token should be hashed at rest because it grants access to task state and telemetry submission. Hosted runtime writes should use the service role from server-side code. Authenticated users should only be able to read hosted session, event, and result rows linked to their own benchmark runs.

Current migration:

- `supabase/migrations/20260529000006_hosted_web_cases.sql`
- `supabase/migrations/20260529000007_hosted_web_persistence.sql`
- `supabase/migrations/20260529000008_benchmark_attempts.sql`

`attempt_id` is nullable on hosted session/event/result rows for the first transition. The web app now creates an implicit attempt for hosted-web runs when possible, passes it to hosted-sites, and hosted-sites writes session, event, result, and `benchmark_attempt_scores` rows against that attempt. Once every hosted run is database-backed, `attempt_id` can become required.

## API Shape

Initial endpoints:

```text
POST /api/runs
POST /api/hosted-web/sessions
POST /api/hosted-web/telemetry
POST /api/hosted-web/score
POST /api/hosted-web/complete
```

The telemetry endpoint should authenticate by session token and write normalized `run_events`.

The scoring endpoint should be callable by a trusted scorer service or server-side job, not by arbitrary browser code.

## MVP Implementation Plan

1. Add `hosted-web` as a benchmark provider concept.
2. Add one session-aware hosted benchmark case, preferably shopping or email.
3. Allocate a session when the run is created.
4. Return a start URL in the connect payload.
5. Add a telemetry endpoint that records observed DOM events as `run_events`.
6. Add a deterministic scorer that reads session-scoped server state.
7. Show telemetry events in the existing live run viewer.
8. Add cleanup for completed or expired sessions.

## Current Progress

Implemented in the current migration track:

- hosted benchmark metadata now supports suite-style `sessions[]` definitions with `app`, `taskSlug`, `sequenceIndex`, `weight`, and `required`
- web-side orchestration creates one hosted `benchmark_attempt` plus an ordered list of hosted sessions per run
- connect payload is now attempt-scoped instead of single-session scoped
- hosted-sites session creation accepts suite/session metadata and persists `app`, `sequence_index`, `goal`, and `title`
- attempt aggregation now reads all hosted results for the attempt and writes a weighted required-session breakdown
- `wiki-lite` is now available as a second real hosted app alongside `shopping-lite`
- hosted-sites now exposes an attempt overview page and a minimal `GET /api/attempts/:attemptId/advance` helper
- attempt progress is now persisted in `benchmark_attempts.metadata` with `activeSessionId`, `activeSequenceIndex`, and `completedSessionIds`
- web connect payload now rebuilds hosted suite state from `benchmark_attempts + hosted_web_sessions` instead of relying on in-memory allocation only

Latest local smoke:

- created one local attempt with `shopping-lite` session `0` and `wiki-lite` session `1`
- completed shopping checkout and verified `advance` returned the wiki session URL instead of closing the suite
- opened wiki release-history content, submitted `June 1, 2026`, and verified `wiki-lite` score `= 1`
- DB-backed external-agent run `065fac39-7c5b-438e-ba2a-2a7c6d5546d9` completed with:
  - `benchmark_runs.status = completed`, `score = 1`
  - one `benchmark_attempt` with `status = completed`, `aggregate_score = 1`
  - two `hosted_web_sessions` with sequence `0/1`, both `completed`
  - two `hosted_web_results` (`shopping-lite`, `wiki-lite`) with `score = 1`
  - one `benchmark_attempt_scores` row with `aggregation = weighted-required-suite`
- reconnect smoke on run `d21ec807-c135-42e0-abff-c13fe471fd36` showed:
  - after session `0` completed, `benchmark_attempts.metadata.activeSessionId` advanced to the wiki session
  - a fresh `GET /api/runs/:runId/connect` returned the wiki session as `activeSessionId`
  - connect payload progress changed from `0 / 2` to `1 / 2`
- hosted-sites restart smoke on run `38a7e188-c0e9-41ce-b286-dcbef55f89bc` showed:
  - shopping cart state was persisted into `hosted_web_sessions.metadata.appState`
  - after restarting hosted-sites, `/shopping/cart?session=...` still showed the saved cart row and total
  - `/attempts/:attemptId` and `/api/attempts/:attemptId/advance` both recovered sibling sessions from the database
- idempotency / transition smoke on run `c6a6f5c7-f80e-4492-ae07-f9c86e387553` showed:
  - completing shopping once promoted wiki session `1` from `created` to `active`
  - `advance` called with the first session token returned the wiki session URL from persisted attempt state
  - repeating `POST /api/sessions/:token/complete` for the already completed shopping session did not insert a second `hosted_web_results` row
- access / expiry smoke on run `38f8f98f-8ebe-4b6f-9a7d-864a5fa21273` showed:
  - two hosted page requests incremented `hosted_web_sessions.access_count` and recorded `first_seen_*`, `last_seen_*`, and `last_accessed_at`
  - `hosted_web_access_logs` wrote one `session.access` row per request with IP and user-agent metadata
  - forcing `expires_at` into the past caused the next hosted request to return `400 {"error":"Missing or invalid session"}`
  - the same request marked the session row as `expired` and inserted a `session.expired_rejected` access-log row
- cleanup sweeper smoke on runs `9f6f04fa-6b81-4e33-ba05-05f7a1f1d253` and `31b86c0d-0665-40cd-a016-f9b6bba82d33` showed:
  - with `HOSTED_SESSION_SWEEP_INTERVAL_MS=1000`, one `session.access` row was automatically pruned after aging past the configured retention window
  - forcing a second session's `expires_at` into the past caused the background sweep to mark the row `expired` without waiting for another request
  - the sweep wrote a `session.expired_swept` access-log row and removed the expired session from in-memory runtime
- timeout policy smoke on run `70fc317d-2c83-4799-b45c-5ac5dd67444b` showed:
  - expiring the active shopping session caused the sweeper to mark the entire hosted attempt `timeout`
  - sibling hosted sessions were also moved to `expired` so the suite could not be resumed from a stale second session
  - `benchmark_runs.status` moved to `timeout`, `score = 0`, and `error_message` was filled from the hosted timeout summary
  - `benchmark_attempt_scores` received a timeout-shaped `error` row with `aggregation = "timeout"`
  - a fresh `GET /api/runs/:runId/connect` returned `activeSessionId = null` and no orchestrator URL, instead of falling back to session `0`
- lifecycle extraction progress:
  - attempt transition logic is now extracted into `apps/hosted-orchestrator/src/attempt-lifecycle.ts`
  - attempt read projection is now shared in `packages/shared/src/index.ts`
  - `apps/web` and `apps/hosted-orchestrator` both consume the same hosted attempt read model builder
  - `apps/hosted-orchestrator/src/attempt-handlers.ts` now acts as an internal handler layer over lifecycle commands
  - hosted-orchestrator exposes the protected internal attempt APIs:
    - `POST /api/attempts/init`
    - `GET /api/attempts/:attemptId/state`
    - `POST /api/attempts/:attemptId/commands/resolve-advance`
    - `POST /api/attempts/:attemptId/commands/complete-session`
    - `POST /api/attempts/:attemptId/commands/timeout`
  - `apps/web/lib/hosted-web.ts` now prefers orchestrator-owned state and initialization:
    - new attempts are initialized through hosted-orchestrator instead of web inserting `benchmark_attempts` directly
    - existing attempts are read from hosted-orchestrator `state` first, with Supabase fallback kept only as a recovery path
  - this is now a physically split control-plane service, with `hosted-sites` reduced to task runtime and telemetry

Current limitations:

- the attempt overview is still a lightweight helper page, not a stateful orchestrator UI
- UI only shows basic suite progress and active session context
- lifecycle is now a dedicated deployable service, but not yet a queue-backed command processor
- wiki article-view proof still depends on hosted telemetry rather than a persisted server-side read model
- there is no external scheduler yet; cleanup currently runs inside the hosted-orchestrator process with interval-based best-effort semantics

## Physical Split Checklist

Before moving orchestrator into a separate deployable service, the remaining work should follow this order:

1. API parity
- standard orchestrator APIs should cover:
  - `POST /api/attempts/init`
  - `GET /api/attempts/:attemptId/state`
  - `POST /api/attempts/:attemptId/commands/resolve-advance`
  - `POST /api/attempts/:attemptId/commands/complete-session`
  - `POST /api/attempts/:attemptId/commands/timeout`
- public helper routes such as `/api/attempts/:attemptId/advance` can remain as agent-facing compatibility wrappers

2. Ownership cleanup
- `apps/web` should treat orchestrator as the authoritative attempt owner for both read and write paths
- legacy direct session creation via `POST /api/sessions` should be downgraded to fallback-only
- timeout and cleanup paths should go through command handlers instead of touching lifecycle internals directly

3. Runtime separation
- hosted task rendering should remain in hosted-sites
- attempt lifecycle, timeout propagation, and cleanup sweep should become orchestrator-owned processes
- the eventual split target is:
  - hosted-sites: task app/runtime
  - hosted-orchestrator: attempt state, commands, cleanup, completion callbacks

4. Operational readiness
- add dedicated health/readiness for orchestrator APIs
- add integration smoke for `init -> state -> complete-session -> resolve-advance -> timeout`
- confirm service-to-service auth boundary only depends on `RUNNER_SHARED_SECRET`

Current status:

- a new deployable `apps/hosted-orchestrator` now owns:
  - attempt init
  - attempt state
  - resolve-advance
  - complete-session
  - timeout
  - cleanup sweep
- `init` and `state` are already exposed as protected internal APIs
- `resolve-advance`, `complete-session`, and `timeout` now also have explicit internal command routes
- cleanup timeout propagation now goes through the same handler/command layer instead of calling lifecycle internals directly
- `apps/web` now exposes matching orchestrator client helpers for:
  - `state`
  - `resolve-advance`
  - `complete-session`
  - `timeout`
- DB-backed hosted runs now treat orchestrator init/read as authoritative; legacy direct session creation is only kept for local non-DB fallback
- `POST /api/sessions` still exists, but only as a legacy fallback path for non-orchestrated/local flows
- `apps/hosted-sites` now treats `HOSTED_ORCHESTRATOR_URL` as required for attempt control-plane actions
- hosted-sites no longer exposes internal attempt init/state/command APIs; only the orchestrator owns those routes
- attempt lifecycle source files now live under `apps/hosted-orchestrator/src`, not `apps/hosted-sites/src`

Smoke coverage:

- `apps/hosted-sites/scripts/orchestrator-smoke.sh` now exercises the internal orchestrator API sequence end-to-end:
  - `init`
  - `state`
  - `resolve-advance`
  - `complete-session`
  - `timeout`
  - the split-mode smoke now boots both `hosted-sites` and `hosted-orchestrator`

Hosted-sites runtime refactor status:

- `apps/hosted-sites/src/server.ts` has been reduced from a single large mixed file into a top-level HTTP entrypoint plus extracted modules for:
  - `runtime/session-store.ts`
  - `runtime/http.ts`
  - `runtime/telemetry.ts`
  - `runtime/orchestrator-client.ts`
  - `routes/api.ts`
  - `routes/attempts.ts`
  - `routes/shopping.ts`
  - `routes/wiki.ts`
- app-specific HTML rendering has moved into:
  - `apps/shopping-lite/render.ts`
  - `apps/wiki-lite/render.ts`
- app-specific mutations and scoring have also moved into app directories:
  - `apps/shopping-lite/actions.ts`
  - `apps/shopping-lite/evaluate.ts`
  - `apps/shopping-lite/seed.ts`
  - `apps/shopping-lite/final-state.ts`
  - `apps/wiki-lite/actions.ts`
  - `apps/wiki-lite/evaluate.ts`
  - `apps/wiki-lite/seed.ts`
  - `apps/wiki-lite/final-state.ts`
- top-level `evaluation.ts` now only dispatches to app-level evaluators instead of owning shopping/wiki task logic directly
- app-level seed data, default goals/start paths, and final-state shaping are now composed through `runtime/app-registry.ts`
- `runtime/app-registry.ts` now exposes a real app-registry boundary:
  - app definitions
  - default start paths
  - default goals
  - initial session state builders
  - final-state builders
- route dispatch is now composed through `routes/index.ts` instead of hard-coded top-level branching in `server.ts`
- hosted runtime types are now split by boundary instead of a single shared file:
  - `runtime/types.ts`
  - `apps/shopping-lite/types.ts`
  - `apps/wiki-lite/types.ts`
- this leaves `server.ts` primarily responsible for top-level route dispatch, telemetry/session APIs, scoring endpoints, and completion wiring

## Operational Guidance

Start with low telemetry volume.

Recommended defaults:

- no continuous server-side browser
- no continuous video
- no full DOM diff stream
- action-level telemetry only
- screenshot on navigation, task signal, completion, and failure
- session cleanup after a fixed retention period

Relevant hosted-sites cleanup knobs:

- `HOSTED_SESSION_SWEEP_INTERVAL_MS`
- `HOSTED_SESSION_TERMINAL_RETENTION_MS`
- `HOSTED_ACCESS_LOG_RETENTION_MS`

This makes hosted web benchmarks closer to normal web application hosting than browser cloud infrastructure.

## Open Questions

- Should hosted benchmark sites live inside `apps/mock-sites` or become a separate `apps/hosted-sites` app?
- Should telemetry be sent directly to `apps/web`, or through the runner gateway for deployment consistency?
- Which scorer package boundary should own benchmark-specific business logic?
- How much raw DOM should be retained for replay without creating privacy or storage problems?
- Should live screenshots be captured by the agent browser, the benchmark site, or an optional server-side observer?
