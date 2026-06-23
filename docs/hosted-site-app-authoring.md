# Hosted-Site App Authoring And Scoring

This is the implementation contract for hosted-web apps, question variants, and scorers. The goal is not to clone WebArena's heavyweight services. AgentBench preserves cross-page task structure and verifiable outcomes through small, deterministic hosted apps.

Understand the **case, generation, session, and scoring** contracts before writing HTML.

## Design Model

| Object | Owns | Must not own |
| --- | --- | --- |
| Benchmark case | Suite, order, weights, variant pools | App business logic |
| Question variant | Public `goal` paired with hidden `taskConfig` | URL or action contract changes |
| UI presentation | Layout and light/dark theme | Answers or scoring semantics |
| Hosted session | One task, presentation, and mutable app state | Cross-session state |
| App definition | Seed, actions, routes, render, evaluate | Attempt lifecycle |
| Orchestrator | Generation, sessions, advancement, aggregation | App-specific business branches |

Fixed questions become memorization tests. AgentBench does not generate questions with an online LLM. It deterministically selects from versioned variant pools using an attempt seed and independently selects presentation.

```mermaid
flowchart TD
  Case["benchmark_cases.current_revision_id"] --> Revision["benchmark_case_revisions.manifest"]
  Revision --> Suite["Ordered suite sessions"]
  Suite --> Pool["Per-app questionVariants"]
  Attempt["Benchmark attempt"] --> Seed["generationSeed"]
  Seed --> QuestionHash["Question hash"]
  Seed --> LayoutHash["Layout hash"]
  Seed --> ThemeHash["Theme hash"]
  Pool --> QuestionHash --> Variant["goal + hidden taskConfig"]
  LayoutHash --> Layout["five layouts"]
  ThemeHash --> Theme["light / dark"]
  Variant --> Session["Persisted hosted session"]
  Layout --> Session
  Theme --> Session
  Session --> Render["Hosted HTML"]
  Session --> Evaluate["App evaluator"]
  Render --> Agent["External agent browser"]
  Agent --> Actions["Session-scoped actions"] --> Evaluate
  Evaluate --> Result["hosted_web_results"] --> Aggregate["benchmark_attempt_scores"]
```

## Current Hosted Testcases

The production `hosted-web-suite` case runs `hosted-web-suite-v1` version `v3.0.1`. All six sessions are required and have weight 1. `shopping-constrained-checkout` is the first session task slug, not the benchmark case slug.

| Task | App | Variants |
| --- | --- | --- |
| `shopping-constrained-checkout` | `shopping-lite` | `budget-charger-standard`, `cable-express`, `travel-case-standard` |
| `forum-battery-moderation` | `forum-lite` | `battery-recall`, `wifi-reset`, `screen-advisory` |
| `repo-readme-fix` | `repo-lite` | `pnpm-install`, `yarn-install`, `bun-install` |
| `wiki-release-answer` | `wiki-lite` | `release-date`, `dispatch-window`, `charger-price` |
| `wiki-policy-answer` | `wiki-lite` | `adapter-restriction`, `standard-dispatch`, `express-cutoff` |
| `notes-followup-create` | `notes-lite` | `support-followup`, `release-note`, `ops-check` |

Each task has three semantic variants and ten presentation combinations (`5 layouts x 2 themes`). Presentation must never affect actions or scoring. See [Benchmark Scoring And Testing](./benchmark-testing.md) for required matrix coverage.

## Core Rules

- **Deterministic:** the same generation seed and task version produce the same session.
- **Session-scoped:** mutable state never leaks across sessions.
- **Server-scored:** prefer server-owned business state over browser traces.
- **Small surface:** implement only pages and transitions required by the task.
- **Stable contract:** URLs, field names, actions, and confirmations remain stable across presentations.
- **External browser:** the evaluated agent owns its browser; hosted-sites does not run one.
- **Generic persistence:** app state uses session snapshots and generic result/evidence tables, not per-app tables.

WebArena domains may inspire tasks, but these apps are `hosted-web` or `webarena-lite`, not canonical WebArena. Implement the task surface, not Magento, GitLab, Postmill, Kiwix, or OpenStreetMap in full.

## Service Boundaries

- `apps/hosted-sites`: app pages, mutations, telemetry, app evaluation, final evidence.
- `apps/hosted-orchestrator`: attempt initialization, ordered advancement, aggregation, timeout, cleanup.
- `apps/web`: run creation, connection payload, progress, live view, public result.

Question pools belong in `benchmark_case_revisions.manifest.sessions[].metadata.questionVariants`. Generic selection belongs in the orchestrator. Apps must not call random generators at runtime.

## Generation Contract

```json
{
  "metadata": {
    "questionVariants": [
      {
        "id": "shipping-window",
        "goal": "Find the dispatch window and submit only the duration without surrounding words.",
        "taskConfig": {
          "targetArticleSlug": "shipping-policy",
          "answerContract": {
            "kind": "duration",
            "canonicalValue": "two business days",
            "normalization": "trim-casefold",
            "sourceArticleSlug": "shipping-policy"
          }
        }
      }
    ]
  }
}
```

After selection, the orchestrator removes the pool and persists only the selected metadata:

```json
{
  "questionGeneration": {
    "schemaVersion": 2,
    "generationSeed": "opaque-attempt-seed",
    "variantId": "shipping-window",
    "uiVariant": "dashboard",
    "uiTheme": "dark",
    "taskConfig": {
      "targetArticleSlug": "shipping-policy",
      "answerContract": {
        "kind": "duration",
        "canonicalValue": "two business days",
        "normalization": "trim-casefold",
        "sourceArticleSlug": "shipping-policy"
      }
    }
  }
}
```

Variant IDs are stable and unique. Goals expose required constraints without answers. `taskConfig` is privileged scorer data and must not appear in HTML, connection payloads, or telemetry. Evaluators use `readTaskConfig()` and fail closed when configuration is missing. Semantic changes require a seed or suite version update.

## App Structure

```text
apps/hosted-sites/src/apps/<app-slug>/
  definition.ts
  types.ts
  seed.ts
  actions.ts
  render.ts
  evaluate.ts
  final-state.ts
  test-support.ts
  test-driver.mjs

apps/hosted-sites/src/routes/<route-name>.ts
```

- `types.ts`: compact app domain types.
- `seed.ts`: deterministic fixtures and defaults.
- `actions.ts`: pure business mutations with explicit inputs.
- `render.ts`: HTML for the required task surface.
- `evaluate.ts`: evaluator-level `HostedWebScoreResult`.
- `final-state.ts`: compact, redacted result evidence.
- `test-support.ts`: unit-test helpers that build passing and failing states for declared variants.
- `test-driver.mjs`: E2E smoke driver that completes one generated session through HTTP routes.
- `definition.ts`: composes app hooks.
- `routes`: HTTP parsing, persistence, telemetry, rendering.
- `runtime/generated-app-*.ts`: generated static imports for app definitions, app state types, and test support.

Do not add app branches to `server.ts`, `session-cache.ts`, or a central evaluation dispatcher. Run `pnpm --filter hosted-sites generate-registry` after adding an app directory; `pnpm --filter hosted-sites test` and `build` fail if the generated registry is stale.

## Add Existing Apps To A Suite

If the app already exists under `apps/hosted-sites/src/apps/<app-slug>`, adding it to the default suite should only touch `packages/test-cases`:

1. Add or reuse the app question variants under `packages/test-cases/src/apps/<app-slug>.ts`.
2. Add the session to `packages/test-cases/src/suites/hosted-web-v2.ts` with `app`, `taskSlug`, `taskVersion`, `seedVersion`, `sequenceIndex`, `weight`, `required`, `startPath`, and `metadata.questionVariants`.
3. Update the typed catalog schema in `packages/test-cases/src/schemas.ts` only if the app's `taskConfig` shape is new.
4. Run `pnpm catalog:generate` and `pnpm catalog:check`.

The orchestrator reads the ordered suite manifest. Hosted-sites routes, state hydration, final-state projection, and scoring are resolved through the registered app definition.

## Add A New Hosted App

Adding a new app should be localized to one app directory plus catalog schema/source:

1. Create `apps/hosted-sites/src/apps/<app-slug>/` with the files listed above.
2. Export `type AppSessionState` from `types.ts`.
3. Export a `HostedAppDefinition` from `definition.ts`; its `stateKeys` are the authoritative persisted state keys for Redis/session snapshots.
4. Export a `HostedAppTestSupport` from `test-support.ts`; variant matrix tests use it to build passing and failing states.
5. Export `complete()` from `test-driver.mjs`; lifecycle smoke dynamically imports it by `session.app`.
6. Run `pnpm --filter hosted-sites generate-registry`.
7. Add the app's question variant schema and suite session in `packages/test-cases`, then regenerate the catalog seed.

After this, runtime dispatch, Redis state validation, unit variant matrix coverage, and E2E smoke completion are app-definition driven rather than central switch driven.

## Scoring

Scoring uses WebArena-Verified-style evaluator families with strict aggregation:

- `backend_state`: primary proof for checkout, posting, settings, file edits, and created records.
- `retrieve_value`: deterministic information retrieval against hidden canonical values.
- `ui_state`: auxiliary proof based on stable server-owned view markers.
- `final_response`: structured final text; optional unless the task is purely informational.

All required evaluators must pass for session score 1. Any required failure produces score 0; evaluator errors produce status `error`. Optional evaluators are diagnostic only.

Validate final business state, not click paths. Keep evidence compact and explainable. Do not use telemetry, CSS classes, animation state, or full DOM traces as the primary success condition.

## Routes, Actions, And Persistence

Routes validate tokens, parse HTTP input, call actions, persist snapshots, emit necessary telemetry, and render or redirect. Actions do not know about HTTP, databases, HTML, or the orchestrator.

Use generic persistence:

- `hosted_web_sessions`: lifecycle, metadata, app snapshot.
- `hosted_web_events`: lightweight debugging and UI events.
- `hosted_web_results`: terminal score, evaluators, final state.
- `benchmark_attempt_scores`: suite aggregate.

Do not create one business-table set per app.

## Implementation Order

1. Define compact domain types.
2. Add deterministic fixtures.
3. Implement pure actions.
4. Render only required pages.
5. Evaluate hidden `taskConfig`, preferring backend state.
6. Produce compact final evidence.
7. Add HTTP routes.
8. Compose `definition.ts` and register it.
9. Add positive, negative, route, and terminal-state tests.
10. Run builds and lifecycle smoke.

## Verification

```bash
pnpm --filter hosted-sites test
pnpm --filter hosted-sites build
pnpm --filter hosted-orchestrator build
bash tests/e2e/hosted-lifecycle-smoke.sh
```

Apps entering the default suite also run:

```bash
HOSTED_SITES_PORT=4011 HOSTED_ORCHESTRATOR_PORT=5011 \
  bash tests/e2e/hosted-lifecycle-full-pass.sh
```

Acceptance requires registered typed state, evaluator breakdowns, at least one required `backend_state` unless purely informational, redacted final evidence, no app-specific tables, no server browser, and successful initialization/operation/scoring as an orchestrated session.
