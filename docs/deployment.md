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

Run multiple hosted-sites replicas:

```bash
docker-compose up -d --build --scale hosted-sites=4
```

Redis is configured through `HOSTED_SESSION_REDIS_URL=redis://redis:6379`. Replicas share session state through Redis, while Supabase remains the durable persistence and control-plane store rather than the per-request runtime cache.

Useful checks:

```bash
curl http://localhost:8080/health
docker-compose ps
docker-compose logs -f --tail=200 hosted-sites
```

Do not publish a fixed host port for each hosted-sites replica. Nginx should reach replicas through the Compose service network.

## Production Topology

The production deployment is split into:

- web on Vercel
- hosted-sites, hosted-orchestrator, Redis, and Nginx on a private Linux host
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

The hosted deployment workflow builds images, pushes them to GHCR, and runs the server deployment through a self-hosted Linux runner. The server pulls the requested image tag and recreates the Compose services.

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

The self-hosted runner must have the `self-hosted` and `linux` labels, Docker access, Docker Compose, enough disk space for images, and network access to GHCR and Supabase.

## When Manual Server Intervention Is Needed

Normal application deployments should not require SSH access. Manual intervention is usually limited to:

- first-time runner, Docker, firewall, DNS, or TLS setup
- expired GHCR credentials or changed GitHub secrets
- incompatible Compose or environment-variable changes
- failed database migrations requiring investigation
- exhausted disk, memory, file descriptors, or Docker resources
- Redis or container data recovery
- broken host networking or unavailable external dependencies

Inspect the self-hosted Actions job and container logs before changing server state manually.

## Legacy Gateway

The old MCP/Caddy path is retained only in `infra/docker/docker-compose.mcp-gateway.yml` and `infra/caddy/Caddyfile.mcp-gateway`. It is not part of the default hosted deployment.
