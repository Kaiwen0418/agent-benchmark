# Deployment and Scaling

## Self-hosted PostgreSQL

PostgreSQL and PgBouncer run as a dedicated Compose project so application
image deployments cannot recreate the database volume. Copy
`infra/docker/.env.database.example` to a protected host-local environment file
and start the database project:

```bash
docker compose --env-file /path/to/database.env \
  -f infra/docker/docker-compose.database.yml up -d
```

PostgreSQL direct access is bound to host loopback on port `5432` for migrations
and maintenance. PgBouncer exposes transaction-pooled application access on
port `6432` at `DATABASE_LISTEN_ADDRESS`. Restrict that listener to the private
LAN with the host firewall. The `postgres-data` named volume is persistent and
must be included in backup and restore procedures; never remove it during an
application rollback.

The PostgreSQL image creates `AGENTBENCH_DATABASE_USER` and
`AGENTBENCH_DATABASE_NAME` only while initializing a new volume. Changing the
password variable later does not rotate an existing role automatically.

Create a compressed logical backup and verify it by restoring into an isolated
temporary database on the same server:

```bash
infra/scripts/backup-postgres.sh /path/to/database.env /path/to/backups
infra/scripts/verify-postgres-backup.sh \
  /path/to/database.env /path/to/backups/agentbench-<timestamp>.dump
```

The backup directory and dump are created with owner-only permissions. Copy
verified backups to storage outside the database host and apply an independent
retention policy. Restore verification never modifies the application database.

### Development data cutover

Migrate into a newly created candidate database rather than overwriting the
current target. Apply Drizzle migrations to the candidate, freeze source writes,
finish or terminate every active run, and then run:

```bash
SOURCE_DATABASE_URL=<current-direct-url> \
TARGET_DATABASE_URL=<empty-candidate-direct-url> \
  scripts/db-transfer-data.sh
```

Use PostgreSQL 17 client tools. On the database host, set
`POSTGRES_TOOLS_CONTAINER=agentbench-database-postgres-1` to execute the client
tools inside the pinned database container instead of installing them on the
host.

The transfer uses a serializable logical snapshot, restores all application
tables in one target transaction, rebuilds the cyclic current-revision foreign
key, projects legacy Supabase profile rows onto the portable quota-only profile
schema, and requires exact per-table row counts. Legacy profile identity fields
remain only in the protected pre-cutover backup until Auth.js migration is
implemented. Historical runs without either identity receive a deterministic,
non-authenticating `legacy-migration:<run-id>` guest identifier so the portable
identity invariant remains enforced. The transfer rejects a non-empty target or
a source with active runs. After transfer, run lifecycle smoke against the
candidate before changing `DATABASE_URL`; retain both the source and the
pre-cutover target until rollback validation is complete.

#### Controlled development cutover

Do not begin this procedure until the isolated canary has passed against the
candidate using the exact release commit. Record the operator, release SHA,
source and target database names, freeze time, backup paths, and rollback start
time in the deployment issue. Never record connection URLs or credentials.

1. Disable alternate development ingress and set the GitHub `development`
   Environment variable `RUN_CREATION_MODE=frozen`. Redeploy Web and verify that
   `POST /api/runs` returns `503 run_creation_frozen` with `Retry-After`, while
   existing connection and completion routes remain available.
2. Wait for active runs to finish and for the callback outbox to drain. Run the
   preflight verifier against the source database; it fails if active runs,
   pending callbacks, database identity drift, or required schema drift exists.
3. Stop every old development writer, including legacy Web deployments,
   hosted-orchestrator API/workers, model-catalog synchronization, and any
   manually started process. Keep read-only source access for rollback.
4. Create and verify a final source backup, recreate an empty candidate, apply
   migrations, and run `scripts/db-transfer-data.sh`. Repeat the preflight
   verifier against the candidate and verify a candidate backup through an
   isolated restore before changing runtime secrets.
5. Update `DATABASE_URL` and `DATABASE_DIRECT_URL` together in the GitHub
   `development` Environment. Keep `RUN_CREATION_MODE=frozen`, deploy the Web
   and hosted projects from the same commit, then route the owned development
   hostname to the self-hosted Web port. Do not reopen the legacy Web endpoint.
6. Run the provider-neutral lifecycle smoke, browser E2E, quota and leaderboard
   checks. Then run post-cutover verification to record database connections,
   callback backlog, Redis pending/lag, service health, and container health.
7. Set `RUN_CREATION_MODE=open`, redeploy Web, and observe the same evidence at
   the start and end of the rollback window. Retain the source database, final
   source backup, and verified candidate backup until that window closes.

Preflight example:

```bash
CUTOVER_PHASE=preflight \
DATABASE_DIRECT_URL="$CANDIDATE_DATABASE_DIRECT_URL" \
EXPECTED_DATABASE_NAME=agentbench_development_candidate \
  infra/scripts/verify-development-cutover.sh
```

Post-cutover evidence example, run on the development Docker host before new
run admission is reopened:

```bash
CUTOVER_PHASE=postcutover \
DATABASE_DIRECT_URL="$DEVELOPMENT_DATABASE_DIRECT_URL" \
EXPECTED_DATABASE_NAME=agentbench_development \
AGENTBENCH_WEB_URL=https://develop-web.example.com \
HOSTED_SITES_PUBLIC_URL=https://develop-hosted.example.com \
HOSTED_ORCHESTRATOR_PUBLIC_URL=https://develop-hosted.example.com/orchestrator \
  infra/scripts/verify-development-cutover.sh | tee cutover-evidence.txt
```

#### Rollback and recovery drill

Run the drill against an isolated restored database rather than renaming or
overwriting the canonical database. Start the RTO timer before restoring or
redirecting any service, and include diagnosis and repair time in the recorded
result.

1. Freeze new runs, drain active work and callback delivery, and record the
   canonical row counts before changing runtime configuration.
2. Restore the verified backup into a newly created database. A restore using
   `--no-owner --no-privileges` does not recreate runtime ownership: set the
   restored database owner to the application role and transfer or grant the
   required ownership on the `public` and `drizzle` schemas, tables, sequences,
   views, and functions before starting an application process.
3. Use the direct PostgreSQL route to apply the current Drizzle migrations,
   then publish the benchmark catalog. Do not treat a successful connection or
   health response as proof that the restored schema is current.
4. If application traffic reaches PostgreSQL through PgBouncer, explicitly add
   the isolated database to its `[databases]` allow-list and reload PgBouncer,
   or provision an equivalent protected pooled route. Keep a copy of the
   original configuration and never expose the direct PostgreSQL listener.
5. Redirect Web and every orchestrator API/worker replica together. Verify the
   database name from each process, then run health checks, the post-cutover
   verifier, and a full lifecycle smoke against the restored database.
6. Freeze admission again, restore every replica to the canonical database,
   remove the temporary PgBouncer mapping, and stop the RTO timer only after
   canonical identity, callbacks, Redis lag, and all containers pass the same
   checks.
7. Record the restored snapshot counts, smoke run identity, RTO, failures and
   repairs in the deployment issue. Remove the isolated database and temporary
   secret-bearing environment files only after canonical verification; retain
   the verified backup for the full rollback window.

Never remove the self-hosted PostgreSQL volume as part of application rollback.

### Production migration preflight

#### Isolated candidate infrastructure

Use `infra/docker/docker-compose.database-production.yml` for the production
candidate. It owns the `agentbench-production-database` Compose project, a
separate network and `agentbench-production-database_postgres-data` volume.
It creates `agentbench_production_candidate`, owned by `agentbench_prod`, with
a distinct `agentbench_prod_admin` maintenance role. Development database
variables do not supply its passwords.

Prepare a protected host-local environment file using
`infra/docker/.env.database-production.example`. Generate separate random
application and admin passwords; keep the file outside source control with
mode `600`. Compose refuses empty passwords. Provision with:

```bash
docker compose --env-file /protected/production-database.env \
  -f infra/docker/docker-compose.database-production.yml \
  up -d --wait --wait-timeout 120
```

The direct and pooled listeners bind only to `127.0.0.1:55432` and
`127.0.0.1:65432`. These do not conflict with development's `5432/6432`.
Host-local migrations use the direct listener. A Web or orchestrator container
cannot reach the host through its own `127.0.0.1`; arrange an explicitly
protected network route to PgBouncer before deploying a canary. Do not expose
the PostgreSQL listener through a public tunnel. The candidate database name
is intentionally fixed until a separate cutover decision; changing an
initialization variable does not rename an existing database or rotate a role.

Back up this project by explicitly selecting its Compose file and using the
same environment file. Run from the repository root:

```bash
DATABASE_COMPOSE_FILE="$PWD/infra/docker/docker-compose.database-production.yml" \
  bash infra/scripts/backup-postgres.sh \
  /protected/production-database.env /protected/production-backups
DATABASE_COMPOSE_FILE="$PWD/infra/docker/docker-compose.database-production.yml" \
  bash infra/scripts/verify-postgres-backup.sh \
  /protected/production-database.env /protected/production-backups/agentbench-<timestamp>.dump
```

The default backup scripts still select the development Compose file; always
supply `DATABASE_COMPOSE_FILE` for this candidate. Local dumps are not encrypted
off-host backups. Encrypted off-host retention and measured recovery remain
production cutover requirements under #218. Retain candidate volumes and
verified dumps throughout the rollback window; application rollback must not
run `down --volumes` on a database project.

`scripts/test-production-database.sh` runs this configuration in a uniquely
named disposable project with random credentials and dynamic loopback ports.
It checks application-role privileges, PgBouncer password authentication,
Drizzle migrations, restart persistence, and the real backup/restore scripts.

#### Read-only readiness check

Production migration is a separately approved operation under issue #218. Run
the read-only preflight before any production write freeze, data transfer,
secret update, deployment, or routing change:

```bash
SOURCE_DATABASE_URL="$PRODUCTION_SOURCE_DIRECT_URL" \
TARGET_DATABASE_URL="$PRODUCTION_CANDIDATE_DIRECT_URL" \
EXPECTED_SOURCE_DATABASE_NAME=postgres \
EXPECTED_TARGET_DATABASE_NAME=agentbench_production_candidate \
VERIFIED_BACKUP_FILE=/protected/backups/agentbench-<timestamp>.dump \
RESTORE_VERIFICATION_FILE=/protected/evidence/restore-<timestamp>.txt \
  scripts/db-production-preflight.sh | tee /protected/evidence/preflight-<timestamp>.txt
```

Create `RESTORE_VERIFICATION_FILE` by capturing the output of
`verify-postgres-backup.sh` after restoring the referenced custom-format dump.
The receipt includes the dump SHA-256, and preflight rejects evidence produced
for a different backup.
The preflight requires explicit database names, refuses an identical endpoint
or a development/test target, and fails on schema drift, active runs, callback
backlog, or application rows in the candidate. Its output contains database
names and counts only; it never prints connection URLs or credentials. Passing
preflight authorizes no mutation by itself. Provisioning the production target,
freezing writes, copying data, updating secrets, deploying, and switching
traffic each remain part of the approved #218 cutover window.

## Self-hosted Web

The complete Next.js Web control plane can run as a standalone container using
standard PostgreSQL persistence. Copy
`infra/docker/.env.web.example` to a protected environment file outside source
control, then start the dedicated Compose project from the repository root:

```bash
docker compose --env-file /path/to/web.env \
  -f infra/docker/docker-compose.web.yml up -d --build
```

The service listens on `AGENTBENCH_WEB_PORT` (port `3000` by default) and
exposes `GET /api/health` for container and gateway health checks. The
`.runner-artifacts` directory is mounted as the `web-artifacts` named volume.
Cloudflare or the public reverse proxy should target this port and preserve
`Host`, `X-Forwarded-Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`.

The Web Compose project is intentionally separate from the hosted runtime
Compose project. This keeps image pulls, restarts, and rollbacks independent.
Web requires only the pooled `DATABASE_URL` for persistence; it no longer needs
Supabase URL or service-role variables. The separately deployed orchestrator
also accepts `DATABASE_URL` and uses it for migrated repositories, currently
immutable benchmark revision reads, attempt/session/result reads, and atomic
attempt/session initialization plus session recovery/snapshot persistence. It
also uses Drizzle for hosted access/event telemetry and expiry discovery. It
uses the same connection for lifecycle reads and atomic PostgreSQL completion
and timeout functions. With `DATABASE_URL` configured, every orchestrator
persistence path uses Drizzle and Supabase credentials are not required at
runtime. The Supabase fallback remains temporarily for deployments awaiting
cutover. `DATABASE_POOL_MAX` defaults to `10` per
orchestrator API/worker process, so size PgBouncer and PostgreSQL for the sum of
all replicas rather than for one container.

## Local Docker Stack

The default stack is defined by:

- [`docker-compose.yml`](../docker-compose.yml)
- [`.env.docker.example`](../.env.docker.example)
- [`infra/nginx/hosted-sites.conf`](../infra/nginx/hosted-sites.conf)

Start it with:

```bash
cp .env.docker.example .env
docker-compose up -d --build
```

Nginx is the only gateway inside Compose. It routes hosted task traffic to hosted-sites and orchestrator traffic to hosted-orchestrator.

## Horizontal Scaling

Run multiple hosted-sites and orchestrator API replicas locally:

```bash
docker-compose up -d --build --scale hosted-sites=4 --scale hosted-orchestrator=2
```

Redis workloads are configured independently. Hosted-sites uses `HOSTED_SESSION_REDIS_URL=redis://session-redis:6379` for the session cache. Orchestrator API/workers use `ORCHESTRATOR_REDIS_URL=redis://orchestrator-redis:6379` for command Streams, locks, response envelopes, and short-lived run-session read projections. `HOSTED_SESSION_PROJECTION_CACHE_TTL_SECONDS` defaults to 10 seconds. PostgreSQL is the durable persistence store; orchestrator workers own hosted-data writes through Drizzle repositories.

The local Compose topology runs two workers: partitions `0-7` and `8-15`. Do not use `--scale` on a worker service because replicas would claim the same partitions. To add workers, define additional worker services and redistribute all partitions into disjoint sets. Readiness returns `503` while any partition has no active lease.

Server Compose uses the same API/worker split. `hosted-orchestrator` serves only the API, while `hosted-orchestrator-worker-0` and `hosted-orchestrator-worker-1` own partitions `0-7` and `8-15`. The deploy script rejects missing, duplicate, or out-of-range static assignments before changing containers, and the orchestrator readiness endpoint rejects missing runtime leases.

Useful checks:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/orchestrator
docker-compose ps
docker-compose logs -f --tail=200 hosted-sites hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1
```

Do not publish a fixed host port for each hosted-sites replica. Nginx should reach replicas through the Compose service network.

## Path-Specific CD

`deploy-hosted-sites.yml` classifies each push before building or pulling images:

- `apps/web/**` builds and deploys only the standalone Web image and Compose project.
- `apps/hosted-sites/**` builds, pulls, and recreates only hosted-sites and the session-cache client path.
- `apps/hosted-orchestrator/**` builds one image, then pulls and recreates only the orchestrator API and both command workers.
- shared packages rebuild only their actual image consumers; database changes rebuild Web and orchestrator but not hosted-sites.
- Nginx changes recreate only the gateway.
- Compose topology changes pre-pull every required target image, then reconcile all services.

Web, hosted-sites, and orchestrator use independent image tags and Compose
projects where appropriate. Targeted deploys preserve the currently running
replica counts, so scaling one service does not restart or resize another. The
orchestrator API and workers always use the same immutable image tag within one environment.

### Development cutover canary

Dispatch `Deploy Hosted Sites` from the candidate feature branch with
`canary_action=deploy`. A feature-branch push never deploys the canary. The job
builds the exact commit images and starts Web, hosted-sites, the orchestrator
API/workers, Nginx, and two Redis services in the fixed
`agentbench-cutover-canary` Compose project.

The canary exposes Web on port `3182` and its gateway on port `8182`. Internal
callbacks use `http://web:3000`, and the project has its own network, Redis
containers, and volumes. The deployment script rejects mutable image tags and
any database name that does not end in `_candidate`; it cannot target the
canonical development or production database.

After readiness, the workflow runs the provider-neutral lifecycle smoke. The
smoke creates its run through Web, drives lifecycle operations through the
orchestrator API, and uses the candidate direct PostgreSQL URL only for
read-only persistence assertions. The successful canary is retained for
browser inspection and its commit tag, endpoints, and smoke result are recorded
in the workflow summary.

To remove it, dispatch the same feature branch with
`canary_action=destroy`. This runs `docker compose down --volumes
--remove-orphans` only for `agentbench-cutover-canary`; active development and
production projects are not addressed.

Before replacing any running service, the deploy script authenticates to GHCR and pulls every required target image with bounded exponential-backoff retries. Transient registry/network failures such as timeouts, DNS failures, connection resets, 429s, and 5xx responses retry. Permanent authentication failures and missing manifests fail promptly. If the retry budget is exhausted, the script exits before `docker compose up`, leaving the previous healthy stack serving traffic.

## Production Topology

The production deployment is split into:

- web on Vercel
- hosted-sites, orchestrator API/workers, session Redis, orchestrator Redis, and Nginx on a private Linux host
- PostgreSQL for durable application data
- GHCR for hosted runtime images
- Cloudflare Tunnel for environment-specific public ingress and TLS

Server configuration:

- [`infra/docker/docker-compose.server.yml`](../infra/docker/docker-compose.server.yml)
- [`infra/docker/.env.server.example`](../infra/docker/.env.server.example)

## CI/CD

Relevant workflows:

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml)
- [`.github/workflows/deploy-hosted-sites.yml`](../.github/workflows/deploy-hosted-sites.yml)
- [`.github/workflows/model-catalog-sync.yml`](../.github/workflows/model-catalog-sync.yml)

Automatic hosted CD only accepts `develop` and `main`:

- `develop` automatically deploys through the GitHub `development` Environment, the `agentbench-dev` runner, `latest-develop` images, the `agentbench-development` Compose project, and gateway port `8081` by default.
- `main` deploys only through the GitHub `production` Environment, the `agentbench-prod` runner, `latest-main` images, the `agentbench-production` Compose project, and gateway port `8080` by default.

Manual dispatches from another branch can only deploy or destroy the isolated
cutover canary. They never migrate or address development/production Compose
projects. Required CI also rejects pull requests to `main` unless their source
is `develop` or `hotfix/*`. The `production` Environment should require approval
and allow deployments only from `main`.

The hosted deployment workflow builds images, pushes them to GHCR, and runs the server deployment through a self-hosted GitHub Actions runner on Linux. This infrastructure agent is unrelated to the removed benchmark execution runner. The server pulls the requested image tag and recreates the Compose services.

When orchestrator code or topology changes, development deployment runs worker fault injection before the generated suite lifecycle smoke. Each worker is stopped independently; the verifier requires the public API to remain reachable with `503` and the exact missing partition set, queues a `maintenance.cleanup` command into that worker's Redis Stream, restarts the worker, and requires both full readiness and a persisted `statusCode: 200` command result. A trap restarts the stopped worker if verification is interrupted.

The following lifecycle smoke creates a run through the public Web API, drives
the suite through authenticated orchestrator APIs, and uses direct PostgreSQL
only for read-only persistence assertions. It verifies ordered completion,
duplicate completion idempotency, one result per completed session, and one
aggregate score per attempt without Supabase REST credentials. Production
deployment performs baseline health checks but does not run fault injection or
create smoke-test runs.

The deployment job summary records the previous and deployed orchestrator image references, tested workers, missing partitions, recovered command IDs, and rollback source SHA. To roll back, rerun the hosted deployment workflow at the recorded source SHA or pin the API and both worker services to that SHA's immutable image tag and recreate all three together. Never roll back only one orchestrator role.

Required variables in each GitHub Environment:

- `GHCR_USERNAME`
- `AGENTBENCH_WEB_URL`
- `HOSTED_SITES_PUBLIC_URL`
- `HOSTED_ORCHESTRATOR_PUBLIC_URL`
- `GATEWAY_HTTP_PORT`
- optional `AGENTBENCH_WEB_PORT` (development self-hosted Web, default `3000`)
- optional `CANARY_HOST` (self-hosted runner LAN address; defaults to `192.168.1.242`)
- optional `RUN_CREATION_MODE` (`open` normally, `frozen` during a controlled cutover)
- optional `AUTH_SIGN_IN_MODE` (`frozen` by default; set to `open` only after
  Auth.js migrations and OAuth callback verification pass)

Required secrets in each GitHub Environment:

- `GHCR_PAT` with `read:packages`
- `RUNNER_SHARED_SECRET`
- `DATABASE_URL` using a pooled PostgreSQL endpoint
- `AUTH_SECRET` generated from at least 32 random bytes
- `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` for the environment-specific GitHub OAuth App

Migration-only database secrets:

- development: `DATABASE_DIRECT_URL` for self-hosted PostgreSQL
- production before cutover: `PROD_SUPABASE_DB_URL`

The development direct URL is loopback-only from the self-hosted runner. The
production compatibility URL is removed after production migration and rollback
validation. Migration commands never infer a target from linked CLI state.

Optional web deployment secret:

- `VERCEL_DEPLOY_HOOK_URL`

Each Vercel Web project must independently configure:

- `AUTH_URL` set to that environment's public Web origin
- `DATABASE_URL` using a pooled PostgreSQL endpoint
- optional `DATABASE_POOL_MAX` (defaults to `3` connections per Web instance)
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_URL`
- `HOSTED_ORCHESTRATOR_URL`
- optional `GUEST_RUN_LIMIT`
- optional `RUN_CONNECT_RATE_LIMIT` (defaults to 5 requests per run and client
  address per minute on each Web instance)
- optional `RUN_CREATION_MODE` (`open` or `frozen`)
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET`
- optional `AUTH_SIGN_IN_MODE` (`frozen` by default)

The GitHub OAuth callback is `<web-origin>/api/auth/callback/github`. Development
and production use separate OAuth Apps and secrets. Apply the Auth.js database
migration before opening sign-in. During a database cutover or rollback drill,
set `AUTH_SIGN_IN_MODE=frozen`: existing database sessions continue to resolve,
but no new provider account or session can be created. Auth.js stores provider
identity only; GitHub access, refresh, and ID tokens are discarded during
account linking.

The self-hosted Web deployment derives `AUTH_URL` from the environment-scoped
`AGENTBENCH_WEB_URL`; it must never use the container bind address. Verify
`GET /api/auth/providers` reports the public callback URL before changing
`AUTH_SIGN_IN_MODE` to `open`.

Optional GitHub Environment secrets enable first-party model discovery:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `MOONSHOT_API_KEY`
- `DEEPSEEK_API_KEY`

The model-catalog workflow also requires `DATABASE_DIRECT_URL`. Production may
temporarily fall back to `PROD_SUPABASE_DB_URL` before its cutover. This job uses direct PostgreSQL
through Drizzle and does not require `SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY`.

The daily model-catalog workflow checks out the matching branch and invokes
`packages/model-catalog-sync` with `DATABASE_DIRECT_URL` and any provider keys
from the selected GitHub Environment. It writes directly to PostgreSQL and does
not call Vercel or Supabase REST.
OpenRouter and LiteLLM require no credential and provide supplemental discovery
for all supported providers, including Z.AI/GLM. First-party provider APIs
override aggregator display identity when available. Sources execute
sequentially to avoid conflicting upserts; an unavailable source is recorded
without deleting or downgrading existing catalog rows. Trigger the workflow
once after applying the model-catalog migration; normal hosted Compose and Web
deployments are unaffected.

Development values must point to the test hosted hostname and development database; production values must point to the production hosted hostname and database. The matching GitHub Environment `AGENTBENCH_WEB_URL` points back to that Vercel project.

Web browser bundles communicate through same-origin API routes and never receive
database credentials. `DATABASE_URL` is server-only and serves every Web
Drizzle repository. For Supabase-hosted PostgreSQL use its transaction-pool endpoint, not
the direct database endpoint; a self-hosted deployment will point the same
variable at PgBouncer.

The self-hosted GitHub Actions runners must have `self-hosted` and `linux`, plus `agentbench-dev` for development or `agentbench-prod` for production. They need Docker access, Docker Compose, enough disk space for images, and network access to GHCR and their environment's PostgreSQL endpoint.

The development project must never operate on production containers. `COMPOSE_PROJECT_NAME`, image channel, runner label, gateway port, public URLs, and database URL are treated as one validated environment mapping by the deployment script.

Command DLQ retention defaults to 14 days for unresolved `dead` records and one
day for `replayed` or `resolved` records. The maintenance sweep also retains at
most the newest 10,000 records, deletes in batches of 1,000, and runs at most
10 batches per sweep. New diagnostic payloads are limited to 16 KiB; oversized
payloads are replaced with a redacted marker containing their original size
and top-level field names. Configure
`ORCHESTRATOR_DLQ_DEAD_RETENTION_MS`,
`ORCHESTRATOR_DLQ_RESOLVED_RETENTION_MS`,
`ORCHESTRATOR_DLQ_PRUNE_BATCH_SIZE`,
`ORCHESTRATOR_DLQ_PRUNE_MAX_BATCHES`, `ORCHESTRATOR_DLQ_MAX_ROWS`, and
`ORCHESTRATOR_DLQ_MAX_PAYLOAD_BYTES` when an environment requires different
limits. Cleanup uses small `SKIP LOCKED` transactions and runs with the
orchestrator maintenance sweep; failures are logged without dead-lettering the
maintenance command itself.

After the first deployment of the bounded cleanup, PostgreSQL reuses space
freed by normal vacuuming, but the dashboard's allocated table size may not
drop immediately. Let the backlog drain, run
`VACUUM (ANALYZE) public.orchestrator_command_dead_letters`, and inspect
live/dead tuple counts. Use a separately scheduled maintenance window for
`VACUUM FULL` or index rebuilds only when returning allocated disk space is
necessary, because those operations can lock or disrupt the table.

## Cloudflare Tunnel

Cloudflare publishes separate hostnames for development and production. Each public hostname must use an HTTP origin matching the local Nginx listener:

- development hosted hostname -> `http://localhost:8081`
- production hosted hostname -> `http://localhost:8080`

Do not configure these origins as `https://localhost:<port>`; Nginx serves plain HTTP on the host port and Cloudflare provides public TLS. `HOSTED_SITES_PUBLIC_URL` and `HOSTED_ORCHESTRATOR_PUBLIC_URL` must match the corresponding public hostname and orchestrator route.

## When Manual Server Intervention Is Needed

Normal application deployments should not require SSH access. Manual intervention is usually limited to:

- first-time GitHub Actions runner, Docker, firewall, DNS, or TLS setup
- expired GHCR credentials or changed GitHub secrets
- incompatible Compose or environment-variable changes
- failed database migrations requiring investigation
- exhausted disk, memory, file descriptors, or Docker resources
- Redis or container data recovery
- broken host networking or unavailable external dependencies

Inspect the self-hosted Actions job and container logs before changing server state manually.

If GHCR remains unavailable after the retry budget:

- confirm whether the final classification is `registry-auth`, `registry-missing-image`, or `registry-transient`;
- for `registry-auth`, rotate or restore `GHCR_PAT`/`GHCR_USERNAME` before rerunning the workflow;
- for `registry-missing-image`, verify the image build job produced the immutable tag before rerunning deploy;
- for `registry-transient`, leave the current Compose stack running and rerun the workflow after registry/network recovery;
- do not manually recreate application services until the required target images are present locally.
