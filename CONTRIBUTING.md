# Contributing to AgentBench

Thank you for contributing. Maintainers review all external changes before they can run in a deployment environment.

## Before You Start

- Search existing issues and pull requests before starting substantial work.
- Open an issue before large features, architecture changes, or destructive database migrations.
- Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).
- Never commit credentials, session tokens, production data, or private user data.

## Development Workflow

1. Fork the repository and create a short-lived branch from the latest `develop`.
2. Use `feature/<description>`, `fix/<description>`, or `chore/<description>`. Include an issue ID when one exists.
3. Install dependencies with `pnpm install --frozen-lockfile`.
4. Keep the change focused and add tests for changed behavior.
5. Run `pnpm verify:ci` before opening the pull request.
6. Open the pull request against `develop`. Only release and emergency hotfix pull requests target `main`.

Use Conventional Commit subjects such as `feat(hosted-sites): add moderation task variants`.

## Pull Request Requirements

- Explain the problem, approach, and user-visible behavior.
- Link related issues.
- Include tests and screenshots or recordings for UI changes.
- Describe database, deployment, configuration, or compatibility impact.
- Keep generated files and unrelated formatting changes out of the pull request.
- Disclose substantial AI-generated code. Contributors remain responsible for correctness, security, licensing, and tests.

Maintainers may request that a large pull request be split before review.

## Database And Deployment Changes

- Prefer additive, backward-compatible migrations.
- Do not delete or rewrite production data without an approved migration and rollback plan.
- Include deployment ordering and rollback notes when services and schema must change together.
- Changes under `.github/`, `infra/`, `scripts/db-migrate.sh`, and `supabase/migrations/` require maintainer review.
- Fork pull requests must never depend on repository secrets or self-hosted runners.

## Hosted Benchmarks

- Keep task state and evaluation deterministic.
- Do not expose evaluator answers or privileged metadata to the hosted page.
- Add tests for question variants, completion behavior, and scoring changes.
- Follow [Hosted Site App Authoring](./docs/hosted-site-app-authoring.zh-CN.md) for new hosted applications.

By submitting a contribution, you confirm that you have the right to submit it under the repository's chosen license and agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
