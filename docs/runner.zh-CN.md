# Runner

> [English](./runner.md) | 中文

## 目的

Runner 是 AgentBench 的传统执行引擎。它保持自托管，用于内部队列运行、MCP 工具和仍然需要隔离沙箱的回归场景。

## 职责

- 向控制平面注册
- 接收基准运行分配
- 准备隔离环境
- 启动浏览器会话
- 向被评估的代理暴露已批准的工具
- 收集产物、追踪和日志
- 将实时状态流式传输回平台

## 当前开发形态

现在 runner 分为两个本地角色：

- 控制平面 worker
- MCP 工具服务器

控制平面 worker：

- 向 Web 应用注册
- 轮询内部队列运行
- 执行内置 Playwright 场景

MCP 工具服务器：

- 通过 MCP 暴露浏览器/文件/邮件/策略工具
- 旨在用于用户本地环境中运行的代理
- 可以在不经过 runner 队列声明的情况下激活 `external-agent` 运行

对于当前的托管 Web 路径，外部代理运行主要使用 `apps/hosted-sites` 而不是 runner 作为主要任务界面。

当前面向本地代理的 MCP 端点（通过 Web 代理）：

```text
http://localhost:3000/api/mcp/runs/<run-id>
```

当前本地 runner 上游端点：

```text
http://127.0.0.1:8080/mcp?runId=<run-id>  （或容器内部 runner 服务）
```

当前本地 MCP 传输：

- `streamable_http`

## MVP Runner 模型

当前 MVP 实现使用：

- Node.js + TypeScript
- Playwright 用于浏览器控制
- 本地 HTTP MCP 服务器
- 用于内部演示运行的轮询 worker

计划后续添加：

- Docker 用于沙箱
- noVNC 用于实时查看
- 更强的远程会话认证
- 每次运行的沙箱隔离

## 默认本地运行时

默认面向生产的本地启动不再是 runner 堆栈。主要的托管 Web 运行时是：

- `hosted-sites`
- `gateway`

当您特别需要时使用 runner 堆栈：

- `internal` 队列运行执行
- MCP 传输回归覆盖
- 传统本地工具演示

在此模式下，Cloudflare Tunnel 可以指向：

```text
http://localhost:8080
```

## 执行流程

### 内部运行

1. runner 向 Web 控制平面注册
2. 一个队列中的 `internal` 运行被声明
3. Playwright 执行内置基准场景
4. 报告事件、帧、分数和产物
5. 运行完成

### 外部代理运行

1. web 在 `waiting_for_agent` 状态下创建一个 `external-agent` 运行
2. 用户将连接链接或 JSON 交给本地代理
3. 代理连接到运行级 MCP URL
4. 第一个 MCP 请求将运行标记为 `agent_connected` 然后 `running`
5. 记录 MCP 请求/响应事件
6. 代理调用 `run.complete`

## 设计约束

- 不对 SaaS 应用运行时有紧密依赖
- 基准可复现性的确定性设置
- 显式资源和权限边界
- 用于实时更新和回放的清晰事件模型

## 未来扩展

- 多个并发沙箱
- 区域 runner 池
- 基于队列的编排
- 更丰富的模拟系统套件
