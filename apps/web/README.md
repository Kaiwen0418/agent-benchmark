# Web Playground

> [中文](./README.zh-CN.md) | English

This app is now oriented around a single-page interactive AI playground.

## Product Shape

The homepage is the product:

- hero
- run playground
- replay gallery
- docs

The core interaction is:

- click start
- give a run link or config to an agent
- watch the run activate and stream back

## Current Mode

The homepage is now centered on one primary path:

- `Start Agent Session`

`Start Agent Session` creates an `external-agent` run:

- run status starts at `waiting_for_agent`
- the UI allocates a hosted attempt with one or more ordered hosted sessions
- the connect page and JSON config expose an attempt-level hosted suite URL plus per-session details
- the default benchmark case is a two-step hosted suite:
  - `shopping-lite`
  - `wiki-lite`
- when `AGENTBENCH_MCP_BASE_URL` and `MCP_SESSION_SECRET` are configured, the payload includes:
  - `transport: streamable_http`
  - `url: <web-origin>/api/mcp/runs/<run-id>`
  - `Authorization: Bearer <run-scoped-token>`
- the legacy web MCP route can still proxy to the runner MCP HTTP server
- for hosted-web runs, the agent primarily uses the hosted suite URL instead of MCP as the main task surface
- hosted-sites writes per-session results and the aggregated attempt score

## Local Startup Notes

Default startup uses Docker runtime for backend services:

- `docker-compose up -d --build` (from repository root)
- this boots `hosted-sites + gateway`
- web app is still started with `pnpm dev:web`

`apps/hosted-sites` and the legacy runner/MCP stack are separate by design:

- `hosted-sites` serves session-scoped benchmark apps and writes hosted scoring data
- `mcp:http` serves MCP tools and request/response tracing when you still need the legacy tool path

`pnpm dev:runner` is optional unless you need internal queued run execution or MCP regression testing. For normal `Start Agent Session` testing, `web + hosted-sites` is the default path.

## Next Recommended Steps

1. Replace the lightweight attempt overview with a server-owned orchestrator state machine.
2. Persist richer session progress so `advance` no longer depends on in-memory state.
3. Tighten per-run auth and isolation before public rollout.
