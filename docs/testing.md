# Testing

## Layout

Production source and tests have separate directory trees:

```text
apps/<app>/
  src/ or app/lib/
  tests/
    unit/
    integration/

packages/<package>/
  src/
  tests/
    unit/

tests/
  e2e/
  fixtures/
  helpers/
```

All current app and package unit tests live in `tests/unit`. Subdirectories may mirror production modules, as in `apps/hosted-sites/tests/unit/runtime`. App-specific fixtures and helpers belong under that app's `tests`; root fixtures and helpers are only for cross-workspace reuse.

Shell programs in `scripts/` are CI runners or repository invariant checks. Cross-service browser and lifecycle smoke scenarios live in `tests/e2e`.

## Test Levels

- Unit tests exercise one workspace without starting its deployable service.
- Integration tests exercise a workspace boundary such as PostgreSQL, Redis, or an internal API contract.
- E2E tests start or target multiple services and validate a complete benchmark lifecycle.
- Static invariant checks enforce architecture, secrets, generated catalog, and test placement.

## Commands

```bash
pnpm test
pnpm test:coverage
pnpm smoke:local
pnpm smoke:lifecycle
pnpm verify:ci
```

`pnpm verify:ci` is the required pre-PR command. It runs static checks, PostgreSQL integration tests, unit and coverage suites, local multi-service smoke, and production builds. `scripts/check-test-layout.sh` prevents tests from being added to production source directories.

## Adding Tests

1. Put unit tests in the owning workspace's `tests/unit` directory.
2. Put service-boundary tests in that workspace's `tests/integration` directory when one owner is clear.
3. Put cross-service scenarios in root `tests/e2e`.
4. Update the workspace `test` script or CI runner when a new test category is introduced; test discovery must never depend on implicit defaults.
5. Keep production `tsconfig` inputs focused on production code. Tests execute through `tsx` and import production modules explicitly.
