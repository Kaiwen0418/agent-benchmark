# 托管 Web 基准

> [English](./hosted-web-benchmark.md) | 中文

## 执行模型

AgentBench 托管确定性的基准网站。被评测 Agent 使用自己的浏览器打开带不透明 token 的 session URL，并通过正常 HTML 表单和链接操作。AgentBench 不启动或控制 Agent 的浏览器。

平台观察服务端任务状态和显式 telemetry，基于受控状态评分，而不是相信 Agent 的最终文字声明。

## Suite 结构

```text
benchmark run
  benchmark attempt
    ordered hosted session 0
    ordered hosted session 1
    ...
    aggregate attempt score
```

当前 apps：

- `shopping-lite`：受限商品结账
- `forum-lite`：回复并锁定安全主题
- `repo-lite`：修改 README 并创建 merge request
- `wiki-lite`：检索并提交精确日期

每个 session 定义 app、task/seed version、顺序、权重、required、goal 和 start path。

## Session 隔离

- 每个任务 URL 携带不透明 token。
- 可变状态只属于一个 session 和一个 app。
- Redis 保存所有 hosted-sites 副本共享的 active state。
- Supabase 保存持久 app-state snapshot 和生命周期记录。
- App route guard 会拒绝属于其他 app 的 token。

## 评分

每个 app definition 提供：

- 确定性 initial state
- 持久状态验证与 hydration
- route handler 和状态修改
- final-state projection
- 返回 `passed`、`failed` 或 `error`、score、summary 和 evidence 的 evaluator

Suite 使用加权聚合。任意 required session 失败都会阻止聚合结果通过。

## Telemetry

Telemetry 用于可观测性和调试：

- page load 与 navigation
- 显式任务操作
- task signal
- scoring 与 lifecycle event

Telemetry 不是主要成功依据。Evaluator 应优先检查服务端 app state。

## 添加 App

新 app 必须定义自己的 typed state、seed data、validator、action、render、route、final-state projection 和 evaluator，并注册到 app registry，同时包含状态隔离、hydration、action 和 scoring 测试。

实现指南参见 [Hosted Site App 设计与评分指南](./hosted-site-app-authoring.zh-CN.md)。

## 非目标

- 与规范 WebArena 分数兼容
- 服务端拥有浏览器执行
- 任意公网任务
- 只基于截图或自由文本 final answer 评分
- 在 benchmark sessions 之间共享可变状态
