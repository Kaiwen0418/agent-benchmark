# 基准规范

> [English](./benchmark-spec.md) | 中文

## 定义层次

一个 hosted benchmark 由两个明确层次组成：

1. Suite metadata 选择有序 sessions 和评分权重。
2. Hosted app definition 实现状态、路由、action、final-state projection 和 evaluation。

Suite metadata 与 benchmark case 一起保存，并通过 `HostedWebSuiteMetadata` 校验。App 实现位于 `apps/hosted-sites/src/apps/<app-id>`，通过 app registry 注册。

## Suite Metadata

```ts
type HostedWebSuiteMetadata = {
  suiteSlug: string;
  suiteVersion: string;
  sessions: Array<{
    app: string;
    taskSlug: string;
    taskVersion: string;
    seedVersion?: string;
    sequenceIndex: number;
    weight: number;
    required: boolean;
    title?: string;
    goal?: string;
    startPath?: string;
    metadata: Record<string, unknown>;
  }>;
};
```

`sequenceIndex` 定义推进顺序，`weight` 影响聚合 score。任意 `required` session 失败都会阻止 suite 通过。

## App Definition 要求

每个 app 必须提供：

- 稳定 app ID
- typed app-specific state
- 确定性 seed data
- persisted state validator
- 默认 goal 和 start path
- route handler 与状态修改
- final-state projection
- 确定性 evaluator
- action、hydration、隔离和 scoring 测试

## Evaluation 契约

Evaluator 返回：

- `status`：`passed | failed | error`
- 标准化 `score`：`0..1`
- 可读 `summary`
- evaluator-level evidence
- 用于调试和聚合的可选 breakdown

优先使用 backend-state check。只有成功条件无法由受控服务端状态表达时，才使用 UI-state 或 final-response check。

## 版本控制

修改 seed data、成功条件、会影响行为的任务文字或 app state shape 时，必须更新 task/seed/suite version。历史结果必须保留执行时使用的准确版本。

Redis envelope version 与 benchmark version 独立。前者描述存储兼容性，不描述任务语义。

## 设计规则

- 确定且可回放
- 每个 session 隔离
- 通过结构化 event 可观测
- 不依赖 Agent 自述即可评分
- 足够轻量，可运行大量并发 sessions
- 明确 required 和 optional 条件
- 不对外部生产系统产生副作用

## Review Checklist

- 两个 session 并发执行时是否完全不共享状态？
- Persisted state 是否能够校验并安全 hydrate？
- Evaluator 是否通过 evidence 解释失败？
- Task 和 seed version 是否明确？
- 终态 action 是否幂等？
- App 是否能在负载均衡的 hosted-sites 部署后正常运行？
