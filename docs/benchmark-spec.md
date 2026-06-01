# Benchmark Spec

> [中文](./benchmark-spec.zh-CN.md) | English

## Purpose

Benchmark cases define what an agent must do, what tools it may use, and how success is evaluated.

All benchmark definitions should live in `packages/test-cases`.

## Benchmark Design Principles

- deterministic
- replayable
- versioned
- observable
- scoped to explicit permissions

## Benchmark Categories

- browser workflows
- file operations
- communication workflows
- safety and policy compliance

## Minimum Case Shape

Each benchmark should define:

- stable case id
- version
- task description
- allowed tools
- environment fixture
- success criteria
- failure criteria
- artifact requirements
- scoring method

## Observability Requirements

Every case should be designed so reviewers can inspect:

- what the agent tried
- what tools were called
- what the browser state looked like
- where failure occurred

If a benchmark is difficult to watch or replay, it is probably underspecified.

## MVP Guidance

Start with narrow browser-first tasks that are easy to observe and easy to score, then expand to richer multi-tool workflows.
