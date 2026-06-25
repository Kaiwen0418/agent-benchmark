# Hosted App Extensibility

## Current Boundary

Hosted-sites discovers each `src/apps/<app-slug>` directory and generates the cross-app type, definition, and test-support registries. App routes live beside their state, actions, renderer, evaluator, and smoke driver. Shared templates use only the session start path and contain no app-specific navigation branches.

Adding a new app still requires implementing app-specific behavior. That is intentional: HTTP transitions, state mutations, evidence, and scoring semantics differ and should remain reviewed TypeScript rather than generated code.

## Recommended Next Steps

Completed:

- testcase schemas and named variant pools are app-local and the cross-app Zod registry is generated;
- `pnpm create-hosted-app <app-slug>-lite` scaffolds both implementation and testcase directories;
- the current testcase table is generated from suite metadata;
- CI compares hosted-sites and testcase definitions and rejects incomplete app directories.

Remaining:

1. Add small route factories only for repeated protocols such as a single terminal form submission. Keep complex routes explicit.
2. Add an optional command that inserts a reviewed session stub into a selected suite without choosing order, weight, or version automatically.

## Do Not Generate

- business mutations and validation rules;
- evaluator acceptance criteria;
- final evidence selection;
- task goals or hidden answers;
- multi-step route behavior.

Generating these would hide benchmark semantics in templates and make review less reliable. Automation should generate registries, consistency checks, and file skeletons, not correctness-critical behavior.
