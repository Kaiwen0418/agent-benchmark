# 传统 Runner

> [English](./runner.md) | 中文

此文档仅作为历史说明保留。

传统 runner 和 MCP 执行栈已经从活动代码库中移除。当前生产路径是 hosted-web 栈：

- `apps/web`
- `apps/hosted-sites`
- `apps/hosted-orchestrator`

当前执行形态：

- `apps/web` 创建 benchmark run，并提供 UI/控制平面
- `apps/hosted-sites` 提供会话级 benchmark 站点
- `apps/hosted-orchestrator` 负责 attempt 生命周期、套件推进、聚合和超时处理

如果后续重新引入内部队列执行，应将其作为新的服务边界重新设计，而不是恢复已移除的 MCP/runner 路径。
