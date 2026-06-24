# Hosted App Extensibility

## Current Boundary

Hosted-sites discovers each `src/apps/<app-slug>` directory and generates the cross-app type, definition, and test-support registries. App routes live beside their state, actions, renderer, evaluator, and smoke driver. Shared templates use only the session start path and contain no app-specific navigation branches.

Adding a new app still requires implementing app-specific behavior. That is intentional: HTTP transitions, state mutations, evidence, and scoring semantics differ and should remain reviewed TypeScript rather than generated code.

## Recommended Next Steps

1. Move testcase schemas and variant pools into `packages/test-cases/src/apps/<app-slug>/`, then generate the cross-app Zod registry. Suite files should only compose ordered app tasks.
2. Add `pnpm create-hosted-app <app-slug>` to scaffold the required hosted-sites and testcase files, placeholder tests, and smoke driver.
3. Generate the current testcase table in `hosted-site-app-authoring.md` from the published catalog so suite changes do not require prose edits.
4. Add small route factories only for repeated protocols such as a single terminal form submission. Keep complex routes explicit.
5. Make CI compare discovered hosted apps with testcase app definitions and fail on missing schema, test support, driver, or catalog coverage.

## Do Not Generate

- business mutations and validation rules;
- evaluator acceptance criteria;
- final evidence selection;
- task goals or hidden answers;
- multi-step route behavior.

Generating these would hide benchmark semantics in templates and make review less reliable. Automation should generate registries, consistency checks, and file skeletons, not correctness-critical behavior.
