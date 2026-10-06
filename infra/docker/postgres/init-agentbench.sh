#!/usr/bin/env bash
set -euo pipefail

psql --set ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --set app_database="${AGENTBENCH_DATABASE_NAME}" \
  --set app_password="${AGENTBENCH_DATABASE_PASSWORD}" \
  --set app_user="${AGENTBENCH_DATABASE_USER}" <<'SQL'
select format('create role %I login password %L', :'app_user', :'app_password')
where not exists (select 1 from pg_roles where rolname = :'app_user') \gexec

select format('alter role %I with login password %L', :'app_user', :'app_password') \gexec

select format('create database %I owner %I', :'app_database', :'app_user')
where not exists (select 1 from pg_database where datname = :'app_database') \gexec
SQL
