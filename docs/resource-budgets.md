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
