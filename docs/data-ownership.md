# Data Ownership

This document defines who may read, mutate, and recover each state family. Ownership means the component that enforces domain invariants; it does not imply that no other component has a read path.

## Durable Data

| Data | Domain owner | Writers | Readers | Authority and notes |
| --- | --- | --- | --- | --- |
| `profiles`, Supabase Auth identity | Web control plane | Supabase Auth / Web | Web | User identity and plan data |
| `benchmark_cases` | Web control plane | release/admin workflow | Web, orchestrator service-role code | Case identity, visibility, display fields, and current revision pointer |
| `public_benchmark_cases` | Web control plane | database projection | anonymous/authenticated clients, Web | Display-safe discovery only |
| `benchmark_case_revisions` | benchmark release workflow | `publish_benchmark_case_catalog` | orchestrator, Web service-role recovery | Immutable private manifest plus synchronized public case identity |
| `benchmark_runs` | Web control plane | Web | Web, public read models | User-facing run lifecycle |
| `run_events`, `artifacts` | Web control plane | Web internal APIs | Web UI and public read models | Live observability and output artifacts |
| `benchmark_attempts` | hosted orchestrator | orchestrator workers and transactional RPCs | orchestrator only; Web uses orchestrator APIs/public read models | Canonical hosted attempt lifecycle and active-session pointer |
| `hosted_web_sessions` | hosted orchestrator | orchestrator workers and transactional RPCs | orchestrator only; hosted-sites recovery uses an internal API | Durable lifecycle, generated per-session task config, plus latest successful app-state snapshot |
| `hosted_web_events` | hosted orchestrator | orchestrator workers | orchestrator and result/read-model code | Durable hosted telemetry |
| `hosted_web_access_logs` | hosted orchestrator | orchestrator workers | maintenance and operations | Retained operational audit, not permanent evidence |
| `hosted_web_results` | hosted orchestrator | transactional completion RPC | orchestrator and result/read-model code | One terminal result per session |
| `benchmark_attempt_scores` | hosted orchestrator | transactional completion RPC | Web leaderboard/result reads | One aggregate score per attempt |
| `hosted_callback_outbox` | hosted orchestrator | database trigger and orchestrator processor | orchestrator workers/maintenance | Durable handoff from hosted terminal state to Web |
| `orchestrator_command_dead_letters` | hosted orchestrator | orchestrator workers | authenticated operator APIs | Redacted diagnostics after retry exhaustion; dead 90 days, replayed/resolved 30 days by default |

`apps/hosted-sites` has no Supabase SDK or credential. Token and viewer recovery use an authenticated orchestrator contract. Web owns its control-plane tables and consumes hosted result data through filtered public read-model views.

## Redis and Process State

| Namespace/state | Writer | Reader | Current authority | Retention |
| --- | --- | --- | --- | --- |
| `hosted-sites:session:<opaque-token>` | hosted-sites | hosted-sites replicas | Mutable active task state | Session expiry or configured TTL |
| `agentbench:orchestrator:commands:p<N>` | orchestrator API | assigned orchestrator worker | Runtime command transport | Approximate max length |
| orchestrator response lists | workers | API waiter | Synchronous command response only | Short TTL |
| orchestrator result keys | workers | workers/API retry path | Command idempotency result cache | 24 hours |
| retry/failure keys | workers | workers | Retry diagnostics before DB DLQ | 24 hours |
| partition lease keys | workers | workers/API readiness | Current partition ownership | 10 seconds, renewed every 3 seconds |
| attempt initialization lease | orchestrator worker | orchestrator workers | Duplicate-work reduction only | 30 seconds |
| hosted-sites process Map | one hosted-sites process | same process | Non-authoritative hot copy | Process lifetime |

Session keys and command keys currently share one Redis instance but are separate namespaces. They do not yet have independent persistence, memory, ACL, or failover policy.

## Source-of-Truth Matrix

| Question | Source of truth |
| --- | --- |
| Which benchmark definition did this attempt use? | `benchmark_attempts.case_revision_id` -> immutable revision |
| Which session is active? | Durable attempt/session rows and transactional lifecycle functions |
| Which question variant did a session receive? | `hosted_web_sessions.metadata.questionGeneration.variantId` |
| What is the current in-progress app state? | Redis session envelope, subject to current concurrency limitations |
| What app state can survive Redis loss? | Latest successfully persisted `hosted_web_sessions.metadata.appState` snapshot |
| Did a session or attempt finish? | PostgreSQL terminal rows and unique constraints |
| Has Web observed terminal completion? | `hosted_callback_outbox.status` plus Web run state |
| Did a Redis command finish recently? | Redis result key; durable side effects remain authoritative in PostgreSQL |
| Why was a command abandoned? | `orchestrator_command_dead_letters` |

## Boundary Rules

- Browser clients never receive Supabase service-role or Redis credentials.
- Web does not submit private suite manifests to orchestrator; it submits a revision ID.
- Web does not query hosted lifecycle tables directly; attempt state comes from orchestrator APIs and public completed results come from read-model views.
- Attempts do not own generated session definitions. `benchmark_attempts.metadata` is limited to revision identity, generation seed, active pointer, sequence pointer, and completed session ids.
- Sessions own generated task configuration for their concrete app/task. `hosted_web_sessions.metadata.questionGeneration.taskConfig` may contain scorer-only values and must remain behind service-role/internal APIs.
- Hosted-sites owns task actions and evaluation, but not durable attempt progression.
- Orchestrator workers are the only application writers for hosted lifecycle and scoring tables.
- Redis cannot override a terminal PostgreSQL transition.
- Web callbacks cannot roll back a completed hosted transaction.
- Public case discovery never exposes private manifest, variant pool, canonical answer, or evaluator configuration.
