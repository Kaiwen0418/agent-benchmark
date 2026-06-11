# Deployment and Scaling

> [中文](./deployment.zh-CN.md) | English

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

Nginx is the only gateway. It routes hosted task traffic to hosted-sites and orchestrator traffic to hosted-orchestrator.

## Horizontal Scaling

Run multiple hosted-sites and orchestrator API replicas:

```bash
docker-compose up -d --build --scale hosted-sites=4 --scale hosted-orchestrator=2
```

Redis uses `HOSTED_SESSION_REDIS_URL=redis://redis:6379` for session cache and `ORCHESTRATOR_REDIS_URL=redis://redis:6379` for command Streams. Supabase remains the durable persistence store; orchestrator workers are its hosted-data writers.

The default Compose topology runs two workers: partitions `0-7` and `8-15`. Do not use `--scale` on a worker service because replicas would claim the same partitions. To add workers, define additional worker services and redistribute all partitions into disjoint sets. Readiness returns `503` while any partition has no active lease.

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

- `apps/hosted-sites/**` builds, pulls, and recreates only hosted-sites.
- `apps/hosted-orchestrator/**` builds, pulls, and recreates only the orchestrator API and workers.
- shared scoring/runtime packages rebuild both images.
- Nginx changes recreate only the gateway.
- Compose topology changes reconcile all services without pulling unaffected application images.

Hosted-sites and orchestrator use independent image tags. Targeted deploys preserve the currently running replica counts, so scaling one service does not restart or resize the other.

## Production Topology

The production deployment is split into:

- web on Vercel
- hosted-sites, orchestrator API/workers, Redis, and Nginx on a private Linux host
- Supabase for durable application data
- GHCR for hosted runtime images

Server configuration:

- [`infra/docker/docker-compose.server.yml`](../infra/docker/docker-compose.server.yml)
- [`infra/docker/.env.server.example`](../infra/docker/.env.server.example)

## CI/CD

Relevant workflows:

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml)
- [`.github/workflows/deploy-hosted-sites.yml`](../.github/workflows/deploy-hosted-sites.yml)

The hosted deployment workflow builds images, pushes them to GHCR, and runs the server deployment through a self-hosted GitHub Actions runner on Linux. This infrastructure agent is unrelated to the removed benchmark execution runner. The server pulls the requested image tag and recreates the Compose services.

Required GitHub secrets:

- `GHCR_USERNAME`
- `GHCR_PAT` with `read:packages`
- `AGENTBENCH_WEB_URL`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_PUBLIC_URL`
- `HOSTED_ORCHESTRATOR_PUBLIC_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional web deployment secret:

- `VERCEL_DEPLOY_HOOK_URL`

The self-hosted GitHub Actions runner must have the `self-hosted` and `linux` labels, Docker access, Docker Compose, enough disk space for images, and network access to GHCR and Supabase.

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
