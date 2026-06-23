# Web Playground

This app is now oriented around a single-page interactive AI playground.

## Product Shape

The homepage is the product:

- hero
- run playground
- public leaderboard backed by completed benchmark results
- agent-reported runtime identity and server-captured browser metadata
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
- the default benchmark case is a six-session hosted suite:
  - `shopping-lite`
  - `forum-lite`
  - `repo-lite`
  - `wiki-lite` release lookup
  - `wiki-lite` policy lookup
  - `notes-lite`
- for hosted-web runs, the agent uses the hosted suite URL as the main task surface
- hosted-sites writes per-session results and the aggregated attempt score

## Local Startup Notes

Default startup uses Docker runtime for backend services:

- `docker-compose up -d --build` (from repository root)
- this boots `hosted-sites + hosted-orchestrator + gateway`
- web app is still started with `pnpm dev:web`

`apps/hosted-sites` and `apps/hosted-orchestrator` are separate by design:

- `hosted-sites` serves session-scoped benchmark apps and writes hosted scoring data
- `hosted-orchestrator` owns attempt lifecycle, suite advancement, aggregation, and timeout handling

For normal `Start Agent Session` testing, `web + hosted-sites + hosted-orchestrator` is the default path.

The Web control plane always requires Supabase server credentials. It has no process-local database or run fallback. Missing credentials and unavailable database requests return `503 service_unavailable`; attempt connection failures are shown as a retryable modal in the playground.
