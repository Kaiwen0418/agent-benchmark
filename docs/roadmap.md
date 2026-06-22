# Roadmap

This roadmap starts from the architecture that is already running. Completed work is documented in [Architecture](./architecture.md) and is not repeated as TODO items here.

## Current Baseline

- External agents own their browser; AgentBench does not run arbitrary agent code.
- `apps/web` runs on Vercel and owns run creation, quota, live observability, replay, and artifacts.
- The hosted stack runs behind Nginx and Cloudflare Tunnel on a private Linux host.
- Redis provides the shared hosted-session cache and 16 partitioned orchestrator command Streams.
- Supabase is the durable lifecycle, audit, and scoring store.
- Attempt initialization is database-first and protected by a unique hosted-attempt constraint plus a short Redis lease.
- Terminal hosted results and aggregate attempt scores are first-writer-wins database invariants with explicit conflict recovery.
- `develop` deploys to development; `main` deploys to production through separate GitHub Environments, runners, database URLs, image channels, ports, and Compose projects.

## P0 Release Gate

P0 is now organized as ordered, independently verifiable milestones. A milestone is complete only when its implementation, automated checks, deployment behavior, and operator documentation agree.

| Milestone | Status | Exit criteria |
| --- | --- | --- |
| P0.1 Public result integrity | Complete | Public result pages expose sanitized benchmark metadata, completion time, browser environment, agent/base-model identity, and stable scores without leaking private run fields. |
| P0.2 Production role isolation | Complete | API/worker isolation, exact lease readiness, independent worker recovery, queued-command replay, and rollback evidence passed development fault injection. |
| P0.3 Atomic lifecycle transitions | Complete | Timeout, terminal completion, and active promotion share an attempt row lock and pass real-Postgres timeout-versus-completion and duplicate-completion race tests. |
| P0.4 Durable callback recovery | Complete | Web completion callbacks use a transactional outbox, eight-attempt bounded retry, stale-claim recovery, periodic reconciliation, and an idempotent Web receiver. |
| P0.5 Poison-command containment | Complete | Commands retry at most three times, persist diagnostic dead letters before acknowledgement, and support authenticated inspection and replay with a new command ID. |

### P0.2 Implementation Scope

- Production now declares one `ORCHESTRATOR_MODE=api` service and two worker services covering partitions `0-7` and `8-15`.
- An orchestrator image deployment updates the API and both workers from the same immutable tag without recreating hosted-sites.
- Static deployment validation rejects missing, duplicate, and out-of-range partition assignments.
- Runtime readiness requires Redis Streams plus an active lease for every partition.
- Development CD now automates independent worker restarts, public API continuity checks, queued-command recovery, and rollback evidence capture.
- Completion evidence: `develop@58cb60f` passed [Hosted deployment run 27900888968](https://github.com/Kaiwen0418/agent-benchmark/actions/runs/27900888968), including the 52-second fault-injection deployment and the following 52-second four-app lifecycle smoke.

P0 completion criterion: after any single-process failure or command retry, the system preserves one lifecycle transition, one result, one score, and one callback side effect while keeping the public API available.

### P0.3 Implementation Scope

- Expiry sweeps discover candidates without mutating lifecycle state.
- `timeout_hosted_attempt` locks the attempt and atomically expires open sessions, marks the attempt timed out, and inserts the unique aggregate score.
- `complete_hosted_attempt_session` uses the same attempt lock to persist the result, close the current session, update attempt progress, and either promote the next session or write the terminal aggregate.
- A losing or repeated timeout command performs no cache eviction or Web callback.
- Duplicate completion returns the first persisted result; completion after a winning timeout is rejected without lifecycle writes.
- CI runs timeout-versus-completion and duplicate-completion races against an isolated Postgres instance and rejects any cross-table partial state.

### P0.4 Implementation Scope

- A database trigger enqueues run completion in the same transaction that makes an attempt terminal.
- Workers claim callbacks with `FOR UPDATE SKIP LOCKED`; HTTP failures use exponential backoff and become `dead` after eight attempts.
- Maintenance recovers stale claims and recreates missing outbox rows for terminal attempts.
- The Web completion receiver uses a terminal-status compare-and-set so retries do not refresh completion time or append duplicate terminal events.
- The receiver accepts every non-terminal run state, including hosted-web `waiting_for_agent` and `agent_connected`, so a successful callback cannot be acknowledged without completing the run.
- CI covers trigger enqueue, exclusive claim, stale exhaustion, reconciliation, retry, delivery, and dead-letter behavior.

### P0.5 Implementation Scope

- Redis stores retry count and the final error independently from the worker process; handler execution stops after three failures.
- A command is acknowledged only after its diagnostic record is persisted in `orchestrator_command_dead_letters`.
- Reclaim retries failed DLQ persistence without re-executing an exhausted handler.
- Internal authenticated APIs list dead letters and replay a selected record with a new command ID, avoiding the original result cache.
- CI covers retry limits, DLQ persistence failure recovery, diagnostic schema, and database storage.

## P1: Observability and Operations

- Emit structured logs with request ID, command ID, run ID, attempt ID, session ID, partition, and deployment environment.
- Export command lag, pending/reclaimed entries, processing latency, callback backlog, active attempts, timeouts, and cleanup duration.
- Separate liveness from readiness; readiness should cover Redis, partition ownership, and required Supabase access.
- Define alert thresholds and an operator runbook for queue backlog, callback failure, migration failure, disk pressure, and Redis recovery.
- Test backup/restore and disaster recovery for Supabase records and Redis-backed active sessions.

Completion criteria: an operator can identify a stuck attempt and its last durable command without reading unstructured container logs.

## P1: Internal Boundaries and Contracts

- Split the orchestrator `server.ts` into transport/auth, command handlers, repositories, lifecycle, callbacks, and maintenance modules.
- Move internal request and command payloads to shared, versioned Zod schemas with structured error codes.
- Replace legacy `RUNNER_SHARED_SECRET`, `x-runner-secret`, and runner-named helpers with hosted-service terminology through a documented compatibility window.
- Version internal routes and Redis command/session envelopes, including explicit compatibility and deprecation rules.
- Remove duplicated app-specific defaults from the orchestrator; hosted app definitions and benchmark case metadata should own task semantics.

Completion criteria: transport changes do not require lifecycle changes, and incompatible command payloads fail validation before entering Redis Streams.

## P1: Benchmark Quality

Detailed scoring and coverage rules are defined in [Benchmark Scoring And Testing](./benchmark-testing.md). Roadmap status remains here.

| Milestone | Status | Exit criteria |
| --- | --- | --- |
| BQ.1 Scorer and task contract | Complete | Every information-retrieval variant has an unambiguous canonical answer, declared normalization, valid source evidence, and positive/negative tests. |
| BQ.2 Terminal score consistency | In progress | Terminal sessions reject mutation and every API, UI projection, and database row returns the first persisted result. |
| BQ.3 Testcase expansion | In progress | CI enumerates every app variant across positive/negative paths and development E2E proves one consistent aggregate. |

Complete BQ.1 and BQ.2 before expanding the hosted app catalog so new applications do not inherit ambiguous or mutable terminal scoring.

## P2: Benchmark and Product Depth

- Add more hosted applications and variant pools without introducing app-specific branches in the orchestrator.
- Version benchmark suites so historical runs remain reproducible after task or evaluator changes.
- Add exportable replay/trace bundles with redaction and retention controls.
- Improve run comparison and failure analysis around evaluator evidence, artifacts, and superseded attempts.
- Add load tests for many concurrent attempts and publish tested capacity limits.

Completion criteria: a benchmark release is reproducible from a versioned case definition, evaluator set, generation seed, and retained artifacts.

## Explicit Non-Goals

- Running untrusted agent code, browser sandboxes, or arbitrary workers inside Vercel functions.
- Reintroducing the removed benchmark execution runner without a separate isolation and threat-model project.
- Treating Redis as the durable lifecycle source of truth.
