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

## MVP Runner Model

For the MVP, the runner should be a Linux service with:

- Docker for sandboxing
- Playwright for browser control
- noVNC for live viewing
- a small authenticated protocol client

## Execution Flow

1. runner registers with the cloud control plane
2. a run is assigned to the runner
3. the runner provisions a sandbox
4. benchmark fixtures and tools are mounted
5. the agent executes the task
6. traces and artifacts are uploaded
7. the sandbox is destroyed

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
