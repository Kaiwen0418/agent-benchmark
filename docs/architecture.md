# Architecture

## Summary

AgentBench is split into a cloud control plane and an isolated execution layer.

The cloud layer manages users, runs, metadata, scores, and replay access. The runner executes benchmark tasks inside controlled sandboxes and streams state back to the platform.

## High-level Layout

```text
Cloud SaaS Layer
  Next.js
  Supabase
  Leaderboard
  Run management
  Auth
        ↓
Runner Control Plane
        ↓
Self-hosted Linux Runner
  Docker
  Playwright
  noVNC
  MCP tools
  Mock email/file systems
```

## Major Components

### `apps/web`

User-facing SaaS application for:

- auth
- benchmark selection
- run creation
- leaderboard views
- replay and observability UI

### `apps/runner`

Self-hosted execution service responsible for:

- polling or receiving work
- preparing sandbox environments
- running benchmark tasks
- streaming status, traces, and artifacts

### `apps/mock-sites`

Deterministic target websites used by benchmark cases. These reduce dependence on public internet behavior and make runs reproducible.

### `packages/protocol`

Shared types and schemas for cloud-to-runner communication.

### `packages/mcp-tools`

Tool definitions and schemas exposed to agents inside the benchmark environment.

### `packages/test-cases`

Versioned benchmark definitions, fixtures, and deterministic task specs.

### `packages/scoring`

Run evaluation logic and result aggregation.

## Architectural Priorities

- runner isolation
- deterministic execution
- typed contracts
- replayability
- live observability

## MVP Bias

For the MVP, favor simple components and explicit boundaries over maximum flexibility.
