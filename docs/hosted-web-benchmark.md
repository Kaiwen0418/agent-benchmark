# Hosted Web Benchmarks

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

## Suggested Data Model Additions

Keep the first version small.

Potential `benchmark_cases` additions:

```sql
provider text not null default 'native'
metadata jsonb not null default '{}'
```

Potential hosted session table:

```sql
create table hosted_web_sessions (
  id uuid primary key,
  run_id uuid not null references benchmark_runs (id) on delete cascade,
  case_id uuid not null references benchmark_cases (id),
  provider text not null,
  start_url text not null,
  session_token_hash text not null,
  seed_version text not null,
  status text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
```

The session token should be hashed at rest if it grants write access to telemetry or task state.

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

## Operational Guidance

Start with low telemetry volume.

Recommended defaults:

- no continuous server-side browser
- no continuous video
- no full DOM diff stream
- action-level telemetry only
- screenshot on navigation, task signal, completion, and failure
- session cleanup after a fixed retention period

This makes hosted web benchmarks closer to normal web application hosting than browser cloud infrastructure.

## Open Questions

- Should hosted benchmark sites live inside `apps/mock-sites` or become a separate `apps/hosted-sites` app?
- Should telemetry be sent directly to `apps/web`, or through the runner gateway for deployment consistency?
- Which scorer package boundary should own benchmark-specific business logic?
- How much raw DOM should be retained for replay without creating privacy or storage problems?
- Should live screenshots be captured by the agent browser, the benchmark site, or an optional server-side observer?
