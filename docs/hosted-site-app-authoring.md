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

This is the only documentation table that enumerates the changing suite contents. The catalog source remains authoritative; update this summary when publishing a revision instead of copying the list into other documents.

<!-- generated:hosted-testcases:start -->
| Task | App | Variants |
| --- | --- | --- |
| `shopping-constrained-checkout` | `shopping-lite` | `budget-charger-standard`, `cable-express`, `travel-case-standard` |
| `forum-battery-moderation` | `forum-lite` | `battery-recall`, `wifi-reset`, `screen-advisory` |
| `repo-readme-fix` | `repo-lite` | `pnpm-install`, `yarn-install`, `bun-install` |
| `wiki-release-answer` | `wiki-lite` | `release-date`, `dispatch-window`, `charger-price` |
| `wiki-policy-answer` | `wiki-lite` | `adapter-restriction`, `standard-dispatch`, `express-cutoff` |
| `notes-followup-create` | `notes-lite` | `support-followup`, `release-note`, `ops-check` |
<!-- generated:hosted-testcases:end -->

Each task declares at least two semantic variants. The generic matrix combines every declared variant with all supported layouts and themes; presentation must never affect actions or scoring. See [Benchmark Scoring And Testing](./benchmark-testing.md) for required matrix coverage.

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
  routes.ts
  render.ts
  evaluate.ts
  final-state.ts
  test-support.ts
  test-driver.mjs
```

- `types.ts`: compact app domain types.
- `seed.ts`: deterministic fixtures and defaults.
- `actions.ts`: pure business mutations with explicit inputs.
- `routes.ts`: app-local HTTP parsing, persistence, telemetry, rendering, and redirects.
- `render.ts`: HTML for the required task surface.
- `evaluate.ts`: evaluator-level `HostedWebScoreResult`.
- `final-state.ts`: compact, redacted result evidence.
- `test-support.ts`: representative task config plus unit-test helpers that build passing and failing states for declared variants.
- `test-driver.mjs`: E2E smoke driver that completes one generated session through HTTP routes.
- `definition.ts`: composes app hooks.
- `runtime/generated-app-*.ts`: generated static imports for app definitions, app state types, and test support.

Do not add app branches to `server.ts`, `templates.ts`, `session-cache.ts`, or a central evaluation dispatcher. Run `pnpm --filter hosted-sites generate-registry` after adding an app directory; `pnpm --filter hosted-sites test` and `build` fail if the generated registry is stale.

## Add Existing Apps To A Suite

If the app already exists under `apps/hosted-sites/src/apps/<app-slug>`, adding it to the default suite should only touch `packages/test-cases`:

1. Add or reuse a named variant pool in `packages/test-cases/src/apps/<app-slug>/definition.ts`.
2. Add the session to `packages/test-cases/src/suites/hosted-web.ts` with `app`, `taskSlug`, `taskVersion`, `seedVersion`, `sequenceIndex`, `weight`, `required`, `startPath`, and the selected variant pool.
3. Run `pnpm catalog:generate` and `pnpm catalog:check`.

The orchestrator reads the ordered suite manifest. Hosted-sites routes, state hydration, final-state projection, and scoring are resolved through the registered app definition.

## Add A New Hosted App

Start with:

```bash
pnpm create-hosted-app <app-slug>-lite
```

The scaffold creates the hosted implementation and testcase definition directories, then regenerates both app registries. Replace the generated single-submit example with reviewed business behavior:

1. Define domain state, seed data, actions, routes, renderer, evaluator, and final evidence under `apps/hosted-sites/src/apps/<app-slug>/`.
2. Define the private task-config Zod schema and at least one named variant pool under `packages/test-cases/src/apps/<app-slug>/definition.ts`.
3. Keep `HostedAppDefinition.stateKeys`, persisted-state validation, test support, and the smoke driver aligned with the implemented state and routes.
4. Add the app session explicitly to `packages/test-cases/src/suites/hosted-web.ts`. Suite order, weights, required flags, and versions are benchmark policy and are never inferred.
5. Run `pnpm catalog:generate`, `pnpm hosted-app:check`, and the full test suite.

After this, runtime dispatch, Redis state validation, unit variant matrix coverage, and E2E smoke completion are app-definition driven rather than central switch driven.

See [Hosted App Extensibility](./hosted-app-extensibility.md) for the remaining automation boundary and recommended scaffold/catalog-registry work.

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
