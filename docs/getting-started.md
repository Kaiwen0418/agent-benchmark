# Getting Started

## Prerequisites

- Node.js and pnpm
- Docker with Docker Compose
- Supabase CLI and a Supabase project

## Install

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

Configure these values in `apps/web/.env.local`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_URL`
- `HOSTED_ORCHESTRATOR_URL`

Supabase variables are server-only. Browser components use same-origin `/api/*` routes and must not initialize a Supabase client.

Copy the database target example and configure the root `.env.local`:

```bash
cp .env.database.example .env.local
```

- Local development and the deployed test environment use `TEST_SUPABASE_DB_URL`.
- Production uses a separate `PROD_SUPABASE_DB_URL`.
- Migration commands never infer their target from the currently linked Supabase project.
- The migration script URL-encodes credentials in memory, including raw `%` and `@` characters, without printing the password.

Preview and apply test migrations:

```bash
pnpm db:migrate:test:dry-run
pnpm db:migrate:test
```

Production migrations are reserved for the production deployment workflow or an explicit operator action:

```bash
pnpm db:migrate:prod:dry-run
pnpm db:migrate:prod
```

## Start the Default Local Stack

The default runtime uses Docker for Redis, hosted-sites, hosted-orchestrator, and the Nginx gateway.

```bash
cp .env.docker.example .env
docker-compose up -d --build
pnpm dev:web
```

Default endpoints:

- Web UI: `http://localhost:3000`
- Gateway: `http://localhost:8080`
- hosted-sites health: `http://localhost:8080/health`
- orchestrator through gateway: `http://localhost:8080/orchestrator`

Stop the hosted stack with:

```bash
docker-compose down
```

## Process-Level Development

For direct debugging without running the hosted services in Docker:

```bash
pnpm dev:orchestrator
pnpm dev:hosted
pnpm dev:web
```

The default direct-process ports are:

- web: `3000`
- hosted-sites: `3003`
- hosted-orchestrator: `3004`

`hosted-sites` serves session-scoped benchmark applications. `hosted-orchestrator` owns attempt initialization, progression, completion, timeout handling, and aggregate scoring. Redis stores shared runtime session state so multiple hosted-sites replicas can serve the same session.

## Hosted Web Suite

The current ordered suite is defined by the published testcase catalog. See the single authoritative [current testcase table](./hosted-site-app-authoring.md#current-hosted-testcases) instead of duplicating the changing app list here.

Create a standalone local session:

```bash
curl -X POST http://localhost:3003/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Open the returned `startUrl`. A normal web run can instead allocate an attempt through `/api/runs/:runId/connect`.

Callback communication requires `AGENTBENCH_WEB_URL` and the same `RUNNER_SHARED_SECRET` in the web and hosted runtimes.

## Validation

```bash
pnpm test
pnpm build
```

See [Hosted Web Benchmarks](./hosted-web-benchmark.md) for the execution model and [Deployment and Scaling](./deployment.md) for replica testing and production deployment.
