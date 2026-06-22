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
- Follow [Hosted Site App Authoring](./docs/hosted-site-app-authoring.md) for new hosted applications.

## Contribution License Grant

You retain copyright in your contribution. By submitting a contribution, you grant Kaiwen0418, as the AgentBench project owner, a perpetual, worldwide, non-exclusive, irrevocable, royalty-free, transferable, and sublicensable license to use, reproduce, modify, prepare derivative works from, publicly display, distribute, commercialize, and relicense your contribution under any terms. You also grant a corresponding patent license for patent claims you can license that are necessarily infringed by the contribution.

You represent that you have the right to grant these licenses. This grant allows the project owner to offer separate commercial licenses while keeping the public repository under the PolyForm Noncommercial License 1.0.0. By submitting a contribution, you also agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
