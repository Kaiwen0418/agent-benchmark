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
