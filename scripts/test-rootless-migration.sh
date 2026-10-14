#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
mkdir -p "$temporary/bin"
cp "$ROOT_DIR/tests/fixtures/rootless-migration/docker" "$temporary/bin/docker"
cp "$ROOT_DIR/tests/fixtures/resource-budgets/"{id,systemctl} "$temporary/bin/"
chmod +x "$temporary/bin/"*
touch "$temporary/runtime.env"
export FAKE_ARGUMENTS="$temporary/arguments" FAKE_ARCHIVE="$temporary/archive"
initializer="$ROOT_DIR/infra/scripts/initialize-single-vm-database.sh"
PATH="$temporary/bin:$PATH" bash "$initializer" "$temporary/runtime.env"
grep -Fq -- '--user 1002:1002' "$FAKE_ARGUMENTS"
PATH="$temporary/bin:$PATH" FAKE_SECURITY_OPTIONS='["name=rootless"]' \
  bash "$initializer" "$temporary/runtime.env"
grep -Fq -- '--user 0:0' "$FAKE_ARGUMENTS"
grep -Fq -- 'up -d --wait postgres pgbouncer parent=' "$FAKE_ARGUMENTS"
if grep -Eq 'node_modules|(^|/)\.env|(^|/)dist/' "$FAKE_ARCHIVE" || grep -Eq ' (-v|--mount) ' "$FAKE_ARGUMENTS"; then
  echo 'Migration leaked host dependencies/configuration or bind-mounted the checkout.' >&2; exit 1
fi
grep -Fxq package.json "$FAKE_ARCHIVE"
grep -Fxq scripts/db-migrate.sh "$FAKE_ARCHIVE"
before="$(wc -l < "$FAKE_ARGUMENTS")"
if PATH="$temporary/bin:$PATH" FAKE_SECURITY_OPTIONS='["name=rootless"]' FAKE_PROJECT=agentbench-single-vm \
  bash "$initializer" "$temporary/runtime.env" >/dev/null 2>&1; then
  echo 'Rootless migration accepted production.' >&2; exit 1
fi
[[ "$(wc -l < "$FAKE_ARGUMENTS")" == "$before" ]]
echo 'Rootful/rootless isolated migration workspace tests passed.'
