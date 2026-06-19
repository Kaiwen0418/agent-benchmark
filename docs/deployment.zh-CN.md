# 部署与扩容

> [English](./deployment.md) | 中文

## 本地 Docker 环境

默认环境由以下文件定义：

- [`docker-compose.yml`](../docker-compose.yml)
- [`.env.docker.example`](../.env.docker.example)
- [`infra/nginx/hosted-sites.conf`](../infra/nginx/hosted-sites.conf)

启动：

```bash
cp .env.docker.example .env
docker-compose up -d --build
```

Nginx 是 Compose 内的唯一网关，负责将托管任务流量转发到 hosted-sites，将 orchestrator 路径转发到 hosted-orchestrator。

## 横向扩容

在本地启动多个 hosted-sites 和 orchestrator API 副本：

```bash
docker-compose up -d --build --scale hosted-sites=4 --scale hosted-orchestrator=2
```

Redis 通过 `HOSTED_SESSION_REDIS_URL=redis://redis:6379` 提供 session cache，通过 `ORCHESTRATOR_REDIS_URL=redis://redis:6379` 提供 command Streams。Supabase 继续承担持久化存储，orchestrator worker 是 hosted data writer。

本地 Compose 拓扑运行两个 worker，分别负责 partition `0-7` 和 `8-15`。不要对 worker service 使用 `--scale`，否则副本会争抢同一 partition。增加 worker 时，应新增 service 并将全部 partition 重新划分为互不重叠的集合。任一 partition 没有活跃 lease 时 readiness 返回 `503`。

服务器 Compose 使用相同的 API/worker 拆分。`hosted-orchestrator` 只提供 API，`hosted-orchestrator-worker-0` 和 `hosted-orchestrator-worker-1` 分别负责 partition `0-7` 与 `8-15`。部署脚本会在修改容器前拒绝缺失、重复或越界的静态分配，orchestrator readiness 则会拒绝缺少运行时 lease 的状态。

常用检查命令：

```bash
curl http://localhost:8080/health
curl http://localhost:8080/orchestrator
docker-compose ps
docker-compose logs -f --tail=200 hosted-sites hosted-orchestrator hosted-orchestrator-worker-0 hosted-orchestrator-worker-1
```

不要为每个 hosted-sites 副本固定映射宿主机端口。Nginx 应通过 Compose 服务网络访问副本。

## 按路径执行 CD

`deploy-hosted-sites.yml` 会在 build 和 pull 前对每次 push 分类：

- `apps/hosted-sites/**` 只 build、pull 和 recreate hosted-sites。
- `apps/hosted-orchestrator/**` 构建一个镜像，然后 pull 并 recreate orchestrator API 和两个 workers。
- 共享 scoring/runtime package 变更会重建两个镜像。
- Nginx 变更只 recreate gateway。
- Compose 拓扑变更会 reconcile 全部服务，但不会 pull 未变更的应用镜像。

Hosted-sites 与 orchestrator 使用独立 image tag。定向部署会保留当前副本数，因此扩容或部署一个服务不会重启或缩放另一个服务。服务器 orchestrator 处于 `all` mode 时，副本数必须保持为一。

## 生产拓扑

生产部署拆分为：

- Web 部署在 Vercel
- hosted-sites、orchestrator API/workers、Redis 和 Nginx 部署在私有 Linux 主机
- Supabase 保存持久化应用数据
- GHCR 保存托管运行时镜像
- Cloudflare Tunnel 提供各环境独立的公网 ingress 和 TLS

服务器配置：

- [`infra/docker/docker-compose.server.yml`](../infra/docker/docker-compose.server.yml)
- [`infra/docker/.env.server.example`](../infra/docker/.env.server.example)

## CI/CD

相关 workflow：

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml)
- [`.github/workflows/deploy-hosted-sites.yml`](../.github/workflows/deploy-hosted-sites.yml)

Hosted CD 只接受 `develop` 和 `main`：

- `develop` 自动部署到 GitHub `development` Environment，使用 `agentbench-dev` runner、`latest-develop` 镜像、`agentbench-development` Compose project，网关端口默认 `8081`。
- `main` 只部署到 GitHub `production` Environment，使用 `agentbench-prod` runner、`latest-main` 镜像、`agentbench-production` Compose project，网关端口默认 `8080`。

其他分支即使手动执行 workflow，也会在访问 self-hosted runner 前失败。Required CI 还会拒绝来源不是 `develop` 或 `hotfix/*` 的 main PR。`production` Environment 应要求审批，并限制只有 `main` 可以部署。

托管部署 workflow 构建镜像、推送到 GHCR，并通过 Linux 上的 self-hosted GitHub Actions runner 执行服务器部署。该基础设施 agent 与已移除的 benchmark execution runner 无关。服务器根据指定 tag 拉取镜像并重建 Compose 服务。

Development 部署成功后，workflow 会通过公网 development URL 运行动态四应用 lifecycle smoke，验证顺序完成、重复 completion 幂等性、每个已完成 session 只有一个 result，以及每个 attempt 只有一个聚合 score。Production 部署不会创建 smoke-test run。

每个 GitHub Environment 需要配置以下 Variables：

- `GHCR_USERNAME`
- `AGENTBENCH_WEB_URL`
- `HOSTED_SITES_PUBLIC_URL`
- `HOSTED_ORCHESTRATOR_PUBLIC_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `GATEWAY_HTTP_PORT`

每个 GitHub Environment 需要配置以下 Secrets：

- 包含 `read:packages` 的 `GHCR_PAT`
- `RUNNER_SHARED_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Migration 专用数据库 secrets：

- development：`TEST_SUPABASE_DB_URL`
- production：`PROD_SUPABASE_DB_URL`

两个 URL 必须指向不同数据库目标。Migration 始终显式选择目标，不使用 Supabase CLI 当前 linked project 推断。

可选的 Web 部署 secret：

- `VERCEL_DEPLOY_HOOK_URL`

每个 Vercel Web project 都必须独立配置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_URL`
- `HOSTED_ORCHESTRATOR_URL`
- 可选 `GUEST_RUN_LIMIT`

Development values 必须指向 test hosted hostname 和 development Supabase 目标；production values 必须指向 production hosted hostname 和数据库。对应 GitHub Environment 的 `AGENTBENCH_WEB_URL` 再指回该 Vercel project。

self-hosted GitHub Actions runners 必须具有 `self-hosted`、`linux`，以及 development 的 `agentbench-dev` 或 production 的 `agentbench-prod` 标签；还必须能够使用 Docker 和 Docker Compose，并具备足够磁盘空间以及访问 GHCR、Supabase 的网络权限。

Development project 不应操作任何 production 容器。部署脚本将 `COMPOSE_PROJECT_NAME`、image channel、runner label、gateway port、public URLs 和 database URL 视为一组经过校验的环境映射。

## Cloudflare Tunnel

Cloudflare 为 development 和 production 发布独立 hostname。每个公网 hostname 必须使用与本地 Nginx listener 对应的 HTTP origin：

- development hosted hostname -> `http://localhost:8081`
- production hosted hostname -> `http://localhost:8080`

不要将 origin 配置为 `https://localhost:<port>`；Nginx 在宿主机端口提供 plain HTTP，公网 TLS 由 Cloudflare 负责。`HOSTED_SITES_PUBLIC_URL` 和 `HOSTED_ORCHESTRATOR_PUBLIC_URL` 必须匹配对应公网 hostname 与 orchestrator route。

## 需要手动干预服务器的情况

正常应用发布不应要求 SSH 登录。通常只有以下情况需要手动处理：

- 首次配置 GitHub Actions runner、Docker、防火墙、DNS 或 TLS
- GHCR 凭据失效或 GitHub Secrets 发生变化
- Compose 或环境变量出现不兼容修改
- 数据库迁移失败并需要调查
- 磁盘、内存、文件描述符或 Docker 资源耗尽
- Redis 或容器数据需要恢复
- 主机网络异常或外部依赖不可用

手动修改服务器状态前，应先检查 self-hosted Actions job 和容器日志。
