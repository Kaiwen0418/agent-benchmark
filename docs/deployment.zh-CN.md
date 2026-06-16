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

Nginx 是唯一网关，负责将托管任务流量转发到 hosted-sites，将 orchestrator 路径转发到 hosted-orchestrator。

## 横向扩容

启动多个 hosted-sites 和 orchestrator API 副本：

```bash
docker-compose up -d --build --scale hosted-sites=4 --scale hosted-orchestrator=2
```

Redis 通过 `HOSTED_SESSION_REDIS_URL=redis://redis:6379` 提供 session cache，通过 `ORCHESTRATOR_REDIS_URL=redis://redis:6379` 提供 command Streams。Supabase 继续承担持久化存储，orchestrator worker 是 hosted data writer。

默认 Compose 拓扑运行两个 worker，分别负责 partition `0-7` 和 `8-15`。不要对 worker service 使用 `--scale`，否则副本会争抢同一 partition。增加 worker 时，应新增 service 并将全部 partition 重新划分为互不重叠的集合。任一 partition 没有活跃 lease 时 readiness 返回 `503`。

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
- `apps/hosted-orchestrator/**` 只 build、pull 和 recreate orchestrator API 与 workers。
- 共享 scoring/runtime package 变更会重建两个镜像。
- Nginx 变更只 recreate gateway。
- Compose 拓扑变更会 reconcile 全部服务，但不会 pull 未变更的应用镜像。

Hosted-sites 与 orchestrator 使用独立 image tag。定向部署会保留当前副本数，因此扩容或部署一个服务不会重启或缩放另一个服务。

## 生产拓扑

生产部署拆分为：

- Web 部署在 Vercel
- hosted-sites、orchestrator API/workers、Redis 和 Nginx 部署在私有 Linux 主机
- Supabase 保存持久化应用数据
- GHCR 保存托管运行时镜像

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

其他分支即使手动执行 workflow，也会在访问 self-hosted runner 前失败。建议为 `production` Environment 配置审批保护规则。

托管部署 workflow 构建镜像、推送到 GHCR，并通过 Linux 上的 self-hosted GitHub Actions runner 执行服务器部署。该基础设施 agent 与已移除的 benchmark execution runner 无关。服务器根据指定 tag 拉取镜像并重建 Compose 服务。

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

可选的 Web 部署 secret：

- `VERCEL_DEPLOY_HOOK_URL`

self-hosted GitHub Actions runner 必须具有 `self-hosted` 和 `linux` 标签，能够使用 Docker 和 Docker Compose，并具备足够磁盘空间以及访问 GHCR、Supabase 的网络权限。

首次启用新的生产 Compose project 名之前，需要在服务器维护窗口停止旧的 `agentbench-hosted-sites` project，否则旧 gateway 会继续占用生产端口 `8080`。确认新配置无误后，再手动移除旧 project；development project 不应操作任何 production 容器。

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
