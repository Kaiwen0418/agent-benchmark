# Runner

> [中文](./runner.zh-CN.md) | English

## Purpose

The runner is the legacy execution engine of AgentBench. It remains self-hosted and is used for internal queued runs, MCP tooling, and regression scenarios that still require an isolated sandbox.

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

For the current hosted-web path, external-agent runs primarily use `apps/hosted-sites` instead of the runner as the main task surface.

Current local agent-facing MCP endpoint (via web proxy):

```text
http://localhost:3000/api/mcp/runs/<run-id>
```

Current local runner upstream endpoint:

```text
http://127.0.0.1:8080/mcp?runId=<run-id>  (or container-internal runner service)
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

## Default Local Runtime

Default production-facing local startup is no longer the runner stack. The main hosted-web runtime is:

- `hosted-sites`
- `gateway`

Use the runner stack when you specifically need:

- `internal` queued run execution
- MCP transport regression coverage
- legacy local tool demos

In this mode, Cloudflare Tunnel can point at:

```text
http://localhost:8080
```

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
