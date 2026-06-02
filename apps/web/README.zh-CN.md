# Web 游乐场

> [English](./README.md) | 中文

此应用现在围绕一个单页交互式 AI 游乐场构建。

## 产品形态

首页就是产品：

- 主视觉
- 运行游乐场
- 回放画廊
- 文档

核心交互是：

- 点击启动
- 给代理一个运行链接或配置
- 观察运行激活并流式传输回来

## 当前模式

首页现在以一个主要路径为中心：

- `Start Agent Session`

`Start Agent Session` 创建一个 `external-agent` 运行：

- 运行状态从 `waiting_for_agent` 开始
- UI 分配一个带有一个或多个有序托管会话的尝试
- 连接页面和 JSON 配置暴露一个尝试级托管套件 URL 以及每个会话的详细信息
- 默认基准案例是一个两步托管套件：
  - `shopping-lite`
  - `wiki-lite`
- 对于托管 Web 运行，代理使用托管套件 URL 作为主要任务界面
- hosted-sites 写入每个会话的结果和汇总的尝试分数

## 本地启动说明

默认启动使用 Docker 运行时作为后端服务：

- `docker-compose up -d --build`（从仓库根目录）
- 这将启动 `hosted-sites + hosted-orchestrator + gateway`
- Web 应用仍然使用 `pnpm dev:web` 启动

`apps/hosted-sites` 和 `apps/hosted-orchestrator` 是分开设计的：

- `hosted-sites` 服务会话级基准应用并写入托管评分数据
- `hosted-orchestrator` 负责 attempt 生命周期、套件推进、聚合和超时处理

对于正常的 `Start Agent Session` 测试，`web + hosted-sites + hosted-orchestrator` 是默认路径。

## 下一步推荐

1. 用服务器拥有的编排器状态机替换轻量级尝试概览。
2. 持久化更丰富的会话进度，使 `advance` 不再依赖于内存状态。
3. 在公开推出之前收紧每次运行的认证和隔离。
