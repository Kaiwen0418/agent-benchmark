# AgentBench Development Plan

## Vision

Create a public benchmarking arena for autonomous, tool-using AI agents.

The platform should allow users to:

- connect their own agents
- run benchmark suites
- watch live execution
- compare results publicly

## Product Principle

The most valuable part of AgentBench is not only scoring. It is making agent behavior watchable.

That means early product and engineering decisions should prioritize:

- live observability
- replayability
- deterministic environments
- artifact collection
- clear failure inspection

## Phase 1 - MVP

Goal:
single-run remote browser benchmark

### Features

- Supabase auth
- create benchmark run
- self-hosted runner registration
- Playwright browser sandbox
- noVNC live stream
- basic MCP browser tools
- simple scoring
- benchmark replay
- run logs and artifacts

### Non-goals

- multi-runner orchestration
- billing
- real email or SMS
- arbitrary code execution
- public internet access
- complex scheduling

### Exit Criteria

- a user can register a runner
- a benchmark run can be created from the web app
- the runner can execute a deterministic browser task
- the browser session can be watched live
- the run produces a replayable trace and score

## Phase 2 - Tool Expansion

- file system sandbox
- mock email workflows
- mock SMS workflows
- multi-step agent tasks
- safety policy tests
- richer artifact capture

## Phase 3 - Competitive Arena

- public leaderboard
- replay sharing
- run comparison
- cost and latency metrics
- agent profiles
- benchmark suite versioning

## Phase 4 - Distributed Runners

- multi-runner scheduling
- cloud-hosted runners
- regional execution
- autoscaling
- quota and capacity controls

## Technical Debt To Watch

- keeping web and runner loosely coupled
- avoiding schema drift across services
- trace volume and storage growth
- deterministic mock systems vs product realism
- sandbox hardening before broader exposure

## Long-term Vision

AgentBench should become:

- an evaluation standard
- an agent observability platform
- a public AI arena for watching autonomous systems work
