# Security Policy

## Reporting A Vulnerability

Do not report security vulnerabilities in public issues, discussions, or pull requests.

Use GitHub's private vulnerability reporting feature from the repository Security tab. Include the affected component, reproduction steps, impact, and any suggested mitigation. Do not include real user data or active credentials.

If private vulnerability reporting is unavailable, contact the repository owner through their GitHub profile and request a private reporting channel without disclosing vulnerability details publicly.

Maintainers will acknowledge a complete report when available, investigate it privately, and coordinate disclosure after a fix or mitigation is ready. No fixed response or remediation time is guaranteed.

## Supported Versions

Only the latest commit deployed from `main` is supported with security fixes. Development builds and historical commits are not supported releases.

## Scope

The application security architecture and current hardening backlog are documented in [docs/security.md](./docs/security.md). Reports about leaked credentials, authorization bypasses, cross-session data access, evaluator answer exposure, unsafe deployment workflows, and hosted-site isolation are in scope.
