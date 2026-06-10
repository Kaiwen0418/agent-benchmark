# AgentBench

> [中文](./README.zh-CN.md) | English

AgentBench is an interactive benchmark platform for observing and scoring tool-using AI agents. It provides hosted, session-scoped web tasks, live run telemetry, replay, and deterministic server-side evaluation.

## Core Features

- hosted-web benchmark suites for external agents
- live run and tool-event observability
- session-scoped task state backed by Redis
- deterministic per-task and aggregate scoring
- horizontally scalable hosted-sites runtime
- self-hosted Linux deployment through Docker and GitHub Actions

## Quick Start

Requirements: Node.js, pnpm, Docker, and a configured Supabase project.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp .env.docker.example .env
docker-compose up -d --build
pnpm dev:web
```

Default local endpoints:

- Web: `http://localhost:3000`
- Hosted gateway: `http://localhost:8080`
- Health check: `http://localhost:8080/health`

See [Getting Started](./docs/getting-started.md) for environment setup and development workflows.

## System Boundary

```mermaid
flowchart LR
  Agent["External Agent Browser"] -->|"session URL"| Gateway["Nginx Gateway"]
  User["User Browser"] --> Web["apps/web"]
  Web -->|"initialize attempt"| Orchestrator["apps/hosted-orchestrator"]
  Gateway --> Sites["apps/hosted-sites replicas"]
  Gateway --> Orchestrator
  Sites <--> Redis[("Redis cache + command streams")]
  Web <--> DB[("Supabase")]
  Sites -.->|"read-only recovery"| DB
  Sites -->|"durable commands"| Orchestrator
  Orchestrator -->|"hosted writes"| DB
  Sites -->|"run events"| Web
  Orchestrator -->|"aggregate completion"| Web
```

## Repository Layout

```text
apps/
  web/                  Next.js control plane and live UI
  hosted-sites/         hosted benchmark applications
  hosted-orchestrator/  attempt lifecycle and suite orchestration
packages/
  protocol/             shared protocol contracts
  scoring/              evaluator and aggregation logic
  shared/               shared application and database types
  test-cases/           benchmark definitions and fixtures
infra/                  Docker, Nginx, and deployment scripts
supabase/               database migrations
docs/                   architecture and operational documentation
```

## Documentation

- [Documentation Index](./docs/README.md)
- [Getting Started](./docs/getting-started.md)
- [Architecture](./docs/architecture.md)
- [Hosted Web Benchmarks](./docs/hosted-web-benchmark.md)
- [Hosted Site App Authoring](./docs/hosted-site-app-authoring.zh-CN.md)
- [Deployment and Scaling](./docs/deployment.md)
- [Benchmark Specification](./docs/benchmark-spec.md)
- [API Reference](./docs/api-reference.md)
- [Data Model](./docs/data-model.md)
- [Data Flow](./docs/data-flow.md)
- [Security](./docs/security.md)
- [Orchestrator Responsibilities TODO](./docs/orchestrator-todo.md)
