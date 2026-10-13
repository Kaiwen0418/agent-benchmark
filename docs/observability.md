# Observability

The optional stack includes ELK for safe request logs and Prometheus/Grafana
for request metrics. All operator interfaces remain local to the host.

## Optional ELK stack

`infra/docker/docker-compose.elk.yml` runs Elasticsearch, Logstash and Kibana
as an independent Compose project. The application does not depend on its
availability. Elasticsearch is a single-node operational search store, not a
benchmark source of truth or a replacement for the command DLQ and callback outbox.

```mermaid
flowchart LR
  Gateway[Nginx safe request logs] --> Docker[Docker GELF driver]
  Sites[Hosted-sites safe request logs] --> Docker
  API[Orchestrator safe request logs] --> Docker
  Docker -->|loopback UDP| LS[Logstash field allowlist]
  LS --> ES[(Elasticsearch: seven-day retention)]
  Kibana[Kibana: authenticated operator access] --> ES
  Sites -->|authenticated metrics| Prom[Prometheus]
  API -->|authenticated metrics| Prom
  Grafana[Grafana hosted-service dashboard] --> Prom
```

All Elastic images use the same pinned version. Elasticsearch has a 512 MiB
heap and 1.5 GiB container limit; Logstash has a 256 MiB heap, 768 MiB limit and
256 MiB persistent queue; Kibana has a 1 GiB limit. Prometheus and Grafana each
have a 512 MiB limit. Reserve roughly 5 GiB of
additional host memory plus disk headroom before enabling the stack. These
limits are a starting configuration, not a measured throughput guarantee.

## Provisioning

Prepare a protected environment file based on
`infra/docker/.env.elk.example`. Generate six independent secrets with
`openssl rand -hex 32` and set its permissions to `600`. Do not commit it.

| Setting | Development | Production |
| --- | --- | --- |
| `ELK_PROJECT_NAME` | `agentbench-development-elk` | `agentbench-production-elk` |
| `DEPLOYMENT_ENVIRONMENT` | `development` | `production` |
| `ELK_GELF_PORT` | `12202` | `12201` |
| `ELK_KIBANA_PORT` | `5602` | `5601` |
| `ELK_GRAFANA_PORT` | `3302` | `3300` |
| `ELK_RUNTIME_NETWORK` | `agentbench-local-development_default` | `agentbench-single-vm_default` |

Use different credentials in each environment. Project names isolate volumes
and networks; ports must also be distinct. On the Linux host, configure
`vm.max_map_count=262144` or higher before startup.

```bash
docker compose --env-file /protected/development-elk.env \
  -f infra/docker/docker-compose.elk.yml up -d
docker compose --env-file /protected/development-elk.env \
  -f infra/docker/docker-compose.elk.yml logs --tail=50 elk-setup logstash
```

Setup waits for Elasticsearch, provisions separate Kibana and Logstash users,
and installs the index template and seven-day ILM deletion policy. Failure
prevents Logstash and Kibana startup. Elasticsearch exposes no host port.
Kibana, Grafana and GELF bind only to loopback. HTTP between Elastic services runs on an
isolated internal Docker network; this configuration is for one trusted host,
not an untrusted network or a multi-host cluster.
The UI/ingest services also join a bridge network so Docker can publish their
loopback listeners; Elasticsearch does not join it. Prometheus alone joins
the matching application's external Compose network to scrape its services.
Start the application project first so that network exists.

Merge `docker-compose.elk-logging.yml` after the application Compose file to
enable ingestion. Use the same GELF port as the selected ELK environment:

```bash
docker compose --env-file /protected/development-runtime.env \
  --env-file /protected/development-elk.env \
  -f infra/docker/docker-compose.single-vm.yml \
  -f infra/docker/docker-compose.elk-logging.yml up -d
```

The override also works with `docker-compose.server.yml`. Changing the logging
driver recreates application containers, so schedule activation appropriately.
To persist activation through single-VM CD, set `ELK_ENV_FILE` in the protected
runtime environment file to the absolute path of the protected ELK file. The
deployment script validates the ELK project, environment and ports, provisions
the separate stack and includes the logging override on every deployment.
Development CD also runs ingestion and authenticated scrape smoke tests. Leave `ELK_ENV_FILE`
unset to disable activation. The stack does not collect Vercel logs
or Web logs yet. Workers' legacy console errors remain available in Docker's
bounded local cache but are excluded from Elasticsearch.

## Access and search

Reach development Kibana through an SSH forward:

```bash
ssh -L 5602:127.0.0.1:5602 operator@host
```

Open `http://localhost:5602`. Use the `elastic` account only for initial
administration. Create named operator users with the `agentbench_log_reader`
role; it grants read access to `agentbench-logs-*` and the default Kibana space.
An administrator creates the `agentbench-logs-*` data view using `@timestamp`.
Do not publish Kibana or the ingest port through Cloudflare Tunnel.

Useful Discover filters include `service: gateway AND status >= 500` and
`request_id: "<request-id>"`. Gateway request IDs propagate to hosted services;
direct requests receive a new UUID. Timing is normalized to milliseconds.

## Prometheus and Grafana

Forward development Grafana with `ssh -L 3302:127.0.0.1:3302 operator@host`,
then open `http://localhost:3302`. Initial login is `admin` with the independently
generated `GRAFANA_ADMIN_PASSWORD`. Anonymous access and self-registration are
disabled. Add named users and reserve the administrator account for operations.
The Prometheus datasource and AgentBench Hosted Services dashboard are provisioned
from source, including scrape health, requests/second, 5xx rate, p95/p99 request
latency and process resident memory. Low traffic needs enough observations before
rate/quantile panels have useful data.

Prometheus exposes no host port. It scrapes API-mode orchestrator and hosted-sites
every 15 seconds using a dedicated `HOSTED_METRICS_TOKEN`, not the privileged
internal service secret. `/metrics` is disabled without opt-in, requires that
bearer token, and is blocked at Nginx. Labels contain only service, coarse route
and status class. Request IDs, run/session IDs, URLs and private payloads are not
metric labels. Scrapes do not inflate request counters. Counters reset on process
restart; this is expected for Prometheus rate calculations.

Prometheus retains seven days or 2 GB of samples, whichever limit is reached
first; allow additional WAL and compaction space. Grafana and Prometheus have
independent persistent volumes. Worker queue/partition metrics, database/Redis
exporters, host metrics and alert rules remain future work.

## Privacy and retention

Only structured `http.request` records are accepted. The Logstash filter
creates a fresh event containing timestamp, environment, service, request ID,
HTTP method, coarse route category, status and duration. Each string field is
validated against a bounded format or enumeration. Query strings, IPs, URLs,
headers, tokens, bodies, exception text, evaluator inputs and arbitrary nested
JSON are never indexed. Unstructured logs are intentionally dropped rather
than relying on regex-based credential redaction. Logstash startup executes
embedded filter tests and fails if privacy or timing checks fail.

UDP and non-blocking Docker logging can lose events during downtime or overload.
The Logstash queue only protects events received by Logstash. This is diagnostic
logging, not an audit trail. Daily single-shard indices are deleted by ILM seven
days after index creation, subject to ILM polling; retention is not a hard disk
quota. Monitor disk capacity and HTTP 429/index write failures. Avoid adding
arbitrary payloads to the safe schema to diagnose an incident.

## Verification and rollback

`scripts/test-elk-config.sh`, included in `pnpm verify:ci`, validates credentials
being required, private bindings, project isolation and non-blocking transport.
Hosted-sites unit tests cover request privacy, timing and correlation.
On a Docker host, run `tests/e2e/elk-smoke.sh /protected/development-elk.env`
after startup to verify ingestion, normalization and rejection of private data.
Run `bash tests/e2e/metrics-smoke.sh <test-env-file>` to require both hosted
Prometheus targets to be healthy after application deployment.
Then make a real development hosted request and check the corresponding gateway
and service records. Do not use production lifecycle traffic for this check.

Remove the logging override and recreate the application services to disable
ingestion. Stop the separate ELK project without `--volumes` to preserve stored
logs. Neither activation nor rollback changes PostgreSQL or Redis lifecycle
state. Rotate the Logstash/Kibana passwords by updating the protected file,
rerunning `elk-setup`, and recreating their containers. Changing
`ELASTIC_PASSWORD` alone does not rotate an existing Elasticsearch superuser;
use its password-change API first and then update the file.

The transport uses Docker's [GELF driver](https://docs.docker.com/engine/logging/drivers/gelf/)
and Elastic's [GELF input](https://www.elastic.co/docs/reference/logstash/plugins/plugins-inputs-gelf).
See [Elastic Docker installation](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/docker.html)
for host requirements and image upgrades.
