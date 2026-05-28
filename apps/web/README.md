# Web Playground

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

The homepage now supports two local development paths:

- `Start Agent Session`
- `Run Local Demo`

`Start Agent Session` creates an `external-agent` run:

- run status starts at `waiting_for_agent`
- the UI exposes a run-specific connect page and JSON config
- in local development the payload includes:
  - `transport: streamable_http`
  - `url: http://localhost:3000/api/mcp/runs/<run-id>`
  - `Authorization: Bearer <run-scoped-token>`
- the web MCP route proxies to the runner MCP HTTP server
- the user's local agent connects to the web MCP endpoint
- the first MCP request moves the run to `running`
- the agent ends the run with `run.complete`

`Run Local Demo` keeps the older internal Playwright benchmark path for regression testing.

## Local Startup Notes

Default startup uses Docker runtime for backend services:

- `docker-compose up -d --build` (from repository root)
- this boots `mock-sites + runner mcp:http + caddy gateway`
- web app is still started with `pnpm dev:web`

`apps/mock-sites` and `runner dev:mcp:http` are separate by design:

- `mock-sites` serves deterministic benchmark pages
- `mcp:http` serves MCP tools and request/response tracing

`pnpm dev:runner` is optional unless you need internal queued run execution. For normal `Start Agent Session` testing, `web + mock-sites + mcp:http` is usually enough.

## Next Recommended Steps

1. Add real scoring for `external-agent` completion.
2. Replace the local-only MCP URL with an authenticated remote session endpoint.
3. Reuse the live Mac container for a stronger live browser stream or noVNC bridge.
4. Tighten per-run auth and isolation before public rollout.
