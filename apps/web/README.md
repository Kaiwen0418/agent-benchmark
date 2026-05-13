# Web Control Plane

This app is the first-stage SaaS shell for AgentBench.

## Scope

- landing page
- login shell
- dashboard shell
- benchmark catalog
- benchmark detail and run creation
- run detail page with live browser placeholder
- runner-facing polling APIs

## Current Mode

The app is structured to support real Supabase-backed storage, but it currently includes a mock data path so the run lifecycle can be developed before the real runner is connected.

## Next Recommended Steps

1. Wire real Supabase auth actions and protected routes.
2. Replace `lib/db.ts` mock path with real Postgres access.
3. Add a mock runner script under `apps/runner`.
4. Add polling on the run detail page for events and status refresh.
