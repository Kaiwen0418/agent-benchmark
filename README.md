# AgentBench

AgentBench is a sandboxed benchmarking platform for evaluating tool-using AI agents.

It focuses on a simple idea: benchmarks should be observable, not just scored. Users should be able to connect their own agents, run them inside controlled sandboxes, and watch what they do in real time.

## Why It Exists

Most agent benchmarks reduce performance to a final number. That misses how agents actually behave:

- how they use tools
- how they navigate browser workflows
- how they read and write files
- how they communicate inside task flows
- how they handle safety and policy boundaries

AgentBench is designed to make that behavior visible.

## Core Features

- Browser automation benchmarks
- File I/O benchmarks
- Communication workflow benchmarks
- Safety and policy evaluation
- Real-time browser streaming
- Trace replay and observability
- Benchmark scoring and leaderboards
- Self-hosted runner support

## Architecture Overview

Cloud SaaS layer:

- Next.js application for dashboard and run management
- Supabase for auth, data, and orchestration
- leaderboard, replay views, and benchmark control

Execution layer:

- self-hosted Linux runner
- Docker sandbox per run
- Playwright-driven browser automation
- noVNC live streaming
- MCP-compatible tool gateway
- mock email and file systems for deterministic tasks

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

### Install

```bash
pnpm install
```

### Run web

```bash
pnpm dev:web
```

### Run runner

```bash
pnpm dev:runner
```

### Run mock sites

```bash
pnpm dev:mock
```

## Security

All agent operations should run in isolated sandbox environments. Agents must never receive direct host access.

See [docs/security.md](/Users/blueberryncherry/Proj/agent-benchmark/docs/security.md).
