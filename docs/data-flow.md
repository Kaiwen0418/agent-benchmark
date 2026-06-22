# Data Flow

This document describes the current runtime path. It does not treat planned Redis durability or session-concurrency work as an implemented guarantee. Static component ownership is in [Architecture](./architecture.md); authority and failure boundaries are in [Data Ownership](./data-ownership.md) and [Consistency and Failure](./consistency-and-failure.md).

## 1. Run Creation and Attempt Allocation

```mermaid
sequenceDiagram
  participant U as User Browser
  participant W as apps/web
  participant D as Supabase
  participant A as orchestrator API
  participant R as Redis Streams
  participant K as partition worker

  U->>W: POST /api/runs
  W->>D: insert benchmark_run
  U->>W: GET /api/runs/:id/connect
  W->>D: load case and current revision ID
  W->>A: POST /api/attempts/init
  A->>R: XADD attempt.init
  K->>R: XREADGROUP assigned partition
  K->>D: load private immutable revision
  K->>K: validate manifest and generate questions
  K->>D: create/recover canonical attempt and sessions
  K-->>A: result through Redis response key
  A-->>W: attempt and session URLs
  W-->>U: connection payload
```

Web sends `runId`, `caseId`, and `caseRevisionId`, but never sends the private suite manifest. The worker loads the selected service-role-only revision, validates it, generates a deterministic question snapshot, and binds the attempt to that revision. The first session is `active`; later sessions are `created`.

Attempt initialization also uses a short Redis lease to reduce duplicate work. PostgreSQL uniqueness on `(run_id, case_id, provider)` remains the correctness boundary when Redis is unavailable or two requests race. See [Hosted Attempt Consistency](./attempt-consistency.md).

## 2. Hosted Request and Session Lookup

Write-session and viewer tokens follow different paths.

```mermaid
flowchart TD
  Request["Hosted request"] --> Token{"Viewer token?"}
  Token -->|"yes"| ViewerRecovery["Recover viewer session through orchestrator"]
  ViewerRecovery --> Viewer["Render read-only viewer state"]
  Token -->|"no"| Redis["Read hosted-sites:session:&lt;token&gt;"]
  Redis -->|"hit"| Handle["Validate app, expiry, and handle route"]
  Redis -->|"miss/error"| Local{"Process-local Map hit?"}
  Local -->|"yes"| Handle
  Local -->|"no"| Recovery["Recover by token through orchestrator"]
  Recovery --> Rehydrate["Hydrate persisted appState snapshot"]
  Rehydrate --> Cache["Write Redis and local Map"]
  Cache --> Handle
```

Nginx may send each request to any hosted-sites replica. Redis is the first shared lookup for write-session tokens; the local Map is a non-authoritative hot copy. Hosted-sites has no database credential. Its authenticated recovery request is resolved by the orchestrator from the latest successfully persisted `metadata.appState` snapshot, which may lag state that had existed only in Redis.

The current local-Map fallback can serve stale state after a Redis miss, and Redis session writes are not revision-checked. These are known horizontal-scaling gaps, not guarantees supplied by the diagram.

## 3. Task Mutation, Telemetry, and Snapshot Persistence

```mermaid
sequenceDiagram
  participant A as Agent Browser
  participant H as hosted-sites
  participant C as Redis Session Runtime
  participant O as orchestrator API
  participant S as Redis Stream
  participant K as partition worker
  participant D as Supabase
  participant W as apps/web

  A->>H: task action with session token
  H->>H: validate route and mutate app state
  H->>C: SET complete V2 session envelope
  H->>O: session.snapshot command
  O->>S: XADD partitioned command
  K->>D: update hosted_web_sessions.metadata
  H->>H: append runtime event
  H->>C: SET envelope including event
  H->>O: session.snapshot and session.event commands
  K->>D: update snapshot and insert hosted_web_event
  H-->>W: best-effort normalized run event
  H-->>A: response or redirect
```

The current implementation persists a snapshot before many app events, then `recordEvent` persists the updated envelope and another snapshot before sending the event command. This is real write amplification, not an intentional exactly-once transaction. Commands are authenticated HTTP calls to the orchestrator API; hosted-sites does not write hosted lifecycle tables directly.

Access handling follows the same transport: hosted-sites updates counters in the runtime envelope and sends a `session.access` command. The worker updates the durable session access fields and appends a `hosted_web_access_logs` row.

The direct hosted-sites-to-Web event is best effort and feeds live run observability. Durable hosted telemetry is written separately by the orchestrator worker. There is no transaction joining those two paths.

## 4. Orchestrator Command Processing

```mermaid
flowchart LR
  Caller["Web or hosted-sites"] -->|"authenticated HTTP"| API["orchestrator API"]
  API -->|"stable entity hash"| Stream["commands:p&lt;N&gt;"]
  Stream --> Group["hosted-orchestrator consumer group"]
  Group --> Worker["partition owner"]
  Worker --> Handler["typed command handler"]
  Handler --> DB[("Supabase")]
  Handler --> Result["24h command result key"]
  Result --> Reply["short-lived response list"]
  Reply --> API
```

The API process publishes and waits for a response. Two worker services currently own disjoint ranges `0-7` and `8-15`. Worker leases reject overlapping ownership, and readiness requires a lease for every partition. A failed handler is retried up to three times; terminal failures are persisted to `orchestrator_command_dead_letters` before the Stream entry is acknowledged.

Redis Streams currently survive process restart while the same Redis container data remains available, but production Compose does not yet provide a persistent Redis volume or HA. They are runtime transport, not the durable lifecycle source of truth.

## 5. Session Completion and Callback Outbox

```mermaid
sequenceDiagram
  participant A as Agent
  participant H as hosted-sites
  participant O as orchestrator API
  participant R as Redis Stream
  participant K as partition worker
  participant D as Supabase
  participant W as apps/web

  A->>H: terminal task action
  H->>H: evaluate current app state
  H->>O: complete-session command
  O->>R: XADD attempt.complete-session
  K->>D: transactional completion RPC
  Note over K,D: result, session, next session, aggregate, attempt
  alt sessions remain
    D-->>K: per-session result and next session
    K-->>H: command response
    H-->>A: result or advance URL
  else attempt terminal
    D->>D: trigger inserts hosted_callback_outbox
    D-->>K: terminal aggregate result
    K-->>H: command response
    K->>D: claim outbox row
    K->>W: POST run completion
    K->>D: mark delivered or schedule retry
  end
```

`complete_hosted_attempt_session` locks the attempt and applies the terminal transition atomically inside PostgreSQL. Unique session-result and attempt-score constraints make retries first-writer-wins. Redis partition ordering reduces conflicts but is not the terminal lifecycle correctness boundary.

Web completion is not part of the terminal transaction. The database trigger creates one outbox row per attempt; workers attempt immediate delivery, while maintenance reconciles and retries pending rows. A failed Web callback therefore delays the Web read model without rolling back the hosted result.

## 6. Advance Resolution

`GET /api/attempts/:id/advance?session=...` reaches hosted-sites through the default Nginx route. Hosted-sites sends an authenticated `resolve-advance` request to the orchestrator. This read handler verifies the current session against durable attempt state and returns either:

- `complete: true` with no next URL, or
- the next session ID and tokenized start URL.

The client does not calculate suite ordering from URLs, Redis state, or its local history.

## 7. Expiry, Cleanup, and Recovery

When hosted-sites observes an expired write session, it evicts its runtime cache entry and sends an `attempt.timeout` command. A periodic orchestrator maintenance command also discovers expired durable sessions, atomically times out attempts, prunes old access logs, reconciles callback outbox rows, and retries delivery.

Recovery boundaries:

- process-local Map loss is expected and recoverable from Redis
- Redis session loss uses orchestrator recovery from the latest successful Supabase app-state snapshot
- Redis Stream loss can discard commands that had not produced durable database effects
- duplicate terminal commands recover from PostgreSQL constraints and transactional functions
- Web callback loss recovers through `hosted_callback_outbox`
- there is no distributed transaction spanning Redis, Supabase, hosted-sites, and Web

The exact current RPO, concurrency gaps, and degraded behavior are documented in [Consistency and Failure](./consistency-and-failure.md).
