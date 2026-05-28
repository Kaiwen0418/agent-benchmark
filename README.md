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
- run-scoped MCP connection flow
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
- runner APIs and orchestration
- self-hosted Linux runner
- Docker sandbox per run
- Playwright-driven browser automation
- noVNC live streaming
- MCP-compatible tool gateway
- mock email and file systems for deterministic tasks

## Current MCP Link Flow

Today the MCP connection model is:

1. the user clicks `Start Agent Session`
2. AgentBench creates a run in `waiting_for_agent`
3. the UI exposes a run-specific connection page and JSON config
4. the user's local agent connects to a local HTTP MCP endpoint
5. the first MCP tool call moves the run to `running`
6. the agent calls `run.complete` when finished

In local development the MCP endpoint is:

```text
http://127.0.0.1:3002/mcp?runId=<run-id>
```

This is a development transport, not a public remote MCP service yet.

## Monorepo Structure

```text
agentbench/
├─ apps/
│  ├─ web/
│  ├─ runner/
│  └─ mock-sites/
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
│  └─ benchmark-spec.md
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
- `MCP_SESSION_SECRET`

Then apply:

```bash
supabase db push
supabase db seed
```

### 3) Start Local Runtime (Default: Docker)

Use Docker as the default startup mode for `mock-sites + runner mcp:http + gateway`.

```bash
cp .env.docker.example .env
docker-compose up -d --build
```

Default local endpoints:

- `http://localhost:8080/mcp` -> MCP gateway endpoint
- `http://localhost:8080/healthz` -> gateway health

### 4) Start web app

```bash
pnpm dev:web
```

### 5) Dev-mode startup (no Docker, optional)

If you want process-level debugging, run services directly:

```bash
pnpm dev:mock
pnpm --filter runner dev:mcp:http
```

Optional internal demo worker:

```bash
pnpm dev:runner
```

## Local Process Roles

Why `mock-sites` and MCP are started separately:

- `mock-sites` is the benchmark target website layer (deterministic pages like `/web-search`).
- `mcp:http` is the tool gateway layer (agent-facing MCP server exposing browser/file/email tools).

They are intentionally decoupled so you can:

- evolve benchmark UI/content without changing MCP transport
- run MCP integration tests without booting full internal runner loops
- swap target sites later (real fixtures, remote mocks) without rewriting MCP tool contracts

Why `dev:runner` is optional in day-to-day external-agent testing:

- `dev:runner` is mainly for `internal` queued run execution and control-plane polling.
- `external-agent` runs are primarily driven by `web + mcp:http (+ mock-sites)`.
- start `dev:runner` when you want local demo scenarios, job-queue regression coverage, or internal execution fallback.

Recommended startup sets:

- External-agent path (common): `dev:web` + `dev:mock` + `runner dev:mcp:http`
- Internal demo path: add `dev:runner`

## Docker Gateway Bundle (mock + MCP + gateway)

This is the default local runtime path.

Files:

- [docker-compose.yml](/Users/blueberryncherry/Proj/agent-benchmark/docker-compose.yml)
- [Caddyfile.mcp-gateway](/Users/blueberryncherry/Proj/agent-benchmark/infra/caddy/Caddyfile.mcp-gateway)
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

- `http://localhost:8080/mcp` -> runner MCP HTTP server
- `http://localhost:8080/healthz` -> gateway health

Legacy path remains available at `infra/docker/docker-compose.mcp-gateway.yml`.

## CI/CD (Vercel + Private Linux)

This repository now includes a split deployment pipeline:

- web: Vercel (automatic via Git integration, or deploy hook)
- runner stack: GitHub Actions -> GHCR images -> deploy on self-hosted Linux runner

Workflows:

- [ci.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/ci.yml)
- [deploy-web.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/deploy-web.yml)
- [deploy-runner-stack.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/deploy-runner-stack.yml)

Server compose template:

- [docker-compose.server.yml](/Users/blueberryncherry/Proj/agent-benchmark/infra/docker/docker-compose.server.yml)
- [`.env.server.example`](/Users/blueberryncherry/Proj/agent-benchmark/infra/docker/.env.server.example)

Required GitHub secrets for runner-stack deploy:

- `GHCR_USERNAME`
- `GHCR_PAT`
- `AGENTBENCH_WEB_URL`
- `RUNNER_SHARED_SECRET`
- `RUNNER_MCP_PUBLIC_BASE_URL`

Self-hosted runner requirement:

- register a GitHub Actions self-hosted runner on your private Linux host
- runner labels must include `self-hosted` and `linux`
- `docker` and `docker-compose` must be available on that host

Optional web deploy hook secret:

- `VERCEL_DEPLOY_HOOK_URL`

## Security

All agent operations should run in isolated sandbox environments. Agents must never receive direct host access.

See [docs/security.md](/Users/blueberryncherry/Proj/agent-benchmark/docs/security.md).
