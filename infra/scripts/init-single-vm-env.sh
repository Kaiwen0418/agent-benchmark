#!/usr/bin/env bash
set -euo pipefail

destination="${1:?Specify a protected output file}"
web_origin="${2:?Specify the public Web HTTPS origin}"
hosted_origin="${3:?Specify the public hosted HTTPS origin}"
environment="${4:-production}"
case "$environment" in
  production)
    project=agentbench-single-vm database=agentbench_production database_user=agentbench_prod
    web_port=3000 gateway_port=8080 direct_port=55432 pool_port=65432
    ;;
  development)
    project=agentbench-local-development database=agentbench_development database_user=agentbench_dev
    web_port=3001 gateway_port=8081 direct_port=55433 pool_port=65433
    ;;
  *) echo 'Expected production or development.' >&2; exit 1 ;;
esac
for origin in "${web_origin}" "${hosted_origin}"; do
  [[ "${origin}" =~ ^https://[a-zA-Z0-9.-]+$ ]] || {
    echo "Expected an HTTPS origin without path or query." >&2; exit 1;
  }
done
[[ ! -e "${destination}" ]] || { echo "Refusing to overwrite existing credentials." >&2; exit 1; }
umask 077
set -o noclobber
database_password="$(openssl rand -hex 32)"
cat > "${destination}" <<EOF
SINGLE_VM_PROJECT=${project}
SINGLE_VM_ENVIRONMENT=${environment}
SINGLE_VM_DATABASE_NAME=${database}
SINGLE_VM_DATABASE_USER=${database_user}
PRODUCTION_DATABASE_DIRECT_PORT=${direct_port}
PRODUCTION_DATABASE_POOL_PORT=${pool_port}
PRODUCTION_DATABASE_PASSWORD=${database_password}
PRODUCTION_DATABASE_ADMIN_PASSWORD=$(openssl rand -hex 32)
DATABASE_URL=postgresql://${database_user}:${database_password}@pgbouncer:5432/${database}
AUTH_SECRET=$(openssl rand -hex 32)
AUTH_SIGN_IN_MODE=frozen
RUNNER_SHARED_SECRET=$(openssl rand -hex 32)
RUN_CREATION_MODE=frozen
AGENTBENCH_WEB_URL=${web_origin}
HOSTED_SITES_PUBLIC_URL=${hosted_origin}
HOSTED_ORCHESTRATOR_PUBLIC_URL=${hosted_origin}/orchestrator
HOSTED_SITES_URL=http://hosted-sites:3003
HOSTED_ORCHESTRATOR_URL=http://hosted-orchestrator:3004
HOSTED_SESSION_REDIS_URL=redis://session-redis:6379
ORCHESTRATOR_REDIS_URL=redis://orchestrator-redis:6379
AGENTBENCH_WEB_PORT=127.0.0.1:${web_port}
GATEWAY_HTTP_PORT=127.0.0.1:${gateway_port}
AGENTBENCH_WEB_IMAGE=ghcr.io/kaiwen0418/agentbench-web
AGENTBENCH_WEB_IMAGE_TAG=latest-develop
HOSTED_SITES_IMAGE=ghcr.io/kaiwen0418/agentbench-hosted-sites
HOSTED_SITES_IMAGE_TAG=latest-develop
HOSTED_ORCHESTRATOR_IMAGE=ghcr.io/kaiwen0418/agentbench-hosted-orchestrator
HOSTED_ORCHESTRATOR_IMAGE_TAG=latest-develop
EOF
echo "Created protected environment file; run creation and OAuth remain frozen."
