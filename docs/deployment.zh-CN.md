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

启动多个 hosted-sites 副本：

```bash
docker-compose up -d --build --scale hosted-sites=4
```

Redis 通过 `HOSTED_SESSION_REDIS_URL=redis://redis:6379` 配置。多个副本通过 Redis 共享 session 运行态；Supabase 继续承担持久化和控制面存储，而不是每次请求都依赖的运行时缓存。

常用检查命令：

```bash
curl http://localhost:8080/health
docker-compose ps
docker-compose logs -f --tail=200 hosted-sites
```

不要为每个 hosted-sites 副本固定映射宿主机端口。Nginx 应通过 Compose 服务网络访问副本。

## 生产拓扑

生产部署拆分为：

- Web 部署在 Vercel
- hosted-sites、hosted-orchestrator、Redis 和 Nginx 部署在私有 Linux 主机
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

托管部署 workflow 构建镜像、推送到 GHCR，并通过 Linux 上的 self-hosted GitHub Actions runner 执行服务器部署。该基础设施 agent 与已移除的 benchmark execution runner 无关。服务器根据指定 tag 拉取镜像并重建 Compose 服务。

需要的 GitHub Secrets：

- `GHCR_USERNAME`
- 包含 `read:packages` 的 `GHCR_PAT`
- `AGENTBENCH_WEB_URL`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_PUBLIC_URL`
- `HOSTED_ORCHESTRATOR_PUBLIC_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

可选的 Web 部署 secret：

- `VERCEL_DEPLOY_HOOK_URL`

self-hosted GitHub Actions runner 必须具有 `self-hosted` 和 `linux` 标签，能够使用 Docker 和 Docker Compose，并具备足够磁盘空间以及访问 GHCR、Supabase 的网络权限。

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
