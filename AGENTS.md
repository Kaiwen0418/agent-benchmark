# AgentBench Agent Instructions

These instructions are mandatory for coding agents working in this repository.
Use linked documents for details instead of duplicating them here.

## Architecture

- `apps/web` owns run creation, connection UI, and user-facing control-plane
  behavior.
- `apps/hosted-sites` owns session-scoped benchmark apps, task state,
  telemetry, and app evaluation.
- `apps/hosted-orchestrator` owns attempt initialization, commands, suite
  advancement, aggregation, timeout, and cleanup.
- Keep cross-service contracts in `packages/protocol`, scoring contracts in
  `packages/scoring`, shared projections in `packages/shared`, and benchmark
  definitions in `packages/test-cases`.
- Do not reintroduce runner/MCP as the primary hosted-web path.
- Keep hosted-sites out of attempt lifecycle ownership. Services communicate
  through typed authenticated APIs, persisted results, and event streams.

Read [Architecture](./docs/architecture.md), [Data Ownership](./docs/data-ownership.md),
and [Data Flow](./docs/data-flow.md) before changing service boundaries.

## Implementation

- Keep benchmark cases deterministic, replayable, and versioned.
- Keep hosted task state session-scoped and evaluator evidence compact.
- Prefer `backend_state` scoring; use `ui_state` as supporting evidence.
- Do not expose evaluator answers, private task configuration, write tokens,
  internal Docker hosts, or privileged metadata to browsers.
- Do not add app-specific database tables unless session snapshots and result
  evidence cannot represent the required durable state.
- Keep tests outside production source directories. Follow
  [Repository Testing](./docs/testing.md).
- Follow [Hosted Site App Authoring](./docs/hosted-site-app-authoring.md) when
  adding or changing a hosted application.

## Workflow

Before editing:

1. Inspect the relevant code, tests, and durable documentation.
2. Preserve unrelated worktree changes; never revert changes you did not make.
3. Open an issue first for substantial features, architecture changes, or
   destructive migrations.

Before submitting:

1. Add or update tests for changed behavior.
2. Run `pnpm verify:ci`.
3. Review `docs/roadmap.md`; update it only when milestone scope, status,
   sequencing, or exit criteria changed.
4. Update durable topic documentation when contracts or operations changed.

## Git And GitHub

Follow [Work Item Naming](./docs/work-item-naming.md):

- Issue, commit, and pull request titles use
  `<type>(<scope>): <imperative summary>`.
- Branches use `<owner>/<issue>-<type>-<short-slug>` and start from the latest
  `develop`.
- Do not add `[codex]`, roadmap sequence codes, priority codes, or issue
  numbers to commit and pull request titles.
- Keep one coherent work item per branch and pull request.
- Normal pull requests target `develop` and use squash merge.
- Only release and approved emergency hotfix pull requests target `main`.
- Link the primary issue with `Closes #<number>` in the pull request body.

Agents must not commit, push, open a pull request, merge, or modify an issue
until the user requests that action.

## Frontend Verification

For user-visible frontend changes:

1. Run the affected page in an actual browser.
2. Inspect changed interactive, loading, empty, selected, and disabled states.
3. Check desktop and a narrow viewport when the component is responsive.
4. Record tested pages, viewports, and interactions in pull request
   verification notes. Do not publish when required visual verification is
   incomplete.

## Security And Operations

- Never commit or print credentials, complete session tokens, service-role
  keys, production data, or private user data.
- Prefer additive, backward-compatible migrations with deployment ordering and
  rollback notes.
- Keep the MVP deployment Docker Compose based and self-hostable; do not add
  Kubernetes or a heavy cloud dependency without an approved architecture
  change.
- Nginx is the hosted gateway. Gateway configuration changes require reload or
  recreation during deployment.
- Run preview lifecycle checks only against the test environment unless the
  user explicitly requests production verification.

See [Deployment and Scaling](./docs/deployment.md), [Security](./docs/security.md),
and [Repository Testing](./docs/testing.md) for operational procedures.

## Documentation

- `docs/roadmap.md` is the only roadmap and milestone-status source.
- Durable architecture, contracts, testing, and operations belong in `docs/`.
- Executable task breakdowns, acceptance criteria, dependencies, and progress
  belong in GitHub Issues.
- Do not create additional roadmap or TODO documents.
- Canonical repository documentation is English. Only `README.zh-CN.md` is
  maintained as a translation.
