#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
mode="${2:-}"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

case "${target}" in
  local|development|test)
    database_url="${TEST_SUPABASE_DB_URL:-}"
    database_label="test"
    ;;
  production|prod)
    database_url="${PROD_SUPABASE_DB_URL:-}"
    database_label="production"
    ;;
  *)
    echo "Usage: scripts/db-migrate.sh <local|development|test|production> [--dry-run]" >&2
    exit 2
    ;;
esac

if [ -z "${database_url}" ]; then
  variable_name="TEST_SUPABASE_DB_URL"
  if [ "${database_label}" = "production" ]; then
    variable_name="PROD_SUPABASE_DB_URL"
  fi
  echo "${variable_name} is required for ${target} migrations." >&2
  exit 1
fi

database_url="$(DATABASE_URL="${database_url}" python3 - <<'PY'
import os
from urllib.parse import quote

url = os.environ["DATABASE_URL"]
scheme, separator, remainder = url.partition("://")
if not separator or "@" not in remainder:
    raise SystemExit("Database URL must include a scheme and credentials.")
credentials, host = remainder.rsplit("@", 1)
user, password_separator, password = credentials.partition(":")
if not password_separator:
    raise SystemExit("Database URL must include a password.")
print(f"{scheme}://{quote(user, safe='')}:{quote(password, safe='')}@{host}")
PY
)"
database_host="${database_url##*@}"
database_host="${database_host%%[:/?]*}"
echo "Applying Supabase migrations to ${database_label} database (${database_host})."

args=(db push --db-url "${database_url}" --include-all --yes)
if [ "${mode}" = "--dry-run" ]; then
  args+=(--dry-run)
elif [ -n "${mode}" ]; then
  echo "Unknown option: ${mode}" >&2
  exit 2
fi

supabase "${args[@]}"
