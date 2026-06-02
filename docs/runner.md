# Legacy Runner

> [中文](./runner.zh-CN.md) | English

This document remains as a historical note only.

The legacy runner and MCP execution stack have been removed from the active codebase. The current production path is the hosted-web stack:

- `apps/web`
- `apps/hosted-sites`
- `apps/hosted-orchestrator`

Current execution shape:

- `apps/web` creates benchmark runs and serves the UI/control plane
- `apps/hosted-sites` serves session-scoped benchmark apps
- `apps/hosted-orchestrator` owns attempt lifecycle, suite progression, aggregation, and timeout handling

If internal queued execution is reintroduced later, it should be designed as a new service boundary rather than restoring the removed MCP/runner path.
