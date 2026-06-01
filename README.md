# AgentBench

AgentBench is an interactive playground for watching tool-using AI agents work inside benchmark environments.

It focuses on a simple idea: agent evaluation should be watchable, not just scored. Users should be able to connect their own agents, start a run, and watch what the agent does in real time.

## Why It Exists

Most agent benchmarks reduce performance to a final number. That misses how agents actually behave:

- how they use tools
- how they navigate browser workflows
- how they read and write files
- how they communicate inside task flows
- how they handle safety and policy boundaries

AgentBench is designed to make that behavior visible. The current product direction is intentionally narrow:

- one homepage
- one start interaction
- one live run experience

## Core Features

- single-page run playground
- live browser-style viewing
- tool call timeline
- run-scoped hosted-web connection flow
- replay gallery
- inline integration docs
- benchmark scoring and observability

## Architecture Overview

Current web experience:

- single-page interactive homepage
- retro Mac hero
- connect panel and live run playground
- replay gallery and docs on the same page

Later infrastructure:

- Next.js application shell
- Supabase for persistence
- hosted benchmark sites
- self-hosted Linux deployment target
- session-scoped task state
- server-side hosted-web scoring
- optional legacy runner/MCP path for internal demos

## Current Hosted-Web Link Flow

Today the hosted-web connection model is:

1. the user clicks `Start Agent Session`
2. AgentBench creates a run in `waiting_for_agent`
3. the UI allocates a hosted attempt with ordered hosted sessions
4. the UI exposes an attempt-level hosted suite URL plus per-session URLs
5. the user's agent opens the hosted suite in a browser and works through the current task
6. hosted-sites emits telemetry and task signals back to AgentBench
7. hosted-sites writes per-session results, aggregates the attempt score, and completes the run

In local development the hosted benchmark endpoint defaults to:

```text
http://localhost:3003
```

The legacy MCP runner remains available for internal demos, but it is no longer the default hosted-web path.

## Monorepo Structure

```text
agentbench/
├─ apps/
│  ├─ web/
│  ├─ runner/
│  └─ hosted-sites/
├─ packages/
│  ├─ protocol/
│  ├─ mcp-tools/
│  ├─ test-cases/
│  ├─ scoring/
│  └─ shared/
├─ infra/
│  ├─ docker/
│  ├─ caddy/
│  └─ scripts/
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ docs/
│  ├─ architecture.md
│  ├─ security.md
│  ├─ runner.md
│  ├─ protocol.md
│  ├─ benchmark-spec.md
│  └─ hosted-web-benchmark.md
├─ plan.md
├─ agent.md
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
└─ README.md
```

## Quick Start

### 1) Install

```bash
pnpm install
```

### 2) Configure Supabase

```bash
cp apps/web/.env.example apps/web/.env.local
```

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_URL`

Then apply:

```bash
supabase db push
supabase db seed
```

For production web deploys, set `HOSTED_SITES_URL` to the public hosted benchmark site, for example:

```text
https://hosted.project-echo.xyz
```

### 3) Start Local Runtime (Default: Docker)

Use Docker as the default startup mode for `hosted-sites + gateway`.

```bash
cp .env.docker.example .env
docker-compose up -d --build
```

Default local endpoints:

- `http://localhost:8080/health` -> hosted-sites health
- `http://localhost:8080/attempts/<attempt-id>?session=<token>` -> hosted suite overview
- `http://localhost:8080/shopping?session=<token>` -> shopping-lite task
- `http://localhost:8080/wiki?session=<token>` -> wiki-lite task

### 4) Start web app

```bash
pnpm dev:web
```

### 5) Dev-mode startup (no Docker, optional)

If you want process-level debugging, run services directly:

```bash
pnpm dev:hosted
```

Optional internal demo worker:

```bash
pnpm dev:runner
```

## Local Process Roles

Why `hosted-sites` is the default target:

- `hosted-sites` is the hosted-web benchmark site layer for session-scoped, server-scored task apps.
- hosted-web runs use normal browser access to a session URL; the site emits telemetry and score events back to `apps/web`.
- `mock-sites`, `runner`, and MCP remain as legacy/internal demo tooling, not the primary production path.

This keeps the default runtime small:

- no server-side Chromium pool for normal hosted-web runs
- no MCP gateway dependency for the first hosted benchmark
- one long-running hosted site deployment can serve many session-scoped runs

Why `dev:runner` is optional in day-to-day external-agent testing:

- `dev:runner` is mainly for `internal` queued run execution and control-plane polling.
- `external-agent` hosted-web runs are primarily driven by `web + hosted-sites`.
- start `dev:runner` when you want local demo scenarios, job-queue regression coverage, or internal execution fallback.

Recommended startup sets:

- Hosted-web path: `dev:web` + `dev:hosted`
- Internal demo path: add `dev:runner`

## Hosted Web PoC

The current hosted-web demo benchmark is a two-step suite:

- `shopping-lite`: constrained checkout
- `wiki-lite`: retrieve and submit the release-history date

The suite is stored as one benchmark case with ordered hosted sessions and weighted required-session aggregation.

Start the hosted benchmark site:

```bash
pnpm dev:hosted
```

The web app uses `HOSTED_SITES_URL` to allocate hosted sessions. In local development it defaults to:

```text
http://localhost:3003
```

The hosted site posts events and completion back to `AGENTBENCH_WEB_URL`, defaulting to:

```text
http://localhost:3000
```

If the web app has `RUNNER_SHARED_SECRET` configured, start `hosted-sites` with the same value so event and completion callbacks are accepted.

Create a local session:

```bash
curl -X POST http://localhost:3003/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Open the returned `startUrl` or use `/api/runs/:runId/connect` from the web app to allocate a real attempt. For the default benchmark case, the agent should:

1. buy exactly one USB-C charger at or below `$30` with standard shipping and no restricted products
2. use the hosted wiki to find when `wiki-lite` followed the hosted-web suite alpha and submit the exact date

## Docker Gateway Bundle (hosted-sites + gateway)

This is the default local runtime path.

Files:

- [docker-compose.yml](/Users/blueberryncherry/Proj/agent-benchmark/docker-compose.yml)
- [Caddyfile.hosted-sites](/Users/blueberryncherry/Proj/agent-benchmark/infra/caddy/Caddyfile.hosted-sites)
- [`.env.docker.example`](/Users/blueberryncherry/Proj/agent-benchmark/.env.docker.example)

Prepare env:

```bash
cp .env.docker.example .env
```

Start:

```bash
docker-compose up -d --build
```

Stop:

```bash
docker-compose down
```

Gateway endpoint on host:

- `http://localhost:8080/health` -> hosted-sites health
- `http://localhost:8080/attempts/<attempt-id>?session=<token>` -> hosted suite overview
- `http://localhost:8080/shopping?session=<token>` -> hosted shopping task URL
- `http://localhost:8080/wiki?session=<token>` -> hosted wiki task URL

Legacy path remains available at `infra/docker/docker-compose.mcp-gateway.yml`.

## CI/CD (Vercel + Private Linux)

This repository now includes a split deployment pipeline:

- web: Vercel (automatic via Git integration, or deploy hook)
- hosted-sites: GitHub Actions -> GHCR image -> deploy on self-hosted Linux runner

Workflows:

- [ci.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/ci.yml)
- [deploy-web.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/deploy-web.yml)
- [deploy-hosted-sites.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/deploy-hosted-sites.yml)

Server compose template:

- [docker-compose.server.yml](/Users/blueberryncherry/Proj/agent-benchmark/infra/docker/docker-compose.server.yml)
- [`.env.server.example`](/Users/blueberryncherry/Proj/agent-benchmark/infra/docker/.env.server.example)

Required GitHub secrets for hosted-sites deploy:

- `GHCR_USERNAME` - used by the self-hosted deploy job when pulling private GHCR images
- `GHCR_PAT` - must belong to `GHCR_USERNAME` and include `read:packages`
- `AGENTBENCH_WEB_URL`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_PUBLIC_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Image publishing uses the workflow `GITHUB_TOKEN` with `packages: write`; no PAT is needed for the build-and-push job.

Self-hosted runner requirement:

- register a GitHub Actions self-hosted runner on your private Linux host
- runner labels must include `self-hosted` and `linux`
- `docker` and `docker-compose` must be available on that host

Optional web deploy hook secret:

- `VERCEL_DEPLOY_HOOK_URL`

## Security

All agent operations should run in isolated sandbox environments. Agents must never receive direct host access.

See [docs/security.md](/Users/blueberryncherry/Proj/agent-benchmark/docs/security.md).
