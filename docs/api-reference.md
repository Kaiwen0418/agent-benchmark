# API Reference

## Authentication

Public Web requests currently use an HTTP-only guest cookie. The
`getCurrentUser()` seam remains guest-only until Auth.js is integrated.
Service-to-service writes require
`x-runner-secret: <RUNNER_SHARED_SECRET>`. The header and environment variable
retain a legacy name; they now authenticate hosted services, not a runner
component.

Hosted task requests use an opaque session token in `?session=<token>` or in the telemetry body. Only the SHA-256 token hash is stored in Supabase.

## Web API (`apps/web`)

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| `GET` | `/api/quota` | Current guest/user quota | user or guest cookie |
| `POST` | `/api/runs` | Create a benchmark run | user or guest cookie |
| `GET` | `/api/runs/:runId` | Read one run | run visibility rules |
| `GET` | `/api/runs/:runId/connect` | Allocate/read hosted attempt connection payload | run visibility rules |
| `GET` | `/api/runs/:runId/events` | List run events | run visibility rules |
| `POST` | `/api/runs/:runId/events` | Append internal hosted event | shared secret |
| `POST` | `/api/runs/:runId/complete` | Complete run with score | shared secret |
| `GET` | `/api/runs/:runId/stream` | SSE snapshots, heartbeat, terminal event | run visibility rules |
| `GET` | `/api/runs/:runId/artifacts` | List artifacts | run visibility rules |
| `GET` | `/api/runs/:runId/artifacts/file?path=...` | Read local artifact file | run visibility rules |
| `GET` | `/api/agent-options` | List curated agent and model options | public |

### Create Run

```http
POST /api/runs
Content-Type: application/json

{
  "caseId": "uuid",
  "executionMode": "external-agent",
  "agent": {
    "name": "Codex",
    "version": "latest",
    "baseModel": "GPT-5"
  }
}
```

Response: `201 { run, quota }`. The service persists the self-reported identity and captures the request browser environment. `GET /api/agent-options` provides curated choices, but clients may submit other non-empty values. Quota exhaustion returns `403` with `trial_limit_reached` or `daily_limit_reached`.

### Connect Run

`GET /api/runs/:runId/connect` is a one-time initialization read. It resolves
benchmark metadata, initializes or reuses an active hosted attempt, and returns
the attempt URL and session URLs. Clients must use `/hosted-sessions` or the run
event stream for subsequent progress updates rather than polling `/connect`.
Hosted allocation failures use a structured response:

```json
{
  "error": "error_code",
  "message": "human-readable message",
  "retryable": true,
  "hostedSitesUrl": "https://hosted.example.com"
}
```

The endpoint returns `404` for an unknown run, `410` for a terminal run, and
`429` when the per-client initialization limit is exceeded. Clients must stop
retrying `404` and `410` responses. A `429` response includes `Retry-After`,
`RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`; clients must
not retry before that delay expires. Shared edge caches retain `404` responses
for 60 seconds and terminal `410` responses for one hour. Successful,
rate-limited, and transient-error responses are never shared-cacheable.

### Event Stream

`GET /api/runs/:runId/stream` emits:

- `snapshot`: `{ run, events, artifacts }`
- `heartbeat`: `{ ts }`
- `terminal`: `{ status }`
- `error`: stream-level error

The connection lasts at most 25 seconds and clients reconnect using `retry: 2000`.

## Hosted-Sites API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `POST` | `/api/sessions` | Create a standalone or orchestrated session |
| `POST` | `/api/telemetry` | Persist and forward a hosted event |
| `GET` | `/api/sessions/:token/score` | Evaluate current session state |
| `POST` | `/api/sessions/:token/complete` | Evaluate and submit session completion |
| `GET` | `/api/sessions/advance?session=...` | Resolve the next task URL from the opaque session token |

### Create Session

Accepted fields include `runId`, `caseId`, `attemptId`, `callbackSecret`, suite metadata, `app`, task metadata, ordering, weight, required flag, title, goal, start path, seed version, and arbitrary metadata.

Response: `201` with `sessionId`, `attemptId`, opaque `token`, app/task fields, `startUrl`, goal, and title.

### Telemetry

```http
POST /api/telemetry
Content-Type: application/json

{
  "session": "opaque-token",
  "type": "page.load",
  "url": "/shopping",
  "title": "Products",
  "payload": {}
}
```

The event is appended to the runtime session, sent to the orchestrator for durable persistence, and forwarded to the Web run event API.

### Task Routes

All task routes require `?session=<token>` and reject a token belonging to a different app.

| App | Routes |
| --- | --- |
| shopping | `GET /shopping`, `POST /shopping/cart`, `GET /shopping/cart`, `POST /shopping/checkout`, `GET /shopping/order/:id` |
| wiki | `GET /wiki`, `GET /wiki/article/:slug`, `POST /wiki/answer` |
| forum | `GET /forum`, `GET /forum/thread/:id`, `POST /forum/thread/:id/reply`, `POST /forum/thread/:id/lock` |
| repo | `GET /repo`, `GET/POST /repo/file/:path/edit`, `GET/POST /repo/mr/new`, `GET /repo/mr/:id` |

## Orchestrator API

### Attempt Connection Recovery

`GET /api/attempts/connection?runId=...&caseId=...&caseRevisionId=...`
returns an existing initialized attempt connection snapshot or `404` without
creating a command. Web uses this before attempt initialization and never
reads hosted lifecycle tables directly.

### Command Dead Letters

Internal service authentication is required.

- `GET /api/commands/dead-letters?status=dead&limit=50` lists command diagnostics.
- `POST /api/commands/dead-letters/:id/replay` republishes the stored redacted
  payload with a new command ID and marks the original record replayed only
  after success. Commands that require a removed credential must be reissued
  by their source instead.

Except for `/health`, every endpoint requires the shared-secret header.

Write endpoints append a command to Redis Streams and wait for the worker result. Clients may send `x-command-id` to make retries idempotent; otherwise the API generates one.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/api/attempts/connection` | Recover an existing initialized attempt without mutation |
| `POST` | `/api/attempts/init` | Create attempt and ordered sessions |
| `GET` | `/api/attempts/:id/state` | Read normalized attempt progress |
| `POST` | `/api/attempts/:id/commands/resolve-advance` | Validate current session and return next URL |
| `POST` | `/api/attempts/:id/commands/complete-session` | Persist result, advance, aggregate if complete |
| `POST` | `/api/attempts/:id/commands/timeout` | Mark attempt timeout and complete the run |
| `POST` | `/api/sessions/:token/commands/snapshot` | Persist the current session metadata snapshot |
| `POST` | `/api/sessions/:token/commands/access` | Persist session access counters and an access-log row |
| `POST` | `/api/sessions/:token/commands/event` | Persist one hosted event |

### Initialize Attempt

```json
{
  "runId": "uuid",
  "caseId": "uuid",
  "caseRevisionId": "uuid",
  "callbackSecret": "optional",
  "generationSeed": "optional deterministic seed"
}
```

The orchestrator loads the service-role-only manifest identified by `caseRevisionId`, verifies that it belongs to `caseId`, validates the typed suite schema, and rejects missing or invalid revisions before creating sessions. Clients cannot supply or override suite sessions.

### Complete Session Command

The body contains `sessionToken`, `result`, and optional `finalState`. `result` contains `status`, `score`, `summary`, `evaluators`, and `breakdown`. Duplicate completion is idempotent and returns the latest persisted result.

### Session Persistence Commands

`snapshot` accepts `{ "metadata": { ... } }`. `access` accepts the current access count, timestamps, observed client fields, and event name. `event` accepts `{ "payload": { "type": "...", ... } }`. These authenticated commands keep hosted-sites independent from direct database writes while Redis remains the shared runtime cache.

## Error Semantics

- `400`: invalid input, missing session, or attempt/session mismatch
- `401`: missing or invalid internal shared secret
- `404`: unknown run/session/resource
- `409`: lifecycle conflict such as timeout after terminal completion
- `502`: hosted-sites could not reach orchestrator
- `500`: unexpected server failure
