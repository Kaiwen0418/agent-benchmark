# Architecture

> [中文](./architecture.zh-CN.md) | English

## Summary

AgentBench is now split into a cloud control plane, a hosted-web benchmark layer, and a legacy isolated runner layer.

The cloud layer manages users, runs, metadata, scores, and replay access. `apps/hosted-sites` serves the primary benchmark surfaces for external-agent runs. The runner remains available for internal demos, MCP tooling, and queued execution.

## High-level Layout

```text
Cloud SaaS Layer
  Next.js
  Supabase
  Leaderboard
  Run management
  Auth
        ↓
Hosted Benchmark Layer
  hosted-sites
  session-scoped task apps
  telemetry + scoring callbacks
        ↓
Legacy Runner Control Plane
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

This is no longer the default path for hosted-web external-agent runs.

### `apps/hosted-sites`

Session-scoped hosted benchmark applications used by the primary hosted-web path.

Current real apps:

- `shopping-lite`
- `wiki-lite`

Current suite model:

- one `benchmark_run`
- one `benchmark_attempt`
- multiple ordered `hosted_web_sessions`
- per-session `hosted_web_results`
- one aggregated `benchmark_attempt_scores` row

### `packages/protocol`

Shared types and schemas for cloud-to-runner communication.

### `packages/mcp-tools`

Tool definitions and schemas exposed to agents inside the benchmark environment.

### `packages/test-cases`

Versioned benchmark definitions, fixtures, and deterministic task specs.

### `packages/scoring`

Run evaluation logic and result aggregation.

## Architectural Priorities

- hosted-web suite orchestration
- runner isolation
- deterministic execution
- typed contracts
- replayability
- live observability

## MVP Bias

For the MVP, favor simple components and explicit boundaries over maximum flexibility.
