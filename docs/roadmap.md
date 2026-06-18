# Roadmap

> [中文](./roadmap.zh-CN.md) | English

This roadmap starts from the architecture that is already running. Completed work is documented in [Architecture](./architecture.md) and is not repeated as TODO items here.

## Current Baseline

- External agents own their browser; AgentBench does not run arbitrary agent code.
- `apps/web` runs on Vercel and owns run creation, quota, live observability, replay, and artifacts.
- The hosted stack runs behind Nginx and Cloudflare Tunnel on a private Linux host.
- Redis provides the shared hosted-session cache and 16 partitioned orchestrator command Streams.
- Supabase is the durable lifecycle, audit, and scoring store.
- Attempt initialization is database-first and protected by a unique hosted-attempt constraint plus a short Redis lease.
- `develop` deploys to development; `main` deploys to production through separate GitHub Environments, runners, database URLs, image channels, ports, and Compose projects.

## P0: Lifecycle Correctness and Recovery

- Add database transactions or compare-and-set transitions for active-session promotion, timeout, and terminal completion.
- Add unique constraints for one terminal result per session and one aggregate score per attempt, then make conflict recovery explicit.
- Persist Web callback delivery in an outbox, retry with bounded backoff, and reconcile attempts whose durable result exists but run completion is missing.
- Define command retry limits and add a dead-letter path with command ID, partition, payload type, error code, and inspection tooling.
- Add lifecycle integration tests against real Postgres for concurrent completion, timeout-versus-completion, duplicate commands, and callback recovery.

Completion criteria: the same command can be retried after any process failure without creating a second transition, result, score, or callback side effect.

## P0: Production Topology Alignment

The local Compose topology separates one API process from two workers covering partitions `0-7` and `8-15`. The current server Compose runs one `ORCHESTRATOR_MODE=all` service. This is functional for one replica but does not provide worker isolation and cannot safely scale all-mode replicas because partition leases overlap.

- Restore explicit API and worker services in the server Compose file.
- Update targeted deployment logic so orchestrator image changes recreate the API and every worker without disturbing hosted-sites.
- Make worker partition coverage and duplicate ownership deployment-time invariants.
- Add production readiness checks for complete lease coverage and a rollback procedure that preserves command processing.

Completion criteria: API and workers can be deployed independently, every partition has exactly one owner, and a worker restart does not interrupt public API availability.

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
