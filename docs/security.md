# Security

> [中文](./security.zh-CN.md) | English

## Security Model

AgentBench evaluates autonomous systems that may make unsafe or unexpected tool calls. The platform must therefore assume agents are untrusted by default.

## Core Rules

- agents never receive direct host access
- benchmark execution happens inside isolated sandboxes
- tool permissions must be explicit
- mock systems should replace real external systems during MVP
- public internet access should be disabled or tightly restricted

## Isolation Boundaries

### Runner Host

The runner host is trusted infrastructure and must not be directly exposed to evaluated agents.

### Sandbox

Each benchmark run should execute inside a disposable container or similarly isolated environment with:

- restricted filesystem scope
- limited network access
- resource controls
- auditable tool surfaces

### Browser Context

Browser actions should occur in controlled Playwright contexts tied to a single run.

## Data Handling

- store only required artifacts
- tag artifacts by run and benchmark version
- separate user data from execution data
- avoid leaking secrets into traces or screenshots
- keep Supabase row-level security enabled on user-linked data
- expose only public benchmark metadata to anonymous clients

## MVP Security Priorities

- container isolation
- authenticated runner registration
- signed or authenticated run assignment
- trace and artifact access control
- benchmark environment determinism

## Future Hardening

- stricter syscall and capability restrictions
- per-run ephemeral credentials
- policy-based tool allowlists
- automated safety regression suites
