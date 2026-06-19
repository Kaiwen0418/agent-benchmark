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
- Hosted 终态结果和 attempt 聚合分数采用先写入者获胜的数据库约束，并具备显式冲突恢复。
- `develop` 部署到 development，`main` 部署到 production；两者使用独立 GitHub Environment、runner、数据库 URL、镜像 channel、端口和 Compose project。

## P0 发布门槛

P0 现在按有顺序、可独立验收的里程碑管理。只有实现、自动化检查、部署行为和运维文档一致时，里程碑才算完成。

| 里程碑 | 状态 | 退出标准 |
| --- | --- | --- |
| P0.1 公共结果完整性 | 已完成 | 公共结果页展示脱敏后的 benchmark metadata、完成时间、浏览器环境、Agent/base-model 标识和稳定分数，不泄露私有 run 字段。 |
| P0.2 生产角色隔离 | 进行中 | 服务器 Compose 分离 API 与 workers；部署校验精确 partition 归属；readiness 要求全部运行时 lease；development 部署和 worker 重启验证通过。 |
| P0.3 原子生命周期转换 | 进行中 | Timeout 已使用 transaction；active 推进和终态完成仍需数据库 compare-and-set 或 transaction，之后增加基于 Postgres 的 timeout 与 completion 并发测试。 |
| P0.4 持久 callback 恢复 | 计划中 | Web callback 使用持久 outbox、有上限重试，并能对账“结果存在但 run completion 缺失”的状态。 |
| P0.5 异常 command 隔离 | 计划中 | Command 有重试上限、包含诊断标识的 dead-letter 记录、重放工具，以及重复和失败 delivery 的集成测试。 |

### P0.2 实施范围

- 生产环境现在声明一个 `ORCHESTRATOR_MODE=api` service，以及分别覆盖 partition `0-7` 与 `8-15` 的两个 worker services。
- Orchestrator 镜像部署使用同一个不可变 tag 更新 API 和两个 workers，不重建 hosted-sites。
- 静态部署校验拒绝缺失、重复和越界的 partition 分配。
- 运行时 readiness 要求 Redis Streams 可用且每个 partition 都有活跃 lease。
- 剩余门槛：部署到 development，分别重启两个 workers，验证公网 API 连续性和排队 command 恢复，并记录回滚证据。

P0 总完成标准：任一单进程失败或 command 重试后，系统仍只产生一次生命周期转换、一个结果、一个分数和一次 callback side effect，同时保持公网 API 可用。

### P0.3 实施范围

- Expiry sweep 只发现候选 session，不再提前修改生命周期状态。
- `timeout_hosted_attempt` 锁定 attempt，并在一个事务内过期开放 sessions、将 attempt 标记为 timeout、插入唯一聚合分数。
- 失败或重复的 timeout command 不执行 cache eviction 或 Web callback。
- 剩余门槛：将 session completion 和 next-session promotion 放入同一数据库并发边界，然后执行真实 Postgres 竞态测试。

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
