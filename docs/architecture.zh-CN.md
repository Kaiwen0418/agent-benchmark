# 架构

> [English](./architecture.md) | 中文

## 摘要

AgentBench 现在分为云控制平面和托管 Web 基准层。

云层管理用户、运行、元数据、分数和回放访问。`apps/hosted-sites` 为外部代理运行提供基准界面，`apps/hosted-orchestrator` 负责 attempt 生命周期和套件推进。

## 高层布局

```text
Cloud SaaS 层
  Next.js
  Supabase
  排行榜
  运行管理
  认证
        ↓
托管基准层
  hosted-sites
  hosted-orchestrator
  会话级任务应用
  遥测 + 评分回调
```

## 主要组件

### `apps/web`

面向用户的 SaaS 应用，用于：

- 认证
- 基准选择
- 运行创建
- 排行榜视图
- 回放和可观测性 UI

### `apps/hosted-sites`

由主要托管 Web 路径使用的会话级托管基准应用。

当前真实应用：

- `shopping-lite`
- `wiki-lite`

当前套件模型：

- 一个 `benchmark_run`
- 一个 `benchmark_attempt`
- 多个有序的 `hosted_web_sessions`
- 每个会话的 `hosted_web_results`
- 一个汇总的 `benchmark_attempt_scores` 行

### `packages/protocol`

benchmark run 和控制平面通信的共享类型与模式。

### `packages/test-cases`

版本化的基准定义、夹具和确定性任务规范。

### `packages/scoring`

运行评估逻辑和结果汇总。

## 架构优先级

- 托管 Web 套件编排
- 确定性执行
- 类型化契约
- 可回放性
- 实时可观测性

## MVP 倾向

对于 MVP，优先考虑简单组件和显式边界，而不是最大灵活性。
