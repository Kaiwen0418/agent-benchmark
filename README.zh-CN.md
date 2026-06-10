# AgentBench

> [English](./README.md) | 中文

AgentBench 是一个用于观察和评测工具型 AI Agent 的交互式基准平台，提供会话隔离的托管 Web 任务、实时运行事件、回放和确定性的服务端评分。

## 核心能力

- 面向外部 Agent 的托管 Web 基准套件
- 实时运行和工具事件可观测性
- 基于 Redis 的会话级任务状态
- 确定性的单任务评分与聚合评分
- 支持横向扩容的 hosted-sites 运行时
- 基于 Docker 和 GitHub Actions 的私有 Linux 部署

## 快速开始

需要安装 Node.js、pnpm、Docker，并准备一个 Supabase 项目。

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp .env.docker.example .env
docker-compose up -d --build
pnpm dev:web
```

默认本地地址：

- Web：`http://localhost:3000`
- 托管网关：`http://localhost:8080`
- 健康检查：`http://localhost:8080/health`

环境配置和开发方式参见[快速上手](./docs/getting-started.zh-CN.md)。

## 仓库结构

```text
apps/
  web/                  Next.js 控制面和实时界面
  hosted-sites/         托管基准应用
  hosted-orchestrator/  attempt 生命周期与套件编排
packages/
  protocol/             共享协议契约
  scoring/              评测器和聚合逻辑
  shared/               共享应用及数据库类型
  test-cases/           基准定义和 fixtures
infra/                  Docker、Nginx 和部署脚本
supabase/               数据库 migrations
docs/                   架构和运维文档
```

## 文档

- [文档索引](./docs/README.zh-CN.md)
- [快速上手](./docs/getting-started.zh-CN.md)
- [架构](./docs/architecture.zh-CN.md)
- [托管 Web 基准](./docs/hosted-web-benchmark.zh-CN.md)
- [托管站点应用开发](./docs/hosted-site-app-authoring.zh-CN.md)
- [部署与扩容](./docs/deployment.zh-CN.md)
- [基准规范](./docs/benchmark-spec.zh-CN.md)
- [协议](./docs/protocol.zh-CN.md)
- [安全](./docs/security.zh-CN.md)

传统 runner 和 MCP 路径仍用于内部兼容，但不再是主要的托管 Web 运行方式。
