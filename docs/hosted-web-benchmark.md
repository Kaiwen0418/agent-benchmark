# Hosted Web Benchmarks

## Execution Model

AgentBench hosts deterministic benchmark websites. The evaluated agent opens an opaque session URL using its own browser and interacts with normal HTML forms and links. AgentBench does not launch or control the agent's browser.

The platform observes server-side task state and explicit telemetry, then evaluates controlled state rather than trusting the agent's final claim.

## Suite Structure

```text
benchmark run
  benchmark attempt
    ordered hosted session 0
    ordered hosted session 1
    ...
    aggregate attempt score
```

The published testcase catalog defines the current app list and ordered sessions. See the single authoritative [current testcase table](./hosted-site-app-authoring.md#current-hosted-testcases). Each session defines app, task and seed versions, order, weight, required flag, goal, and start path.

## Suites & Difficulty

There can be more than one published suite (today: `hosted-web-suite` and `hosted-web-hard-suite`). They are treated uniformly — difficulty is a tag, not a code path.

- **Boundary.** Each suite is one row in `public.benchmark_cases` with its own `id`, `slug`, `title`, and immutable published `revision`. Suites are independent catalog entries, not modes of a single entry, so their sessions, versions, and scores evolve separately.
- **Shared components.** Suites reuse the same hosted apps (definitions, evaluators, render/actions under `apps/hosted-sites/src/apps/*` and `packages/test-cases/src/apps/*`), the same release/publish/seed machinery (the single `hostedWebSuites` registry in [packages/test-cases/src/suites/registry.ts](../packages/test-cases/src/suites/registry.ts), consumed by `release.ts`, `scripts/publish.ts`, and `seed-sql.ts`), and the same run flow (`POST /api/runs` → `getBenchmarkCase` → hosted connect). Neither the backend tooling nor the frontend branches on which suite was chosen.
- **Difficulty dimension.** The `difficulty` column tags each row (`"easy"` / `"hard"`). Easy sessions draw from each app's `default` variant pools; hard sessions draw from `hard` variant pools and additionally declare cross-app `consistencyChecks` in the suite manifest. Adding a suite means creating a suite source file and appending one entry to `hostedWebSuites` — the row's `difficulty` is all that distinguishes it. The frontend picker is populated dynamically from the public catalog (`GET /api/benchmark-cases`), so new suites appear without code changes.

## Session Isolation

- Every task URL contains an opaque token.
- Mutable state belongs to one session and one app.
- Redis stores active state shared by all hosted-sites replicas.
- Supabase stores a durable app-state snapshot and lifecycle records.
- App route guards reject tokens belonging to another app.

## Evaluation

Each app definition provides:

- deterministic initial state
- persisted-state validation and hydration
- route handlers and state mutations
- final-state projection
- evaluator returning `passed`, `failed`, or `error`, score, summary, and evidence

Suite aggregation is weighted. A failed required session prevents a passing aggregate result.

## Telemetry

Telemetry supports observability and debugging:

- page loads and navigation
- explicit task actions
- task signals
- scoring and lifecycle events

Telemetry is not the primary success source. Evaluators should prefer server-side app state.

## Adding an App

An app must define its own typed state, seed data, validators, actions, rendering, routes, final-state projection, and evaluators. It must also register through the app registry and include tests for state isolation, hydration, actions, and scoring.

See [Hosted Site App Authoring](./hosted-site-app-authoring.md) for implementation guidance.

## Non-Goals

- canonical WebArena score compatibility
- server-owned browser execution
- arbitrary public internet tasks
- scoring based only on screenshots or free-form final answers
- sharing mutable state between benchmark sessions
