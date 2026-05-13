# Protocol

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

### Event Streaming

Used for:

- lifecycle state changes
- tool call events
- logs
- screenshots
- trace checkpoints

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
