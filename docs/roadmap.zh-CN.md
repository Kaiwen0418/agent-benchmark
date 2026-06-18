# 路线图

> [English](./roadmap.md) | 中文

本路线图以已经运行的架构为起点。已完成能力记录在[架构](./architecture.zh-CN.md)中，不再作为 TODO 重复保留。

## 当前基线

- 外部 Agent 自己控制浏览器；AgentBench 不运行任意 Agent 代码。
- `apps/web` 部署在 Vercel，负责 run 创建、配额、实时观测、回放和 artifacts。
- Hosted stack 部署在私有 Linux 主机，通过 Nginx 和 Cloudflare Tunnel 对外提供服务。
- Redis 提供共享 hosted-session cache 和 16 个分区的 orchestrator command Streams。
- Supabase 是生命周期、审计和评分的持久存储。
- Attempt 初始化以数据库为准，并由 hosted-attempt 唯一约束和短期 Redis lease 共同保护。
- `develop` 部署到 development，`main` 部署到 production；两者使用独立 GitHub Environment、runner、数据库 URL、镜像 channel、端口和 Compose project。

## P0：生命周期正确性与恢复

- 为 active-session 推进、timeout 和终态完成增加数据库 transaction 或 compare-and-set。
- 增加“每个 session 一个终态 result”和“每个 attempt 一个聚合 score”的唯一约束，并明确冲突恢复逻辑。
- 使用 outbox 持久化 Web callback delivery，按有上限的退避策略重试，并对“结果已持久化但 run 未完成”的 attempt 自动对账。
- 定义 command 重试上限，增加 dead-letter 路径，记录 command ID、partition、payload type、error code，并提供检查工具。
- 基于真实 Postgres 增加 lifecycle 集成测试，覆盖并发完成、timeout 与完成竞争、重复 command 和 callback 恢复。

完成标准：任一进程失败后重试同一 command，都不会产生第二次 transition、result、score 或 callback side effect。

## P0：生产拓扑对齐

本地 Compose 将一个 API 进程和两个 worker 分离，workers 分别负责 partition `0-7` 与 `8-15`。当前服务器 Compose 使用一个 `ORCHESTRATOR_MODE=all` 服务；单副本下可以工作，但没有 worker 隔离，也不能安全扩容多个 all-mode 副本，因为 partition lease 会重叠。

- 在服务器 Compose 中恢复显式 API 和 worker services。
- 更新定向部署逻辑，使 orchestrator 镜像变化会重建 API 和全部 workers，同时不影响 hosted-sites。
- 将 worker partition 完整覆盖和重复归属检查设为部署不变量。
- 增加生产 readiness 检查和回滚流程，保证所有 lease 完整且回滚期间 command 仍可处理。

完成标准：API 和 workers 可独立部署，每个 partition 恰好一个 owner，worker 重启不会中断公网 API。

## P1：可观测性与运维

- 输出结构化日志，包含 request ID、command ID、run ID、attempt ID、session ID、partition 和部署环境。
- 导出 command lag、pending/reclaimed entries、处理延迟、callback backlog、active attempts、timeout 和 cleanup duration。
- 分离 liveness 与 readiness；readiness 应覆盖 Redis、partition ownership 和必要的 Supabase 访问。
- 为 queue backlog、callback 失败、migration 失败、磁盘压力和 Redis 恢复制定告警阈值与运维手册。
- 测试 Supabase 持久记录和 Redis active session 的备份、恢复与灾难恢复。

完成标准：运维人员无需翻阅非结构化容器日志，就能定位卡住的 attempt 及其最后一条持久 command。

## P1：内部边界与契约

- 将 orchestrator `server.ts` 拆为 transport/auth、command handlers、repositories、lifecycle、callbacks 和 maintenance 模块。
- 将内部 request/command payload 迁移到共享、版本化的 Zod schema，并使用结构化 error code。
- 通过有文档的兼容窗口，将 `RUNNER_SHARED_SECRET`、`x-runner-secret` 和 runner 命名 helper 改为 hosted-service 术语。
- 对内部 routes、Redis command 和 session envelope 进行版本化，并明确兼容与弃用规则。
- 移除 orchestrator 中重复的 app-specific 默认值；任务语义由 hosted app definitions 和 benchmark case metadata 管理。

完成标准：transport 修改不要求 lifecycle 同步修改，不兼容 command 在进入 Redis Streams 前即校验失败。

## P2：基准与产品深度

- 增加更多 hosted apps 和 variant pools，不在 orchestrator 中增加 app-specific 分支。
- 为 benchmark suite 增加版本，使 task 或 evaluator 更新后历史 run 仍可复现。
- 增加可导出的 replay/trace bundle，并提供脱敏与保留策略。
- 围绕 evaluator evidence、artifacts 和 superseded attempts 改进 run 对比与失败分析。
- 增加大量并发 attempts 的负载测试并发布经过验证的容量上限。

完成标准：一个 benchmark release 可由版本化 case definition、evaluator set、generation seed 和保留 artifacts 完整复现。

## 明确不做

- 在 Vercel functions 中运行不可信 Agent 代码、浏览器 sandbox 或任意 worker。
- 在没有独立隔离与威胁模型项目的情况下恢复已移除的 benchmark execution runner。
- 将 Redis 作为持久生命周期的真相源。

