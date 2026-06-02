# AgentBench Agent Guidelines

## Stack

- TypeScript
- Next.js App Router
- Supabase
- PostgreSQL
- Docker
- pnpm workspace
- Turborepo
- Caddy gateway
- hosted-web benchmark apps

## Principles

### 1. Security First

Never expose host-level access to evaluated agents.

Normal hosted-web runs should not start server-side browsers. The evaluated agent controls its own browser and visits AgentBench-hosted task sites.

Server-side code should only provide:

- hosted task surfaces
- attempt/session lifecycle
- telemetry ingestion
- deterministic scoring
- artifact storage

### 2. Hosted-Web Service Boundaries

The production path is the hosted-web stack:

- `apps/web`: cloud control plane, run creation, connect payloads, user-facing UI.
- `apps/hosted-sites`: session-scoped benchmark apps, task rendering, app-side state mutation, telemetry, app-level evaluation.
- `apps/hosted-orchestrator`: attempt initialization, attempt read model, suite advancement, aggregation, timeout, cleanup.
- `packages/scoring`: evaluator result schema and deterministic score aggregation.
- `packages/shared`: cross-service read models and shared helpers.

Do not reintroduce runner/MCP as the primary hosted-web path. Legacy runner concepts should only be used for internal demos or explicit compatibility work.

Communication between services must happen through:

- typed protocol
- authenticated API
- event streams
- persisted score/result rows

### 3. Shared Types

Cross-service benchmark metadata belongs in `packages/protocol`.

Scoring result contracts belong in `packages/scoring`.

Attempt read models and shared service projections belong in `packages/shared`.

Do not duplicate schemas between web, hosted-sites, hosted-orchestrator, and scoring. Use `zod` whenever possible.

### 4. Benchmark Cases

Benchmark definitions belong in `packages/test-cases`.

Cases should be:

- deterministic
- replayable
- versioned
- explicit about provider, suite, session order, weights, and required sessions

### 5. Hosted App Design

Hosted-site apps should be lightweight WebArena-style applications, not full clones of Magento, GitLab, forums, Kiwix, or OpenStreetMap.

Each app should keep its code under:

```text
apps/hosted-sites/src/apps/<app-slug>/
  types.ts
  seed.ts
  actions.ts
  render.ts
  evaluate.ts
  final-state.ts
```

Routes belong under `apps/hosted-sites/src/routes/`.

App authoring rules:

- keep mutable state session-scoped
- keep HTTP parsing in routes
- keep business mutation in `actions.ts`
- keep HTML rendering in `render.ts`
- keep scoring in `evaluate.ts`
- keep final evidence compact in `final-state.ts`
- register new apps in `runtime/app-registry.ts`
- avoid one database table set per hosted app

Detailed guidance is in `docs/hosted-site-app-authoring.zh-CN.md`.

### 6. Scoring Principles

Hosted-web scoring uses WebArena-Verified-style evaluator families:

- `retrieve_value`
- `backend_state`
- `ui_state`
- `final_response`

Prefer `backend_state` whenever the app owns the relevant state. Use `ui_state` as auxiliary evidence, and avoid making `final_response` the only success signal unless the task is purely informational.

Scorers should return evaluator-level breakdowns through `packages/scoring`, not only a single number.

### 7. Frontend Principles

The UI should emphasize:

- live execution
- observability
- replayability
- clarity

The product should feel closer to:

- AI DevTools
- AI Arena
- Agent Observatory

Not a traditional admin dashboard.

For visual replay, hosted-sites can emit DOM/task telemetry, but real screenshots or videos must be uploaded by the user's agent/browser runtime. A hosted site cannot reliably capture the agent's browser pixels because of browser security boundaries.

### 8. Infrastructure

Prefer:

- Docker Compose
- simple deployments
- self-hosted compatibility

Avoid:

- Kubernetes
- heavy cloud dependencies

during the MVP stage.

The hosted server deploy uses `apps/hosted-sites`, `apps/hosted-orchestrator`, and a Caddy `gateway`. Caddyfile changes require gateway reload or recreation; the deploy workflow should recreate gateway after `docker compose up -d`.

### 9. Observability

Every benchmark run should record:

- tool calls
- screenshots
- traces
- timestamps
- errors
- artifacts

Replayability is a core feature, not a nice-to-have.

For hosted-web, telemetry should be lightweight and generic:

- `hosted_web_events` for page/action/task-signal events
- `hosted_web_results` for final score and evidence
- `benchmark_attempt_scores` for suite aggregation
- artifact storage for screenshots, traces, and videos when uploaded by the agent/runtime

## Coding Conventions For Agents

- keep shared contracts in `packages/protocol`
- keep score contracts in `packages/scoring`
- keep attempt read models in `packages/shared`
- keep benchmark logic out of the UI layer
- treat hosted task sessions and tokens as privileged boundaries
- prefer deterministic hosted app fixtures over live third-party integrations
- design every run so it can be debugged after the fact
- do not add hosted app-specific database tables unless there is a clear persistence requirement that cannot fit session snapshots or final result evidence
- do not make hosted-sites responsible for attempt lifecycle; use hosted-orchestrator for attempt init/state/commands
