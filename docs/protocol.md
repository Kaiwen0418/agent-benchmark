# Protocol

> [中文](./protocol.zh-CN.md) | English

## Goal

The protocol defines the contract between the cloud platform and execution runners.

All shared contracts should live in `packages/protocol`.

## Protocol Principles

- typed and versioned
- transport-agnostic where possible
- explicit authentication
- event-friendly for live observability
- backward-compatible where practical

## Core Domains

### Run Creation

Runs currently support two execution modes:

- `internal`
- `external-agent`

`internal` runs are picked up by the local runner polling loop.

`external-agent` runs are created in `waiting_for_agent` and are meant to be driven by a user-controlled agent connecting through MCP.

### Runner Registration

Used for:

- runner identity
- capabilities
- version reporting
- availability

### Run Assignment

Used for:

- benchmark selection
- agent configuration
- environment configuration
- timeouts and limits

For `external-agent` runs, assignment is not a runner queue claim. Instead, the run is activated when the agent begins using the MCP session.

### Event Streaming

Used for:

- lifecycle state changes
- tool call events
- logs
- screenshots
- trace checkpoints

Current lifecycle events:

- `run.created`
- `agent.connected`
- `run.running`
- `run.completed`
- `run.failed`

Current MCP trace events:

- `mcp.request`
- `mcp.response`
- `mcp.error`

### Artifact Reporting

Used for:

- final traces
- replay metadata
- logs
- score inputs
- attachments

## Versioning

Every benchmark run should record:

- protocol version
- runner version
- benchmark version
- scoring version

This is required for reproducibility and reliable comparisons over time.

## Current MCP Link Method

The current development-time MCP contract is:

1. web creates a run
2. the run-specific connect page returns:
   - a human-readable instruction page
   - a machine-readable JSON payload
   - a run-scoped MCP URL in local development
3. the user's local agent connects to that MCP URL
4. the first MCP request marks the run as connected and running
5. the agent ends the run with `run.complete`

Current local MCP transport:

```text
streamable_http
http://127.0.0.1:3002/mcp?runId=<run-id>
```

This is intentionally scoped to local development for now. A public authenticated remote MCP endpoint is not implemented yet.
