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

database_host="$(printf '%s' "${database_url}" | sed -E 's#^[^:]+://([^@]+@)?([^/:?]+).*#\2#')"
echo "Applying Supabase migrations to ${database_label} database (${database_host})."

args=(db push --db-url "${database_url}" --include-all --yes)
if [ "${mode}" = "--dry-run" ]; then
  args+=(--dry-run)
elif [ -n "${mode}" ]; then
  echo "Unknown option: ${mode}" >&2
  exit 2
fi

supabase "${args[@]}"
