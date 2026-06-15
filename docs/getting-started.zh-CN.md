# 快速上手

> [English](./getting-started.md) | 中文

## 环境要求

- Node.js 和 pnpm
- Docker 与 Docker Compose
- Supabase CLI 和一个 Supabase 项目

## 安装

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

在 `apps/web/.env.local` 中配置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_URL`
- `HOSTED_ORCHESTRATOR_URL`

复制数据库目标示例，并在根目录 `.env.local` 中配置连接 URL：

```bash
cp .env.database.example .env.local
```

- 本地开发和部署的 test 环境统一使用 `TEST_SUPABASE_DB_URL`。
- production 使用独立的 `PROD_SUPABASE_DB_URL`。
- 不使用 Supabase CLI 当前 linked project 推断目标环境。

预览并应用 test migration：

```bash
pnpm db:migrate:test:dry-run
pnpm db:migrate:test
```

production migration 只能在 production 发布流程或明确的人工操作中执行：

```bash
pnpm db:migrate:prod:dry-run
pnpm db:migrate:prod
```

## 启动默认本地环境

默认使用 Docker 运行 Redis、hosted-sites、hosted-orchestrator 和 Nginx 网关。

```bash
cp .env.docker.example .env
docker-compose up -d --build
pnpm dev:web
```

默认地址：

- Web UI：`http://localhost:3000`
- 网关：`http://localhost:8080`
- hosted-sites 健康检查：`http://localhost:8080/health`
- 通过网关访问 orchestrator：`http://localhost:8080/orchestrator`

停止托管服务：

```bash
docker-compose down
```

## 进程级开发

需要直接调试进程时，可以不通过 Docker 启动托管服务：

```bash
pnpm dev:orchestrator
pnpm dev:hosted
pnpm dev:web
```

默认端口：

- web：`3000`
- hosted-sites：`3003`
- hosted-orchestrator：`3004`

`hosted-sites` 提供会话隔离的基准应用；`hosted-orchestrator` 负责 attempt 初始化、推进、完成、超时和聚合评分；Redis 保存共享运行态，使多个 hosted-sites 副本能够处理同一个 session。

## 托管 Web 套件

当前套件包含：

- `shopping-lite`：受限结账
- `forum-lite`：回复并管理安全主题
- `repo-lite`：修改安装说明并创建合并请求
- `wiki-lite`：检索并提交发布历史日期

创建独立本地 session：

```bash
curl -X POST http://localhost:3003/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{}'
```

打开返回的 `startUrl`。正常 Web 运行也可以通过 `/api/runs/:runId/connect` 分配 attempt。

回调通信要求 hosted runtime 配置 `AGENTBENCH_WEB_URL`，并与 Web 使用相同的 `RUNNER_SHARED_SECRET`。

## 验证

```bash
pnpm test
pnpm build
```

执行模型参见[托管 Web 基准](./hosted-web-benchmark.zh-CN.md)，副本测试和生产发布参见[部署与扩容](./deployment.zh-CN.md)。
