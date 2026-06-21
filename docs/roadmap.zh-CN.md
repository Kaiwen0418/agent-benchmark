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
| P0.2 生产角色隔离 | 已完成 | API/worker 隔离、精确 lease readiness、逐个 worker 恢复、排队 command 重放和回滚证据已通过 development 故障注入。 |
| P0.3 原子生命周期转换 | 已完成 | Timeout、终态 completion 和 active 推进共享 attempt row lock，并通过真实 Postgres 的 timeout/completion 与重复 completion 竞态测试。 |
| P0.4 持久 callback 恢复 | 已完成 | Web completion callback 使用事务 outbox、最多八次重试、过期 claim 恢复、周期对账和幂等 Web 接收端。 |
| P0.5 异常 command 隔离 | 已完成 | Command 最多重试三次，ACK 前持久化诊断 dead letter，并支持使用新 command ID 的鉴权查询和重放。 |

### P0.2 实施范围

- 生产环境现在声明一个 `ORCHESTRATOR_MODE=api` service，以及分别覆盖 partition `0-7` 与 `8-15` 的两个 worker services。
- Orchestrator 镜像部署使用同一个不可变 tag 更新 API 和两个 workers，不重建 hosted-sites。
- 静态部署校验拒绝缺失、重复和越界的 partition 分配。
- 运行时 readiness 要求 Redis Streams 可用且每个 partition 都有活跃 lease。
- Development CD 现在自动执行逐个 worker 重启、公网 API 连续性检查、排队 command 恢复和回滚证据记录。
- 完成证据：`develop@58cb60f` 已通过 [Hosted deployment run 27900888968](https://github.com/Kaiwen0418/agent-benchmark/actions/runs/27900888968)，其中故障注入部署耗时 52 秒，后续四应用 lifecycle smoke 耗时 52 秒。

P0 总完成标准：任一单进程失败或 command 重试后，系统仍只产生一次生命周期转换、一个结果、一个分数和一次 callback side effect，同时保持公网 API 可用。

### P0.3 实施范围

- Expiry sweep 只发现候选 session，不再提前修改生命周期状态。
- `timeout_hosted_attempt` 锁定 attempt，并在一个事务内过期开放 sessions、将 attempt 标记为 timeout、插入唯一聚合分数。
- `complete_hosted_attempt_session` 使用相同的 attempt lock，持久化 result、关闭当前 session、更新 attempt 进度，并推进下一个 session 或写入终态聚合。
- 失败或重复的 timeout command 不执行 cache eviction 或 Web callback。
- 重复 completion 返回第一个持久结果；timeout 已获胜后的 completion 会被拒绝且不写生命周期状态。
- CI 使用隔离 Postgres 实例执行 timeout/completion 与重复 completion 竞态测试，并拒绝任何跨表部分状态。

### P0.4 实施范围

- 数据库 trigger 在 attempt 进入终态的同一事务中写入 run completion outbox。
- Worker 使用 `FOR UPDATE SKIP LOCKED` claim callback；HTTP 失败采用指数退避，第八次失败后进入 `dead`。
- Maintenance 恢复过期 claim，并为缺失 outbox 的终态 attempts 重新建记录。
- Web completion 接收端使用终态 status compare-and-set，重试不会刷新完成时间或追加重复终态 event。
- 接收端接受全部非终态 run 状态，包括 hosted-web 的 `waiting_for_agent` 与 `agent_connected`，避免 callback 返回成功但 run 未完成。
- CI 覆盖 trigger enqueue、互斥 claim、过期耗尽、reconciliation、retry、delivery 和 dead-letter 行为。

### P0.5 实施范围

- Redis 独立于 worker 进程保存 retry count 和最终错误；handler 三次失败后停止执行。
- Command 只有在诊断记录写入 `orchestrator_command_dead_letters` 后才会 ACK。
- Reclaim 只重试失败的 DLQ 持久化，不重新执行已耗尽的 handler。
- 内部鉴权 API 可查询 dead letters，并使用新 command ID 重放指定记录，避免命中原 result cache。
- CI 覆盖 retry 上限、DLQ 持久化失败恢复、诊断 schema 和数据库写入。

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
