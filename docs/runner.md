# Runner

## Purpose

The runner is the execution engine of AgentBench. It is self-hosted and responsible for running benchmark tasks inside isolated sandboxes.

## Responsibilities

- register with the control plane
- receive benchmark run assignments
- prepare isolated environments
- launch browser sessions
- expose approved tools to the evaluated agent
- collect artifacts, traces, and logs
- stream live state back to the platform

## Current Development Shape

Right now the runner is split into two local roles:

- control-plane worker
- MCP tool server

The control-plane worker:

- registers with the web app
- polls internal queued runs
- executes built-in Playwright scenarios

The MCP tool server:

- exposes browser/file/email/policy tools over MCP
- is intended for agents running in the user's local environment
- can activate an `external-agent` run without going through runner queue claim

Current local MCP endpoint:

```text
http://127.0.0.1:3002/mcp?runId=<run-id>
```

Current local MCP transport:

- `streamable_http`

## MVP Runner Model

Current MVP implementation uses:

- Node.js + TypeScript
- Playwright for browser control
- a local HTTP MCP server
- a polling worker for internal demo runs

Planned later additions:

- Docker for sandboxing
- noVNC for live viewing
- stronger remote session auth
- per-run sandbox isolation

## Execution Flow

### Internal Run

1. runner registers with the web control plane
2. a queued `internal` run is claimed
3. Playwright executes the built-in benchmark scenario
4. events, frames, score, and artifacts are reported
5. the run completes

### External-Agent Run

1. web creates an `external-agent` run in `waiting_for_agent`
2. the user gives the connect link or JSON to a local agent
3. the agent connects to the run-scoped MCP URL
4. the first MCP request marks the run `agent_connected` then `running`
5. MCP request/response events are recorded
6. the agent calls `run.complete`

## Design Constraints

- no tight dependency on the SaaS app runtime
- deterministic setup for benchmark reproducibility
- explicit resource and permission boundaries
- clear event model for live updates and replay

## Future Extensions

- multiple concurrent sandboxes
- regional runner pools
- queue-based orchestration
- richer mock system bundles
