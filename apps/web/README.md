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
  - `url: http://127.0.0.1:3002/mcp?runId=<run-id>`
- the user's local agent connects to that MCP endpoint
- the first MCP request moves the run to `running`
- the agent ends the run with `run.complete`

`Run Local Demo` keeps the older internal Playwright benchmark path for regression testing.

## Next Recommended Steps

1. Add real scoring for `external-agent` completion.
2. Replace the local-only MCP URL with an authenticated remote session endpoint.
3. Reuse the live Mac container for a stronger live browser stream or noVNC bridge.
4. Tighten per-run auth and isolation before public rollout.
