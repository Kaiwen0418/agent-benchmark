# Environment Resource Budgets

## Scope

The single-VM application and optional monitoring projects share one systemd
slice per environment. These are aggregate hard ceilings, not reservations:

| Environment | CPU quota | Resident memory ceiling | Slice |
| --- | --- | --- | --- |
| Production | 8 logical CPUs | 7 GiB | `agentbench-production.slice` |
| Development | 4 logical CPUs | 4 GiB | `agentbench-development.slice` |

All ten single-VM services and all seven observability services (including
setup jobs) use the same environment-specific `cgroup_parent`. Existing
per-container limits remain in force inside the shared budget. A service can
therefore hit its own limit before the environment reaches its ceiling.

CPU saturation throttles work; reaching the memory ceiling can cause a cgroup
OOM kill. Monitoring competes with application services within its environment.
The development budget deliberately cannot accommodate every container's
individual memory maximum simultaneously. Validate representative load before
enabling both environments together. The combined 11 GiB ceiling leaves roughly
4 GiB on a 15 GiB host, but does not reserve that headroom against other programs.

Host programs, GitHub runners, Cloudflare Tunnel, editor processes and model
servers outside these projects are not capped by these slices. Swap policy is
unchanged: `MemoryMax` limits resident/cgroup-accounted memory, not swap. AgentBench
does not require swap, and these limits do not clear existing swapped pages.
Standalone database and legacy server Compose projects are outside this opt-in.

## Installation And Rollout

Requirements: Linux, Docker using the systemd cgroup driver with cgroups v2,
and sudo for persistent unit installation. The installer refuses to overwrite
different existing unit files. Run from the updated repository on the host:

```bash
sudo bash infra/scripts/install-environment-resource-slices.sh
```

This only installs and starts empty resource slices. It does not start stopped
development containers, restart production, or attach existing containers.
Keep development stopped until an explicit development rollout is intended.

An operator must add the matching setting to both the protected runtime file
and its protected ELK file, preserving their existing permissions:

```dotenv
# Production runtime and production ELK files
AGENTBENCH_CGROUP_PARENT=agentbench-production.slice
```

```dotenv
# Development runtime and development ELK files
AGENTBENCH_CGROUP_PARENT=agentbench-development.slice
```

Do not copy credentials between environments. Unset configuration preserves
the previous deployment behavior; setting it opts into fail-closed preflight.
CD rejects the wrong environment, unsupported cgroups, inactive slices,
incorrect quotas and differing runtime/monitoring parents before starting
containers. Installing units alone is not evidence that limits are applied.

After deploying the updated configuration, perform a topology rollout
(`TOPOLOGY_CHANGED=true`) through the existing environment deployment workflow.
It reconciles all application services and the enabled monitoring project.
Compose recreates containers whose cgroup parent changed, including PostgreSQL
and Redis; schedule a maintenance window and verify backups first. Do not use
volume removal or expect `docker update` to move a running container to a slice.
Deploying only an application image is insufficient for the initial attachment.

## Verification

### Rootless Development

Rootless development uses a dedicated Unix user and Docker daemon. Do not grant
that user access to the rootful production Docker socket. Its aggregate ceiling
is enforced by the **host** `user-<uid>.slice`, not the rootful
`agentbench-development.slice`. This covers the user manager, rootless daemon,
application, monitoring and migration containers together. Other processes
under that user slice also count; a system-level CI runner service may live
outside it. Never use a shared production/operator user for this budget.

The operator installs the persistent dedicated-user limit:

```bash
sudo bash infra/scripts/install-rootless-development-budget.sh development-runner
```

Use your actual dedicated user name. The installer does not execute user-owned
configuration as root or restart Docker. It applies the live user-slice ceiling
and retains a persistent drop-in. This can constrain existing workloads, so
install during a development maintenance window.

Keep `AGENTBENCH_CGROUP_PARENT=agentbench-development.slice` in both development
configuration files as the environment identity. CD detects rootless Docker,
checks the actual host user-slice quota and daemon ancestry, and clears the
container `cgroup_parent` override for Compose. Containers remain beneath their
user manager, with the host slice providing the hard aggregate ceiling. Run
the checker as the actual development runner user with its rootless Docker
context and user-manager connection. It rejects a missing/mismatched budget,
unsupported cgroup backend, daemon outside the user slice and rootless production.

Rootless per-container limits still require Docker's systemd/cgroups-v2 backend
and delegated CPU/memory controllers; see [Docker rootless resource limits](https://docs.docker.com/engine/security/rootless/tips/#limiting-resources).
If delegation is missing, have an operator configure the dedicated user manager
and verify Docker reports `systemd/2`; do not bypass this by using production Docker.

Migrations stream a source-only archive into temporary container storage. They
never install dependencies into the host checkout. Rootful execution retains
the calling UID/GID; rootless execution uses container UID 0, which maps to the
unprivileged daemon owner. No privileged container or rootful socket is mounted.
For rootless development, migration preflight verifies the user budget before
starting PostgreSQL/PgBouncer and applying migrations.

Rootful and rootless daemons have independent containers, networks and volumes.
Old stopped rootful development containers are not evidence that rootless data
has been migrated. No automatic data transfer or volume deletion is performed;
approve and verify any required historical development-data transfer separately.

For rootless rollback, stop the development stack in its own Docker context,
then have an operator remove the dedicated user's persistent/runtime limit only
after all its workloads are stopped. Leave production slices and volumes alone.

### Rootful Deployment

```bash
bash infra/scripts/check-environment-resource-budget.sh production agentbench-production.slice
bash infra/scripts/check-environment-resource-budget.sh development agentbench-development.slice
systemctl show agentbench-production.slice agentbench-development.slice \
  --property=MemoryCurrent --property=MemoryMax --property=CPUQuotaPerSecUSec
docker inspect <container-name> --format '{{.HostConfig.CgroupParent}}'
```

Inspect every running service in both the application and monitoring projects;
each must report its environment's slice. Empty slices passing preflight do not
verify membership. Read `memory.events` and `cpu.stat` under the slice's reported
`ControlGroup` in `/sys/fs/cgroup` to detect OOM events and CPU throttling.
Check Web, hosted-sites and orchestrator readiness, all sixteen worker leases,
monitoring targets and collector freshness after recreation. Do not generate
production benchmark traffic merely to verify configuration.

Automated CI renders the actual Compose configuration for both environments,
checks every service's parent, validates unit quotas, and rejects invalid slice
state and cgroup backends using deterministic command fixtures. CI does not
install host units or claim to validate live kernel enforcement.

## Rollback

Remove the opt-in from both files for the affected environment and repeat a
full topology reconciliation during a maintenance window. Verify containers
have left the slice before stopping or removing its unit. Preserve database
and Redis volumes. Rolling back image tags alone does not undo cgroup placement.
