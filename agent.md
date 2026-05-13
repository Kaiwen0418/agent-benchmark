# AgentBench Agent Guidelines

## Stack

- TypeScript
- Next.js App Router
- Supabase
- PostgreSQL
- Playwright
- Docker
- pnpm workspace
- Turborepo

## Principles

### 1. Security First

Never expose host-level access to evaluated agents.

All execution must happen inside:

- Playwright browser contexts
- isolated workspaces
- Docker sandboxes

### 2. Runner Isolation

The runner must be independently deployable and operational without tight coupling to the SaaS app.

Do not tightly couple:

- SaaS web
- runner execution

Communication must happen through:

- typed protocol
- authenticated API
- event streams

### 3. Shared Types

All cross-service types belong in `packages/protocol`.

Never duplicate schemas between the web app, runner, and scoring layer. Use `zod` whenever possible.

### 4. Benchmark Cases

Benchmark definitions belong in `packages/test-cases`.

Cases should be:

- deterministic
- replayable
- versioned

### 5. Tool Design

MCP tools must:

- be stateless when possible
- have explicit permissions
- return structured outputs
- avoid hidden side effects

### 6. Frontend Principles

The UI should emphasize:

- live execution
- observability
- replayability
- clarity

The product should feel closer to:

- AI DevTools
- AI Arena
- Agent Observatory

Not a traditional admin dashboard.

### 7. Infrastructure

Prefer:

- Docker Compose
- simple deployments
- self-hosted compatibility

Avoid:

- Kubernetes
- heavy cloud dependencies

during the MVP stage.

### 8. Observability

Every benchmark run should record:

- tool calls
- screenshots
- traces
- timestamps
- errors
- artifacts

Replayability is a core feature, not a nice-to-have.

## Coding Conventions For Agents

- keep shared contracts in `packages/protocol`
- keep benchmark logic out of the UI layer
- treat the runner as a hostile-environment boundary
- prefer deterministic mocks over live third-party integrations
- design every run so it can be debugged after the fact
