#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

forbidden_prefix='NEXT_PUBLIC_'
forbidden_suffix='SUPABASE'
if rg -n "${forbidden_prefix}${forbidden_suffix}" . \
  --hidden \
  --glob '!**/.git/**' \
  --glob '!**/node_modules/**' \
  --glob '!**/.next/**'; then
  echo "Browser-facing Supabase environment variables are forbidden." >&2
  exit 1
fi

while IFS= read -r client_file; do
  if rg -n '@supabase|lib/supabase|SUPABASE_SERVICE_ROLE_KEY' "${client_file}"; then
    echo "Client module imports a Supabase or service-role boundary: ${client_file}" >&2
    exit 1
  fi
done < <(rg -l '^"use client";' apps/web --glob '*.{ts,tsx}')

service_role_web_files="$(rg -l 'SUPABASE_SERVICE_ROLE_KEY' apps/web --glob '*.{ts,tsx}' || true)"
while IFS= read -r service_role_file; do
  [[ -z "${service_role_file}" ]] && continue
  case "${service_role_file}" in
    apps/web/lib/supabase/admin.ts | apps/web/tests/unit/supabase-admin.test.ts)
      ;;
    *)
      echo "Service-role credentials referenced outside the Web admin boundary: ${service_role_file}" >&2
      exit 1
      ;;
  esac
done <<< "${service_role_web_files}"

echo "web secret boundary checks passed"
