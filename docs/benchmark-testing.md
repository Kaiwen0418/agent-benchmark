# Benchmark Scoring And Testing

This document defines scoring and testcase verification. Milestone status belongs only in the [project roadmap](./roadmap.md).

## Terminal Scoring Contract

The current suite uses one submission as a terminal scoring action. This preserves first-writer-wins lifecycle guarantees and prevents an agent from probing visible scorer output through repeated submissions.

After a session becomes `completed` or `failed`:

- mutation routes reject further writes with a stable terminal response;
- active forms become read-only result views;
- score APIs return the persisted hosted result rather than recalculating mutable state;
- duplicate completion returns the first persisted result;
- viewer, run connection payload, public result, and database rows report the same terminal score.

A retryable task requires an explicit draft/finalize protocol and a new task or suite version.

## Canonical Answer Contract

Information-retrieval variants declare:

- answer kind;
- canonical value;
- allowed normalization policy;
- source article or entity;
- public goal that identifies the extraction unit without exposing the answer.

Do not use broad substring acceptance. Normalization may ignore declared presentation differences such as case or punctuation, but it must not accept semantically broader answers. Pool validation must prove that the target source exists and deterministically supports the canonical answer.

## Variant Matrix

CI should enumerate declared variants directly instead of relying on a few random seeds.

| App | Positive and negative coverage |
| --- | --- |
| `shopping-lite` | Every category and shipping method; quantity/price boundaries; restricted item, wrong quantity, and empty-cart failures. |
| `forum-lite` | Every thread/value/reason tuple; wrong thread, missing reply, wrong reason, lock-before-reply, and writes after lock. |
| `repo-lite` | Every package-manager/title/branch tuple; forbidden text retained, wrong file/title/branch, and duplicate MR. |
| `wiki-lite` | Every article/answer-kind tuple; canonical answer, declared normalization, near miss, wrong article, empty answer, and duplicate submission. |
| `notes-lite` | Every generated note tuple; exact title/body/tag match, wrong tag, missing body, and terminal mutation rejection. |

## Cross-Cutting Coverage

- Every semantic variant produces the same result across all layouts and light/dark themes.
- Route tests cover mutation, redirect, terminal rejection, and persisted-score behavior.
- Orchestrator integration covers failed finalization, duplicate completion, suite aggregation, and callback idempotency.
- Full lifecycle smoke reports selected variant IDs and verifies one persisted session result per suite session plus one aggregate score.
- A development-only scheduled sweep covers the complete pool without consuming production guest quota.

CI must fail when a declared variant lacks both positive and negative scorer coverage. Development E2E must show that Web, hosted-sites, orchestrator, Redis, and Supabase converge on one terminal score.

## Typed Testcase Catalog

`packages/test-cases` is the canonical authoring source for benchmark cases, hosted task variants, app-specific private task configuration, and suite composition. App task schemas form a discriminated union on the session `app`, so an evaluator configuration cannot be assigned to the wrong hosted application.

Tests and local Web data import the catalog directly. `supabase/seed.sql` is generated from it with `pnpm catalog:generate`; CI runs `pnpm catalog:check` and rejects manual or stale SQL. Production schema migrations remain immutable historical records and are not parsed as testcase source code.

## Immutable Releases

Publishing converts the validated catalog into an immutable `benchmark_case_revisions` row identified by a revision name and SHA-256 content hash. `pnpm catalog:publish` uses the service-role-only publication RPC; repeating the same revision or content is idempotent, while reusing an identity with different content is rejected.

`benchmark_cases.current_revision_id` selects the release for new runs. The Web sends only this revision ID during attempt initialization. The orchestrator loads the private manifest directly, validates it again, generates the seeded question snapshot, and writes `benchmark_attempts.case_revision_id`. Updating the current release therefore does not change the manifest associated with an earlier attempt.

## Commands And Scheduled Coverage

- `pnpm --filter hosted-sites test` imports the canonical catalog, executes positive and negative scoring for all 15 current variants, and repeats each passing state across all five layouts and both themes.
- `pnpm catalog:publish` validates and publishes the current catalog release with service-role credentials.
- `pnpm verify:ci` runs the complete repository gate, including Redis command tests, PostgreSQL lifecycle races, local hosted smoke, and production builds.
- `Hosted Variant Sweep` runs four deterministic full-pass attempts against the development environment every Monday and on demand. Seeds `full-pool-0`, `full-pool-1`, `full-pool-2`, and `full-pool-4` cover every current variant without using Web guest quota.
- Each lifecycle smoke logs selected variant IDs and requires one unique `hosted_web_results` row per suite session plus one `benchmark_attempt_scores` row.

The seed list is versioned with the suite. Recompute it whenever variant IDs, session order, app slug, or task slug changes; CI remains the immediate guard against an uncovered variant.
