# Consistency and Failure

This document separates implemented guarantees from target architecture. It should be read before interpreting Redis as a durable queue or assuming that multiple hosted-sites replicas make concurrent session mutation safe.

## Implemented Guarantees

### Attempt initialization

- PostgreSQL permits at most one hosted attempt for `(run_id, case_id, provider)`.
- A short Redis lease reduces duplicate initialization work.
- A lease contender or uniqueness loser reloads the canonical database attempt.
- Every database-backed hosted attempt references an immutable case revision.

### Terminal lifecycle

- Session completion and attempt timeout use transactional PostgreSQL functions.
- The functions lock the attempt before changing session state, aggregate state, and active-session metadata.
- `hosted_web_results.session_id` and `benchmark_attempt_scores.attempt_id` are unique.
- Duplicate terminal commands return or recover the persisted winner.
- Redis partition ordering reduces contention but is not required for terminal correctness.

### Callback delivery

- A terminal attempt transition inserts one `hosted_callback_outbox` row in the database transaction.
- Delivery is claim-based and retryable; stale claims can be reclaimed.
- Reconciliation recreates a missing outbox row for a terminal attempt.
- Web completion is idempotent and does not determine whether the hosted transaction committed.

### Worker ownership and command retry

- Stable hashing sends one partition key to one Stream partition.
- A worker must hold the short lease for every assigned partition.
- Duplicate worker ownership is rejected and missing leases fail readiness.
- Handler failures retain retry state in Redis and stop after three attempts.
- A command is acknowledged after success or after its final failure is persisted to the database DLQ.

## Current Non-Guarantees

### Concurrent task mutation

The Redis session envelope has no revision or fencing field. Hosted-sites performs whole-value reads and writes, so two replicas can overwrite each other. Sticky sessions are not required for ordinary sequential requests, but the current implementation does not guarantee lossless concurrent mutation.

### Redis durability and availability

Production Compose currently runs one Redis container without a named data volume, explicit AOF configuration, replication, or automated failover. Redis Streams and active sessions may be lost when that container is replaced. Application Stream partitions scale workers, not the Redis server.

### Snapshot recovery point

Hosted-sites writes Redis first and sends snapshot/event/access commands afterward. A Redis write can succeed before the database command, and command failures are not part of one distributed transaction. Supabase recovery therefore returns the latest successful snapshot, not necessarily the last state observed by an agent.

### Process-local fallback freshness

After a Redis miss or error, hosted-sites checks its process-local Map before the database. With Redis configured, that local object is not refreshed against durable control state. It can therefore be older than another replica or a terminal database transition.

### Exactly-once telemetry

Hosted events, Web run events, snapshots, and access records travel through separate operations. Retries and partial failures can produce missing or duplicate observability records. Terminal scoring correctness must not depend on telemetry exactly-once behavior.

## Failure Matrix

| Failure | Current behavior | Data at risk | Recovery/operator action |
| --- | --- | --- | --- |
| hosted-sites process exits | another replica reads Redis | only process-local hot copy | no action when Redis state is current |
| one orchestrator API exits | gateway/API retry can use another replica when deployed | in-flight HTTP response | retry with stable `x-command-id` where supported |
| one worker exits | pending entries remain in the consumer group | command latency | restart worker; stale entries are reclaimed |
| partition lease disappears | readiness reports missing partition; worker exits after lost renewal | command availability for that partition | restore one owner for the partition |
| Redis connection interruption | session requests may use local/DB fallback; command API can fail or time out | latest runtime state and unpersisted commands | restore Redis, then reconcile against PostgreSQL |
| Redis container replacement | no configured persistent-volume guarantee | active sessions, Streams, replies, retry state | recover persisted snapshots; manually assess missing commands |
| snapshot command fails | Redis request may still complete | newest app-state recovery point | retry/reconcile; do not claim zero-RPO recovery |
| terminal command repeats | PostgreSQL transaction/unique constraints return the winner | none after first commit | safe retry |
| Web completion callback fails | outbox remains pending/dead after retries | Web status freshness | maintenance retry, inspect dead outbox row |
| Supabase unavailable | durable workers fail and commands retry/DLQ; Redis task pages may remain available | durable progress until recovery | restore DB before accepting durable guarantees |

## Consistency Priorities

1. PostgreSQL terminal invariants take precedence over Redis and local state.
2. Redis active state takes precedence over a process-local Map when present.
3. A database app-state snapshot is a recovery checkpoint, not a live-session replica.
4. Callback and telemetry freshness must never be interpreted as terminal commit status.
5. Redis transport success does not imply that a durable database side effect occurred; the worker response does.

## Planned Hardening

- [Issue #60](https://github.com/Kaiwen0418/agent-benchmark/issues/60): persistence, capacity policy, workload separation, observability, and HA.
- [Issue #61](https://github.com/Kaiwen0418/agent-benchmark/issues/61): revisioned atomic session mutation and stale-snapshot rejection.
- [Issue #62](https://github.com/Kaiwen0418/agent-benchmark/issues/62): ACLs, token hashing, credential minimization, and network isolation.
- [Issue #59](https://github.com/Kaiwen0418/agent-benchmark/issues/59): final service/database ownership boundaries.

Until these issues are complete, documentation must describe Redis as shared runtime state and command transport, not as a zero-loss durable backbone.
