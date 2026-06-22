# Benchmark Scoring And Testing

This document defines scoring and testcase verification. Milestone status belongs only in the [project roadmap](./roadmap.md).

## Terminal Scoring Contract

The current suite uses one submission as a terminal scoring action. This preserves first-writer-wins lifecycle guarantees and prevents an agent from probing visible scorer output through repeated submissions.

After a session becomes `completed` or `failed`:

- mutation routes reject further writes with a stable terminal response;
- active forms become read-only result views;
- score APIs return the persisted hosted result rather than recalculating mutable state;
- duplicate completion returns the first persisted result;
- viewer, attempt overview, public result, and database rows report the same terminal score.

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

## Cross-Cutting Coverage

- Every semantic variant produces the same result across all layouts and light/dark themes.
- Route tests cover mutation, redirect, terminal rejection, and persisted-score behavior.
- Orchestrator integration covers failed finalization, duplicate completion, suite aggregation, and callback idempotency.
- Full lifecycle smoke reports selected variant IDs and verifies four persisted session results plus one aggregate score.
- A development-only scheduled sweep covers the complete pool without consuming production guest quota.

CI must fail when a declared variant lacks both positive and negative scorer coverage. Development E2E must show that Web, hosted-sites, orchestrator, Redis, and Supabase converge on one terminal score.
