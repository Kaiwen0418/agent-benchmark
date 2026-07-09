# Deployment and Scaling

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

Redis workloads are configured independently. Hosted-sites uses `HOSTED_SESSION_REDIS_URL=redis://session-redis:6379` for the session cache. Orchestrator API/workers use `ORCHESTRATOR_REDIS_URL=redis://orchestrator-redis:6379` for command Streams, locks, and response envelopes. Supabase remains the durable persistence store; orchestrator workers are its hosted-data writers.

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

- `apps/hosted-sites/**` builds, pulls, and recreates only hosted-sites and the session-cache client path.
- `apps/hosted-orchestrator/**` builds one image, then pulls and recreates only the orchestrator API and both command workers.
- shared scoring/runtime packages rebuild both images.
- Nginx changes recreate only the gateway.
- Compose topology changes pre-pull every required target image, then reconcile all services.

Hosted-sites and orchestrator use independent image tags. Targeted deploys preserve the currently running replica counts, so scaling one service does not restart or resize the other. The orchestrator API and workers always use the same immutable image tag within one environment.

Before replacing any running service, the deploy script authenticates to GHCR and pulls every required target image with bounded exponential-backoff retries. Transient registry/network failures such as timeouts, DNS failures, connection resets, 429s, and 5xx responses retry. Permanent authentication failures and missing manifests fail promptly. If the retry budget is exhausted, the script exits before `docker compose up`, leaving the previous healthy stack serving traffic.

## Production Topology

The production deployment is split into:

- web on Vercel
- hosted-sites, orchestrator API/workers, session Redis, orchestrator Redis, and Nginx on a private Linux host
- Supabase for durable application data
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

Hosted CD only accepts `develop` and `main`:

- `develop` automatically deploys through the GitHub `development` Environment, the `agentbench-dev` runner, `latest-develop` images, the `agentbench-development` Compose project, and gateway port `8081` by default.
- `main` deploys only through the GitHub `production` Environment, the `agentbench-prod` runner, `latest-main` images, the `agentbench-production` Compose project, and gateway port `8080` by default.

Manual dispatches from any other branch fail before accessing a self-hosted runner. Required CI also rejects pull requests to `main` unless their source is `develop` or `hotfix/*`. The `production` Environment should require approval and allow deployments only from `main`.

The hosted deployment workflow builds images, pushes them to GHCR, and runs the server deployment through a self-hosted GitHub Actions runner on Linux. This infrastructure agent is unrelated to the removed benchmark execution runner. The server pulls the requested image tag and recreates the Compose services.

When orchestrator code or topology changes, development deployment runs worker fault injection before the generated four-app lifecycle smoke. Each worker is stopped independently; the verifier requires the public API to remain reachable with `503` and the exact missing partition set, queues a `maintenance.cleanup` command into that worker's Redis Stream, restarts the worker, and requires both full readiness and a persisted `statusCode: 200` command result. A trap restarts the stopped worker if verification is interrupted.

The following lifecycle smoke then runs against the public development URLs. It verifies ordered completion, duplicate completion idempotency, one result per completed session, and one aggregate score per attempt. Production deployment performs baseline health checks but does not run fault injection or create smoke-test runs.

The deployment job summary records the previous and deployed orchestrator image references, tested workers, missing partitions, recovered command IDs, and rollback source SHA. To roll back, rerun the hosted deployment workflow at the recorded source SHA or pin the API and both worker services to that SHA's immutable image tag and recreate all three together. Never roll back only one orchestrator role.

Required variables in each GitHub Environment:

- `GHCR_USERNAME`
- `AGENTBENCH_WEB_URL`
- `HOSTED_SITES_PUBLIC_URL`
- `HOSTED_ORCHESTRATOR_PUBLIC_URL`
- `SUPABASE_URL`
- `GATEWAY_HTTP_PORT`

Required secrets in each GitHub Environment:

- `GHCR_PAT` with `read:packages`
- `RUNNER_SHARED_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Migration-only database secrets:

- development: `TEST_SUPABASE_DB_URL`
- production: `PROD_SUPABASE_DB_URL`

These URLs must identify different database targets. Migrations are explicit and never infer a target from the Supabase CLI linked project.

Optional web deployment secret:

- `VERCEL_DEPLOY_HOOK_URL`

Each Vercel Web project must independently configure:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_URL`
- `HOSTED_ORCHESTRATOR_URL`
- optional `GUEST_RUN_LIMIT`
- optional `RUN_CONNECT_RATE_LIMIT` (defaults to 5 requests per run and client
  address per minute on each Web instance)

Development values must point to the test hosted hostname and development Supabase target; production values must point to the production hosted hostname and database. The matching GitHub Environment `AGENTBENCH_WEB_URL` points back to that Vercel project.

All Supabase variables are server-only. Web browser bundles communicate through same-origin API routes and do not require or receive Supabase environment variables.

The self-hosted GitHub Actions runners must have `self-hosted` and `linux`, plus `agentbench-dev` for development or `agentbench-prod` for production. They need Docker access, Docker Compose, enough disk space for images, and network access to GHCR and Supabase.

The development project must never operate on production containers. `COMPOSE_PROJECT_NAME`, image channel, runner label, gateway port, public URLs, and database URL are treated as one validated environment mapping by the deployment script.

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
