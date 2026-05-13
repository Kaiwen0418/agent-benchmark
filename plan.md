# AgentBench Development Plan

## Vision

Create a public playground for watching autonomous, tool-using AI agents work in real time.

The platform should allow users to:

- connect their own agents
- start a benchmark run instantly
- watch live execution
- inspect replayable traces
- share notable runs publicly

## Product Principle

The most valuable part of AgentBench is not scoring alone. It is making agent behavior watchable.

The product has now narrowed from a SaaS dashboard to a single-page interactive AI playground.

That means early decisions should prioritize:

- live observability
- visual language
- interaction pacing
- replayability
- artifact collection
- clear failure inspection
- immediate feedback after pressing start

## P0 - Interactive Playground

Goal:
prove that "watching AI work" is compelling before building heavy infrastructure

### Scope

- single homepage with four sections
- hero with retro Mac visual language
- run playground layout
- fake run system
- fake live browser area
- timeline that updates in real time
- bottom panels for events, files, screenshots, and score
- replay gallery section
- inline docs section

### Non-goals

- Supabase auth
- real database writes
- real runner registration
- Docker sandbox
- Playwright
- noVNC
- real MCP execution
- billing
- multi-runner orchestration

### Exit Criteria

- a user can press Start Run
- the interface immediately feels alive
- fake browser activity is understandable
- timeline updates improve comprehension
- the product feels like a live AI playground rather than an admin surface

## P1 - Real Web Backend

Goal:
replace local fake run state with real persisted run state

### Scope

- Supabase
- run tables
- event persistence
- real polling or lightweight streaming
- replay metadata
- basic run history

## P2 - Real Runner Execution

### Scope

- Docker sandbox
- Playwright browser control
- real screenshots and traces
- noVNC or browser stream embedding
- mock files and communication surfaces

## P3 - Real Agent Integrations

### Scope

- MCP agent connection
- OpenAI Agents SDK
- Claude Code style integrations
- browser-use and similar tool stacks

## Technical Debt To Watch

- keeping the product focused on observability instead of drifting back into dashboard complexity
- preserving the single-page interaction loop as real backend layers are added
- avoiding schema drift once backend persistence returns
- trace volume and replay storage growth
- sandbox hardening before public execution

## Long-term Vision

AgentBench should become:

- the best place to watch agents work
- an agent observability platform
- a public arena for memorable AI runs
