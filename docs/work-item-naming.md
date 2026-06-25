# Work Item Naming

This document defines naming rules for issues, branches, commits, and pull
requests. The goal is to make repository history searchable without encoding
mutable planning information in names.

## Issue Titles

Use:

```text
<type>(<area>): <imperative summary>
```

Examples:

```text
ops(infra): add container health checks and service self-healing
feat(web): publish failed scored runs
sec(redis): isolate service credentials
docs(repo): document work item naming
```

Allowed types:

| Type | Use |
| --- | --- |
| `feat` | New user-visible or operator-visible behavior |
| `fix` | Defect correction |
| `refactor` | Internal restructuring without intended behavior changes |
| `docs` | Documentation only |
| `test` | Test coverage or test infrastructure |
| `ci` | Continuous integration or delivery workflow |
| `ops` | Deployment, observability, availability, or operations |
| `sec` | Security hardening or vulnerability remediation |
| `perf` | Performance or capacity improvement |
| `chore` | Repository maintenance not covered above |

Prefer stable repository or service boundaries for the area:

`web`, `hosted-sites`, `orchestrator`, `redis`, `database`, `infra`,
`benchmark`, `docs`, or `repo`.

Use another concise area only when none of these identify the owner of the
change.

Do not put these values in an issue title:

- Roadmap sequence codes such as `REDIS.3`, `ARCH.2`, or `BQ.5`.
- Priority codes such as `P0.6`.
- Assignee or implementation source such as `[codex]`.
- A trailing issue number.

Planning order can change independently of the problem. Track it with project
fields, milestones, dependencies, and priority labels instead.

## Branch Names

Normal work uses:

```text
<owner>/<issue>-<type>-<short-slug>
```

Examples:

```text
codex/94-ops-container-healthchecks
kaiwen/72-refactor-session-boundaries
```

Rules:

- Branch from the latest `develop`.
- Use the GitHub username, team, or automation identity as `owner`.
- Use the primary issue number. Create an umbrella issue instead of putting
  several issue numbers in the branch name.
- Keep the slug lowercase, hyphenated, and concise.
- If a tiny change genuinely has no issue, omit only the issue segment:
  `codex/docs-fix-readme-link`.
- Use `hotfix/<short-slug>` only for an approved emergency change targeting
  `main`.
- Leave generated names such as Dependabot branches unchanged.

Delete merged branches after verifying that they have no open pull request or
active worktree.

## Commit Subjects

Use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

Examples:

```text
feat(web): publish failed scored runs
fix(orchestrator): persist failed attempt results
docs(repo): define work item naming
```

Use the same type vocabulary as issue titles. Prefer package and service names
for the scope.

Commit subjects must:

- Use lowercase type and scope.
- Describe one coherent change.
- Use imperative wording.
- Omit a trailing period.
- Stay at or below 72 characters when practical.
- Omit `[codex]`, roadmap codes, and issue numbers.

Reference issues in the commit body or footer when needed:

```text
Refs #94
```

Use `Closes #94` in the pull request body rather than repeating it on every
commit.

## Pull Requests

The pull request title uses the same format as a commit subject:

```text
<type>(<scope>): <imperative summary>
```

The pull request body must link its primary issue with `Closes #<number>` or
explain why no issue exists. Do not prefix the title with `[codex]`.

Normal pull requests:

- Target `develop`.
- Contain one coherent work item.
- Use squash merge so the pull request title becomes a clean commit on
  `develop`.

Release pull requests from `develop` to `main` and approved hotfixes may use a
merge commit when preserving the integration boundary is useful.

## Legacy Names

Do not rewrite closed issues, merged pull requests, published commits, or
historical branches only to match this convention.

Apply the convention to new work. Normalize an open issue title when it is next
triaged, and remove stale merged branches separately after checking active
pull requests and worktrees.
