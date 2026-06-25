# Test Layout

Cross-workspace tests live here. Workspace-owned tests remain next to their workspace, but outside production source directories.

- `e2e/`: starts or targets multiple deployable services and validates complete user-visible flows.
- `fixtures/`: reusable immutable inputs shared by more than one workspace.
- `helpers/`: shared test utilities that do not belong to one production package.

Do not place app-specific unit helpers here. Keep them inside that app's `tests/` tree.
