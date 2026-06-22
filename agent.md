# AgentBench Agent Guidelines

## Stack

- TypeScript
- Next.js App Router
- Supabase
- PostgreSQL
- Docker
- pnpm workspace
- Turborepo
- Nginx gateway
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

Detailed guidance is in `docs/hosted-site-app-authoring.md`.

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

The hosted server deploy uses `apps/hosted-sites`, `apps/hosted-orchestrator`, and an Nginx `gateway`. Nginx config changes require gateway reload or recreation; the deploy workflow should recreate gateway after `docker compose up -d`.

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

## Documentation Policy

- `docs/roadmap.md` is the only roadmap. It contains milestone priority, status, sequencing, and exit criteria, but not step-by-step implementation plans.
- Topic documents under `docs/` contain durable architecture decisions, behavioral contracts, testing principles, and operational guidance that remain useful after an issue closes.
- GitHub Issues contain executable implementation details: task breakdowns, acceptance checklists, dependencies, ownership, and progress. Split independently deliverable milestones into separate issues and link the relevant roadmap milestone and topic document.
- Pull requests contain the actual implementation, verification evidence, compatibility or deployment impact, and links that close or advance the corresponding issue.
- Do not create additional roadmap or TODO documents. Do not leave durable design contracts only in GitHub Issues, because closed issues are not the canonical documentation surface.
- Repository documentation is canonical in English. Do not create or maintain translated copies under `docs/` or app directories.
- The only maintained translated document is the root `README.zh-CN.md`; its documentation links point to canonical English files.
- Before a pull request, review `docs/roadmap.md` and update affected milestone status or scope. Do not mark a milestone complete until implementation and required verification both pass.

## Preview Environment Network Smoke Test

Run this smoke test after changes to hosted-web lifecycle, telemetry, live viewing, quota, deployment configuration, or cross-service URLs. Use the test environment only. A full smoke creates and mutates test run data and consumes one guest run.

Default endpoints:

```text
Web: https://test-agent-benchmark-web.vercel.app/
Hosted sites: https://hosted-test.project-echo.xyz/
```

Do not run the mutation steps against production unless the user explicitly requests it. Never print complete session tokens, cookies, service-role keys, or runner secrets in reports.

### Browser Flow

1. Open the preview Web URL in the in-app browser and wait for quota loading to finish.
2. Confirm the Hosted Web Suite is available, the start button becomes enabled, and the browser console has no errors.
3. Start one run. Record the run ID and attempt ID from the API response or connection payload before navigating away.
4. Confirm quota decrements exactly once and the connection guide shows four ordered sessions with only session 1 active.
5. Keep the Web preview open and open the hosted agent URL in a second tab. Do not replace the preview tab when live-view behavior is under test.
6. Confirm the hosted attempt overview loads through the public HTTPS hostname and contains the expected session order.
7. Complete each hosted task using its generated task text rather than hard-coded fixture assumptions. Verify each evaluator preview or score endpoint returns `score: 1`.
8. After each completed session, call the attempt advance endpoint and verify:
   - `nextSessionId` matches the next ordered session.
   - `nextStartUrl` uses the public HTTPS hosted hostname.
   - `nextStartUrl` never exposes Docker names such as `hosted-sites`, localhost, or private ports.
9. After the final session, verify advance returns `complete: true`, `nextSessionId: null`, and `nextStartUrl: null`.

### Live Viewer Checks

While the hosted task is open in the second tab:

1. Observe the embedded playground viewer in the Web tab. The internal `?embed=1` route is not a standalone user page.
2. Confirm a read-only hosted iframe appears after the first hosted page-load event.
3. Navigate and mutate state from the agent tab. Confirm the iframe follows major page changes and refreshes after task signals.
4. Keep the run active for more than 30 seconds, trigger another hosted event, and confirm updates continue after the SSE connection rotates or reconnects.
5. Confirm the iframe uses a viewer-scoped URL, does not expose the write token, allows scrolling, and prevents links/forms from mutating or independently navigating the session.
6. Confirm task, score, and latest-event overlays update without browser console errors.

### Service And API Checks

Check public service health and lifecycle responses without exposing credentials:

```bash
curl -fsS https://hosted-test.project-echo.xyz/health
curl -fsS 'https://hosted-test.project-echo.xyz/api/sessions/<redacted-token>/score'
curl -fsS 'https://hosted-test.project-echo.xyz/api/attempts/<attempt-id>/advance?session=<redacted-token>'
```

Verify response URLs are externally reachable. Internal service URLs may be used for server-to-server calls, but must not appear in browser-facing `startUrl`, `nextStartUrl`, viewer URLs, redirects, or connection instructions.

### Result Reporting

Report each area separately:

- Web startup and quota
- attempt/session initialization
- all hosted task scores
- session advancement and public URL correctness
- telemetry and live viewer behavior
- SSE behavior after 30 seconds
- console/network errors

Classify any private/internal URL returned to the browser as a blocking issue. If live viewer verification cannot be completed, state exactly why; successful hosted scoring alone is not evidence that the viewer works.

## Pull Request Documentation Check

Before creating or updating a pull request:

1. Read `docs/roadmap.md`, the repository's only milestone-status source, plus topic documents affected by the change.
2. Determine whether the change affects documented scope, milestone status, verification status, follow-up work, or release sequencing.
3. Update `docs/roadmap.md` when milestone scope or status changes. Keep implementation details and test contracts in the relevant topic document without duplicating roadmap status. If no update is needed, explicitly confirm that the roadmap was reviewed.

Do not mark roadmap work complete until the implementation and its required verification are complete.

## Git Commit Convention

All commit subjects must follow Conventional Commits:

```text
<type>(optional-scope): <imperative summary>
```

Allowed primary types:

- `feat`: new user-visible capability or meaningful platform behavior
- `fix`: bug fix
- `refactor`: internal restructuring without intended behavior change
- `test`: test-only changes
- `docs`: documentation-only changes
- `ci`: CI/CD workflow changes
- `chore`: maintenance that does not fit the types above

Use lowercase type names, include `: ` after the type or scope, and keep the summary concise. Breaking changes may use `!`, for example `feat!: replace runner execution with hosted-web sessions`.

Examples:

- `feat: scale hosted orchestration with Redis streams`
- `feat(hosted-sites): add forum moderation variants`
- `fix(web): preserve attempt progress after reconnect`
- `ci: add coverage-gated pre-push verification`

Do not use untyped subjects such as `update deployment` or `scale hosted orchestration with Redis streams`.

## Branch Convention

The long-lived branches are:

- `main`: production branch; only release and emergency hotfix changes may merge here
- `develop`: integration branch for the test environment and the base branch for normal development

Create short-lived branches from the latest `develop`. Include an issue ID only when a real issue exists:

```text
feature/<issue-id>-<short-description>
fix/<issue-id>-<short-description>
chore/<issue-id>-<short-description>
feature/<short-description>
fix/<short-description>
chore/<short-description>
```

Examples:

- `feature/123-hosted-run-replay`
- `fix/156-session-timeout`
- `chore/178-upgrade-nextjs`

Branch names must be lowercase, use hyphens, include an issue ID when one exists, and keep the description concise. Do not insert a synthetic `no-issue` segment when there is no issue; use a direct descriptive name such as `feature/hosted-viewer-session`.

Development workflow:

1. Update `develop` and create the branch from it.
2. Keep each branch and pull request focused on one issue or cohesive change.
3. Open the pull request against `develop`; feature branches must not merge directly into `main`.
4. Require CI and review to pass before using squash merge.
5. Delete the short-lived branch after merge.
6. Release through a pull request from `develop` to `main`.

Emergency production fixes use `hotfix/<issue-id>-<short-description>`, branch from `main`, and must be merged back into both `main` and `develop`.

## Merge Strategy

Choose the merge method based on whether the intermediate commit history has lasting value, not only on line count.

### Short-Lived Feature And Fix Branches

Use squash merge by default for `feature/*`, `fix/*`, and `chore/*` branches:

- one issue or cohesive change becomes one Conventional Commit on `develop`
- merge only after CI and review pass
- delete the local and remote branch after merge
- do not expect the original branch commits to appear as ancestors of `develop`; squash merge creates a new equivalent commit

### Large Or Long-Running Features

Use an `epic/<issue-id>-<short-description>` branch when the work spans multiple independently meaningful modules or stages. Branch the epic from `develop`, then branch focused `feature/*` or `fix/*` work from the epic.

```text
develop
└── epic/<issue-id>-<description>
    ├── feature/<issue-id>-<stage-one>
    ├── feature/<issue-id>-<stage-two>
    └── fix/<issue-id>-<integration-fix>
```

- squash child branches into the epic branch
- keep the epic branch commits reviewable, buildable, and independently meaningful
- merge the completed epic into `develop` with a merge commit to preserve its main development stages
- delete the epic and child branches after merge

Prefer an epic merge commit when at least two of these apply:

- development lasts more than one week
- multiple contributors work on it
- it spans multiple independent modules
- stages may need to be reverted independently
- the branch commits have been intentionally curated and provide useful architectural history

### Releases And Hotfixes

- merge `develop` into `main` with a merge commit so each production release has an explicit boundary
- do not squash the entire release history into one commit
- create emergency `hotfix/*` branches from `main`
- merge the hotfix into `main`, then merge or cherry-pick the same fix into `develop` immediately
- use cherry-pick only for targeted synchronization or emergency fixes, not as the normal feature integration method
