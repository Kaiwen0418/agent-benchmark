# 协议

> [English](./protocol.md) | 中文

## 目标

该协议定义了云平台与执行 runner 之间的契约。

所有共享契约应存在于 `packages/protocol` 中。

## 协议原则

- 类型化和版本化
- 尽可能与传输无关
- 显式身份验证
- 事件友好，便于实时可观测性
- 在可行的情况下向后兼容

## 核心领域

### 运行创建

运行目前支持两种执行模式：

- `internal`
- `external-agent`

`internal` 运行由本地 runner 轮询循环接收。

`external-agent` 运行在 `waiting_for_agent` 状态下创建，旨在由通过 MCP 连接的用户控制代理驱动。

### Runner 注册

用于：

- runner 身份
- 能力
- 版本报告
- 可用性

### 运行分配

用于：

- 基准选择
- 代理配置
- 环境配置
- 超时和限制

对于 `external-agent` 运行，分配不是 runner 队列声明。相反，当代理开始使用 MCP 会话时，运行被激活。

### 事件流

用于：

- 生命周期状态变化
- 工具调用事件
- 日志
- 截图
- 追踪检查点

当前生命周期事件：

- `run.created`
- `agent.connected`
- `run.running`
- `run.completed`
- `run.failed`

当前 MCP 追踪事件：

- `mcp.request`
- `mcp.response`
- `mcp.error`

### 产物报告

用于：

- 最终追踪
- 回放元数据
- 日志
- 评分输入
- 附件

## 版本控制

每次基准运行都应记录：

- 协议版本
- runner 版本
- 基准版本
- 评分版本

这是可复现性和可靠的时间比较所必需的。

## 当前 MCP 链接方法

当前的开发时 MCP 契约是：

1. web 创建一个运行
2. 运行特定的连接页面返回：
   - 人类可读的说明页面
   - 机器可读的 JSON 负载
   - 本地开发中的运行级 MCP URL
3. 用户的本地代理连接到该 MCP URL
4. 第一个 MCP 请求将运行标记为已连接并正在运行
5. 代理以 `run.complete` 结束运行

当前本地 MCP 传输：

```text
streamable_http
http://127.0.0.1:3002/mcp?runId=<run-id>
```

这目前有意限定在本地开发。公共认证远程 MCP 端点尚未实现。
