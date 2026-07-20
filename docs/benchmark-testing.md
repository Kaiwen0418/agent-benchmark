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

Each app-local `test-support.ts` supplies a representative valid config plus passing and failing state builders. The generic matrix imports the published catalog, discovers every app and semantic variant, and applies those builders across presentation combinations. App-specific tests remain responsible for business boundaries that cannot be expressed by the generic matrix, such as quantity limits, duplicate submissions, ordering constraints, and terminal mutation rejection.

## Cross-Cutting Coverage

- Every semantic variant produces the same result across all layouts and light/dark themes.
- Route tests cover mutation, redirect, terminal rejection, and persisted-score behavior.
- Orchestrator integration covers failed finalization, duplicate completion, suite aggregation, and callback idempotency.
- Full lifecycle smoke reports selected variant IDs and verifies one persisted session result per suite session plus one aggregate score.
- A development-only scheduled sweep covers the complete pool without consuming production guest quota.

CI must fail when a declared variant lacks both positive and negative scorer coverage. Development E2E must show that Web, hosted-sites, orchestrator, Redis, and Supabase converge on one terminal score.

The generic matrix iterates every published suite. The easy suite (`hosted-web-suite-v1`) and the hard suite (`hosted-web-hard-suite-v1`) have disjoint variant pools, so the hard suite cannot weaken or inherit easy-suite coverage. Each hard variant receives the same positive, negative, and presentation-invariant assertions as an easy variant, and a hard cross-app chain additionally asserts suite-level carry behavior (see [Cross-App Consistency](#cross-app-consistency)).

Hard shopping orders are also checked for amount integrity. The evaluator
recomputes the product subtotal, configured discount, pre-discount
shipping-threshold result, and final total from persisted backend state; a
matching coupon code or under-budget forged total is insufficient.

Ordered hard forum workflows compare the relevant persisted moderation-action
sequence with the declared order. Having the correct final category, title,
duplicate links, lock, and pin is insufficient when the agent locked early or
performed prerequisite actions out of order.

## Independent Suite Versioning

The easy and hard suites version independently. Each carries its own `suiteVersion` and is published as its own immutable revision (`hosted-web-suite-v3.0.10` and `hosted-web-hard-suite-v1.0.5`). A change to a hard variant, the hard pool composition, a hard cross-app chain, or a testcase time limit bumps the affected suite's version and content hash.

This is enforced mechanically: new task-config fields used by hard variants are optional and only inspected when present, and `consistencyChecks` is an optional manifest key that is absent from the easy manifest. The easy catalog's "stable revision identity and content hash" test fails if a hard-suite change leaks into the easy manifest.

## Cross-App Consistency

The hard suite declares a two-value cross-app chain: the release-lookup answer must become the later note title, and the policy-lookup answer must become its body. Suite-level consistency checks link each earlier session's published final state to the later session's final state and are evaluated only by the scoring module (`evaluateSuiteConsistency`), then folded into `aggregateSuiteScore` by the orchestrator at suite completion as first-class weighted-required components. Required behavior:

- Suite-level checks live solely in the scoring module and orchestrator aggregation. Apps never compute them and never see other sessions' state.
- A check reads only the agents' own final states, never private `taskConfig`. The matching per-session evaluator stays lenient on the carried field so the carry is enforced only at suite level.
- Source `sequenceIndex` must precede target; the manifest `superRefine` rejects out-of-order or unknown-task-slug checks.
- Evidence surfaces only matched values, presence flags, and paths — never the corpus or the private answer contract.
- Sensitive target fields use `target-digest-matches-source`: hosted-sites
  persists only a SHA-256 digest of the normalized agent-authored value, and
  scoring hashes the prior source value for comparison. The full Notes body is
  never added to final-state evidence or aggregate output.

Orchestrator unit coverage must include the chain succeeding, the carry mismatching, a missing prior output, and a chain-free suite that omits `consistencyChecks` entirely.

## Scorer Oracle Visibility

Scorer oracle surfaces — variant pools, canonical answers, evaluator parameters, private `taskConfig`, and full final-state corpora — are visible only to service-role and operator/test contexts, never to public sessions or browsers:

- **Public sessions / browsers:** display-safe goals, stable scores, and redacted final evidence only. Variant pools and answer contracts are stripped at selection time; the orchestrator persists only the selected metadata.
- **Service-role (orchestrator):** the complete private manifest, generation, and aggregation, including consistency evaluation.
- **Local / test / operator:** unit tests and the development variant sweep import the canonical catalog directly to assert oracle-dependent behavior; these paths never run in public production request handling.

Tests must assert that public result, connection payload, telemetry, and HTML never expose oracle surfaces for either suite.

## Typed Testcase Catalog

`packages/test-cases` is the canonical authoring source for benchmark cases, hosted task variants, app-specific private task configuration, and suite composition. App task schemas form a discriminated union on the session `app`, so an evaluator configuration cannot be assigned to the wrong hosted application.

Tests and local Web data import the catalog directly. `supabase/seed.sql` is generated from it with `pnpm catalog:generate`; CI runs `pnpm catalog:check` and rejects manual or stale SQL. Production schema migrations remain immutable historical records and are not parsed as testcase source code.

## Immutable Releases

Publishing converts the validated catalog into an immutable `benchmark_case_revisions` row identified by a revision name and SHA-256 content hash. `pnpm catalog:publish` uses the service-role-only publication RPC; repeating the same revision or content is idempotent, while reusing an identity with different content is rejected.

`benchmark_cases.current_revision_id` selects the release for new runs. The Web sends only this revision ID during attempt initialization. The orchestrator loads the private manifest directly, validates it again, generates the seeded question snapshot, and writes `benchmark_attempts.case_revision_id`. Updating the current release therefore does not change the manifest associated with an earlier attempt.

## Commands And Scheduled Coverage

- `pnpm --filter hosted-sites test` imports the canonical catalog, executes positive and negative scoring for every declared variant across both published suites, and repeats each passing state across all layouts and themes.
- `pnpm catalog:publish` validates and publishes the current catalog release with service-role credentials.
- `pnpm verify:ci` runs the complete repository gate, including Redis command tests, PostgreSQL lifecycle races, local hosted smoke, and production builds.
- `Hosted Variant Sweep` runs seven deterministic full-pass attempts per suite against the development environment every Monday and on demand. The default-branch schedule dispatches the workflow from `develop` before it requests the protected `development` Environment. The workflow matrix passes `BENCHMARK_CASE_SLUG` explicitly for both `hosted-web-suite` and `hosted-web-hard-suite`. Seeds `full-pool-164`, `full-pool-268`, `full-pool-327`, `full-pool-548`, `full-pool-819`, `full-pool-843`, and `full-pool-853` cover every current variant without using Web guest quota; an orchestrator test reads this list directly from the workflow and fails if either suite loses coverage. The hard suite is swept independently from the easy suite and ranked separately on public result and leaderboard surfaces.
- Each lifecycle smoke logs selected variant IDs and requires one unique `hosted_web_results` row per suite session plus one `benchmark_attempt_scores` row.

The seed list is versioned with the suite. Recompute it whenever variant IDs, session order, app slug, or task slug changes; CI remains the immediate guard against an uncovered variant.
