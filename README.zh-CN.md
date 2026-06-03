# AgentBench

> [English](./README.md) | 中文

AgentBench 是一个交互式游乐场，用于观察使用工具的 AI 代理在基准测试环境中实时工作。

它围绕一个简单的理念：代理评估应该是可观察的，而不仅仅是打分。用户应该能够连接自己的代理，启动一次运行，并实时观察代理在做什么。

## 为什么存在

大多数代理基准测试将性能简化为一个最终数字。这忽略了代理的实际行为方式：

- 它们如何使用工具
- 它们如何浏览浏览器工作流
- 它们如何读写文件
- 它们如何在任务流中通信
- 它们如何处理安全和策略边界

AgentBench 旨在让这些行为变得可见。当前的产品方向有意保持精简：

- 一个首页
- 一个启动交互
- 一个实时运行体验

## 核心功能

- 单页运行游乐场
- 实时浏览器式查看
- 工具调用时间线
- 运行级托管 Web 连接流
- 回放画廊
- 内联集成文档
- 基准测试评分和可观测性

## 架构概览

当前的 Web 体验：

- 单页交互式首页
- 复古 Mac 主视觉
- 连接面板和实时运行游乐场
- 同一页面上的回放画廊和文档

后续基础设施：

- Next.js 应用外壳
- Supabase 持久化
- 托管基准测试站点
- 自托管 Linux 部署目标
- 会话级任务状态
- 服务器端托管 Web 评分
- 可选的传统 runner/MCP 路径用于内部演示

## 当前托管 Web 链接流程

今天的托管 Web 连接模型如下：

1. 用户点击 `Start Agent Session`
2. AgentBench 创建一个处于 `waiting_for_agent` 状态的运行
3. UI 分配一个带有有序托管会话的尝试
4. UI 暴露一个尝试级托管套件 URL 以及每个会话的 URL
5. 用户的代理在浏览器中打开托管套件并完成当前任务
6. hosted-sites 向 AgentBench 发送遥测数据和任务信号
7. hosted-sites 写入每个会话的结果，汇总尝试分数，并完成运行

在本地开发中，托管基准测试端点默认为：

```text
http://localhost:3003
```

传统的 MCP runner 仍然可用于内部演示，但它不再是默认的托管 Web 路径。

##  Monorepo 结构

```text
agentbench/
├─ apps/
│  ├─ web/
│  ├─ runner/
│  └─ hosted-sites/
├─ packages/
│  ├─ protocol/
│  ├─ mcp-tools/
│  ├─ test-cases/
│  ├─ scoring/
│  └─ shared/
├─ infra/
│  ├─ docker/
│  ├─ caddy/
│  └─ scripts/
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ docs/
│  ├─ architecture.md
│  ├─ security.md
│  ├─ runner.md
│  ├─ protocol.md
│  ├─ benchmark-spec.md
│  └─ hosted-web-benchmark.md
├─ plan.md
├─ agent.md
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
└─ README.md
```

## 快速开始

### 1) 安装

```bash
pnpm install
```

### 2) 配置 Supabase

```bash
cp apps/web/.env.example apps/web/.env.local
```

设置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_URL`
- `HOSTED_ORCHESTRATOR_URL`

然后应用：

```bash
supabase db push
supabase db seed
```

对于生产环境 Web 部署，将 `HOSTED_SITES_URL` 设置为公共托管基准站点，例如：

```text
https://hosted.project-echo.xyz
```

将 `HOSTED_ORCHESTRATOR_URL` 设置为同域名下的公共 orchestrator 路径，例如：

```text
https://hosted.project-echo.xyz/orchestrator
```

### 3) 启动本地运行时（默认：Docker）

使用 Docker 作为 `hosted-sites + hosted-orchestrator + gateway` 的默认启动模式。

```bash
cp .env.docker.example .env
docker-compose up -d --build
```

默认本地端点：

- `http://localhost:8080/health` -> hosted-sites 健康检查
- `http://localhost:8080/attempts/<attempt-id>?session=<token>` -> 托管套件概览
- `http://localhost:8080/shopping?session=<token>` -> shopping-lite 任务
- `http://localhost:8080/wiki?session=<token>` -> wiki-lite 任务

### 4) 启动 Web 应用

```bash
pnpm dev:web
```

### 5) 开发模式启动（无需 Docker，可选）

如果您需要进程级调试，直接运行服务：

```bash
pnpm dev:orchestrator
pnpm dev:hosted
```

## 本地进程角色

为什么 `hosted-sites + hosted-orchestrator` 是默认目标：

- `hosted-sites` 是用于会话级任务应用的托管 Web 基准站点层。
- `hosted-orchestrator` 是 attempt init/state/command、评分聚合、timeout 处理和 cleanup 的控制面。
- 托管 Web 运行使用正常的浏览器访问会话 URL；站点将遥测和评分事件发送回 `apps/web`。
- `mock-sites`、`runner` 和 MCP 仍作为传统/内部演示工具存在，不是主要生产路径。

这使得默认运行时保持轻量：

- 正常的托管 Web 运行无需服务器端 Chromium 池
- 第一个托管基准测试无需 MCP 网关依赖
- 一个长期运行的托管站点部署可以服务多个会话级运行

推荐的启动组合：

- 托管 Web 路径：`dev:web` + `dev:orchestrator` + `dev:hosted`
- 本地托管栈：添加 `dev:hosted` 和 `dev:orchestrator`

## 托管 Web PoC

当前的托管 Web 演示基准是一个四步套件：

- `shopping-lite`：受限结账
- `forum-lite`：回复安全线程，并使用指定管理原因锁定线程
- `repo-lite`：更新 README 安装命令并创建合并请求
- `wiki-lite`：检索并提交发布历史日期

该套件作为一个基准案例存储，带有有序的托管会话和加权必需会话汇总。

启动托管基准站点：

```bash
pnpm dev:orchestrator
pnpm dev:hosted
```

Web 应用使用 `HOSTED_SITES_URL` 打开托管任务 URL。在本地开发中，它默认为：

```text
http://localhost:3003
```

Web 应用使用 `HOSTED_ORCHESTRATOR_URL` 调用 hosted attempt 的 init/state/command API。本地开发通常指向：

```text
http://localhost:3004
```

托管站点将事件和完成信息发送回 `AGENTBENCH_WEB_URL`，默认为：

```text
http://localhost:3000
```

如果 Web 应用配置了 `RUNNER_SHARED_SECRET`，请使用相同的值启动 `hosted-sites`，以便事件和完成回调被接受。

创建本地会话：

```bash
curl -X POST http://localhost:3003/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{}'
```

打开返回的 `startUrl` 或使用 Web 应用的 `/api/runs/:runId/connect` 来分配一个真实的尝试。对于默认基准案例，代理应该：

1. 以标准运费购买一个价格不超过 `$30` 的 USB-C 充电器，且不包含受限产品
2. 使用官方召回链接回复电池膨胀论坛线程，并用 `safety escalation` 原因锁定该线程
3. 将 repo README 安装命令更新为 `pnpm install`，并创建标题为 `Fix install instructions`、目标分支为 `main` 的合并请求
4. 使用托管 wiki 查找 `wiki-lite` 跟随托管 Web 套件 alpha 的日期，并提交确切日期

## Docker 网关套件（hosted-sites + gateway）

这是默认的本地运行时路径。

文件：

- [docker-compose.yml](/Users/blueberryncherry/Proj/agent-benchmark/docker-compose.yml)
- [Caddyfile.hosted-sites](/Users/blueberryncherry/Proj/agent-benchmark/infra/caddy/Caddyfile.hosted-sites)
- [`.env.docker.example`](/Users/blueberryncherry/Proj/agent-benchmark/.env.docker.example)

准备环境：

```bash
cp .env.docker.example .env
```

启动：

```bash
docker-compose up -d --build
```

停止：

```bash
docker-compose down
```

主机上的网关端点：

- `http://localhost:8080/health` -> hosted-sites 健康检查
- `http://localhost:8080/attempts/<attempt-id>?session=<token>` -> 托管套件概览
- `http://localhost:8080/shopping?session=<token>` -> 托管购物任务 URL
- `http://localhost:8080/wiki?session=<token>` -> 托管 wiki 任务 URL

传统路径仍可在 `infra/docker/docker-compose.mcp-gateway.yml` 中使用。

## CI/CD（Vercel + 私有 Linux）

此仓库现在包含一个拆分部署流水线：

- web：Vercel（通过 Git 集成自动部署，或部署钩子）
- hosted-sites：GitHub Actions -> GHCR 镜像 -> 部署在自托管 Linux runner 上

工作流：

- [ci.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/ci.yml)
- [deploy-web.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/deploy-web.yml)
- [deploy-hosted-sites.yml](/Users/blueberryncherry/Proj/agent-benchmark/.github/workflows/deploy-hosted-sites.yml)

服务器 compose 模板：

- [docker-compose.server.yml](/Users/blueberryncherry/Proj/agent-benchmark/infra/docker/docker-compose.server.yml)
- [`.env.server.example`](/Users/blueberryncherry/Proj/agent-benchmark/infra/docker/.env.server.example)

hosted-sites 部署所需的 GitHub Secrets：

- `GHCR_USERNAME` - 自托管部署作业拉取私有 GHCR 镜像时使用
- `GHCR_PAT` - 必须属于 `GHCR_USERNAME` 并包含 `read:packages`
- `AGENTBENCH_WEB_URL`
- `RUNNER_SHARED_SECRET`
- `HOSTED_SITES_PUBLIC_URL`
- `HOSTED_ORCHESTRATOR_PUBLIC_URL` - 公网 orchestrator 路径，例如 `https://hosted.project-echo.xyz/orchestrator`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

镜像发布使用具有 `packages: write` 权限的工作流 `GITHUB_TOKEN`；构建和推送作业不需要 PAT。

自托管 runner 要求：

- 在您的私有 Linux 主机上注册一个 GitHub Actions 自托管 runner
- runner 标签必须包含 `self-hosted` 和 `linux`
- 该主机上必须可用 `docker` 和 `docker-compose`

可选的 Web 部署钩子 secret：

- `VERCEL_DEPLOY_HOOK_URL`

## 安全

所有代理操作都应在隔离的沙箱环境中运行。代理绝不能获得对主机的直接访问。

参见 [docs/security.zh-CN.md](./docs/security.zh-CN.md)。
