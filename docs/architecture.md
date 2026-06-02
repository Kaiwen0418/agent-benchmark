# Architecture

> [中文](./architecture.zh-CN.md) | English

## Summary

AgentBench is now split into a cloud control plane and a hosted-web benchmark layer.

The cloud layer manages users, runs, metadata, scores, and replay access. `apps/hosted-sites` serves the benchmark surfaces for external-agent runs, and `apps/hosted-orchestrator` owns attempt lifecycle and suite progression.

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
  hosted-orchestrator
  session-scoped task apps
  telemetry + scoring callbacks
```

## Major Components

### `apps/web`

User-facing SaaS application for:

- auth
- benchmark selection
- run creation
- leaderboard views
- replay and observability UI

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

Shared types and schemas for benchmark runs and control-plane communication.

### `packages/test-cases`

Versioned benchmark definitions, fixtures, and deterministic task specs.

### `packages/scoring`

Run evaluation logic and result aggregation.

## Architectural Priorities

- hosted-web suite orchestration
- deterministic execution
- typed contracts
- replayability
- live observability

## MVP Bias

For the MVP, favor simple components and explicit boundaries over maximum flexibility.
