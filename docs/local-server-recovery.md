# Local Server Recovery

The fresh recovery host is `192.168.1.131`. No historical data was imported.
The earlier GCP VM and both disks were deleted. The recovery profile uses
`infra/docker/docker-compose.single-vm.yml`.

| Environment | Compose project | Database | Web / gateway | Direct / pooled DB |
| --- | --- | --- | --- | --- |
| Production recovery | agentbench-single-vm | agentbench_production | 3000 / 8080 | 55432 / 65432 |
| Development | agentbench-local-development | agentbench_development | 3001 / 8081 | 55433 / 65433 |

All published ports bind to loopback. One host-level Cloudflare Tunnel routes
`web.project-echo.xyz` and `hosted.project-echo.xyz` to production recovery,
and `web-test.project-echo.xyz` and `hosted-test.project-echo.xyz` to development.
Tunnel routes and DNS records must both exist. Do not expose PostgreSQL or Redis
through the tunnel.

Within each Compose project, hosted services send callbacks to the Web service
over `http://web:3000`. Browser-facing connection and return links use the
separate `AGENTBENCH_WEB_PUBLIC_URL`, populated from the environment's public
`AGENTBENCH_WEB_URL`. Never use the internal Docker hostname in browser links.

Generate a separate protected environment file for development:

```bash
bash infra/scripts/init-single-vm-env.sh /protected/development.env \
  https://web-test.project-echo.xyz https://hosted-test.project-echo.xyz development
```

Omitting the last argument retains the original production recovery defaults.
Existing environment files are never overwritten. Each project owns its own
network, database, Redis instances, volumes, and independently generated secrets.
The inherited `PRODUCTION_DATABASE_*` variable names are template inputs, not
shared credentials. Always select the matching environment file for Compose,
migrations and backups. Keep separate source directories for maintenance jobs.

Both environments initially freeze OAuth and run creation. The recovery image
defaults are `latest-develop`, including the production recovery profile; this
is not a validated main-branch release. Pin verified image revisions, configure
separate OAuth apps and align CD topology before opening production admission.
The development runner uses the `agentbench-dev` label. Its account needs
Docker access and read/write access only to the development environment file so
immutable image tags can be advanced and rolled back. The
GitHub Environment variable `SINGLE_VM_ENV_FILE` may override the default
`/srv/agentbench/secrets/development.env`. Development CD reads database and
runtime configuration from that protected local file, deploys changed services
through the unified Compose project, and restores old image tags after a failed
health check. Production CD remains on its previous path until a separate
cutover is approved.

After installing the GitHub Actions runner, grant its service account the
minimum required local access:

```bash
sudo bash infra/scripts/configure-development-runner-access.sh frodo \
  /srv/agentbench/secrets/development.env
```

The script grants directory traversal to a dedicated group and group access to
the development file only. Keep the production environment file owned by root
with mode `0600`; verify the runner cannot read it before enabling deployment.

Daily local production backup and restore verification use the host's
`agentbench-backup.timer`. Local dumps do not protect against loss of this host;
encrypted off-host backups and a recovery drill remain prerequisites for public
production readiness. Test environment isolation with
`bash scripts/test-single-vm-config.sh`.
