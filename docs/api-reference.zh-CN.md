# API 参考

> [English](./api-reference.md) | 中文

## 鉴权

Web 公开读取使用当前 Supabase 用户或 HTTP-only guest cookie。服务间写入要求 `x-runner-secret: <RUNNER_SHARED_SECRET>`。该 header 和环境变量保留了历史命名，现在用于 hosted services 鉴权，不代表仍存在 runner 组件。

Hosted task 请求通过 `?session=<token>` 或 telemetry body 携带不透明 token。Supabase 只保存 token 的 SHA-256 hash。

## Web API（`apps/web`）

| 方法 | 路径 | 用途 | 鉴权 |
| --- | --- | --- | --- |
| `GET` | `/api/quota` | 当前游客/用户配额 | 用户或 guest cookie |
| `POST` | `/api/runs` | 创建 benchmark run | 用户或 guest cookie |
| `GET` | `/api/runs/:runId` | 读取 run | run 可见性规则 |
| `GET` | `/api/runs/:runId/connect` | 分配或读取 hosted attempt 连接信息 | run 可见性规则 |
| `GET` | `/api/runs/:runId/events` | 列出 run events | run 可见性规则 |
| `POST` | `/api/runs/:runId/events` | 写入内部 hosted event | shared secret |
| `POST` | `/api/runs/:runId/complete` | 使用评分完成 run | shared secret |
| `GET` | `/api/runs/:runId/stream` | SSE snapshot、heartbeat 和终态事件 | run 可见性规则 |
| `GET` | `/api/runs/:runId/artifacts` | 列出 artifacts | run 可见性规则 |
| `GET` | `/api/runs/:runId/artifacts/file?path=...` | 读取本地 artifact 文件 | run 可见性规则 |

### 创建 Run

```http
POST /api/runs
Content-Type: application/json

{
  "caseId": "uuid",
  "executionMode": "external-agent"
}
```

成功返回 `201 { run, quota }`。配额耗尽返回 `403`，错误码为 `trial_limit_reached` 或 `daily_limit_reached`。

### 连接 Run

`GET /api/runs/:runId/connect` 解析 benchmark metadata，初始化或复用 hosted attempt，并返回 attempt URL 与 session URLs。Hosted 分配错误使用结构化响应：

```json
{
  "error": "error_code",
  "message": "可读错误信息",
  "retryable": true,
  "hostedSitesUrl": "https://hosted.example.com"
}
```

### 事件流

`GET /api/runs/:runId/stream` 发出：

- `snapshot`：`{ run, events, artifacts }`
- `heartbeat`：`{ ts }`
- `terminal`：`{ status }`
- `error`：流级错误

单次连接最长 25 秒，客户端根据 `retry: 2000` 重连。

## Hosted-Sites API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `POST` | `/api/sessions` | 创建独立或受编排 session |
| `POST` | `/api/telemetry` | 持久化并转发 hosted event |
| `GET` | `/api/sessions/:token/score` | 评测当前 session 状态 |
| `POST` | `/api/sessions/:token/complete` | 评测并提交 session completion |
| `GET` | `/attempts/:attemptId?session=...` | 渲染 attempt 概览 |
| `GET` | `/api/attempts/:attemptId/advance?session=...` | 获取下一个任务 URL |

### 创建 Session

请求可包含 `runId`、`caseId`、`attemptId`、`callbackSecret`、suite metadata、`app`、task metadata、顺序、权重、required、标题、目标、start path、seed version 和任意 metadata。

成功返回 `201`，包含 `sessionId`、`attemptId`、不透明 `token`、app/task 字段、`startUrl`、goal 和 title。

### Telemetry

```http
POST /api/telemetry
Content-Type: application/json

{
  "session": "opaque-token",
  "type": "page.load",
  "url": "/shopping",
  "title": "Products",
  "payload": {}
}
```

事件会追加到运行时 session，通过 orchestrator 持久化，并转发到 Web run event API。

### Task Routes

所有 task route 都要求 `?session=<token>`，并拒绝属于其他 app 的 token。

| App | 路由 |
| --- | --- |
| shopping | `GET /shopping`、`POST /shopping/cart`、`GET /shopping/cart`、`POST /shopping/checkout`、`GET /shopping/order/:id` |
| wiki | `GET /wiki`、`GET /wiki/article/:slug`、`POST /wiki/answer` |
| forum | `GET /forum`、`GET /forum/thread/:id`、`POST /forum/thread/:id/reply`、`POST /forum/thread/:id/lock` |
| repo | `GET /repo`、`GET/POST /repo/file/:path/edit`、`GET/POST /repo/mr/new`、`GET /repo/mr/:id` |

## Orchestrator API

### Command Dead Letters

需要内部 service 鉴权。

- `GET /api/commands/dead-letters?status=dead&limit=50` 查询 command 诊断记录。
- `POST /api/commands/dead-letters/:id/replay` 使用新 command ID 重新发布已存 payload，并只在成功后将原记录标记为 replayed。

除 `/health` 外，所有 endpoint 都要求 shared-secret header。

写 endpoint 会先将 command 追加到 Redis Streams，再等待 worker result。客户端可发送 `x-command-id` 使 retry 幂等；未提供时由 API 生成。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `POST` | `/api/attempts/init` | 创建 attempt 和有序 sessions |
| `GET` | `/api/attempts/:id/state` | 读取标准化 attempt 进度 |
| `POST` | `/api/attempts/:id/commands/resolve-advance` | 校验当前 session 并返回下一个 URL |
| `POST` | `/api/attempts/:id/commands/complete-session` | 持久化结果、推进，并在完成时聚合 |
| `POST` | `/api/attempts/:id/commands/timeout` | 将 attempt 标记为 timeout 并完成 run |
| `POST` | `/api/sessions/:token/commands/snapshot` | 持久化当前 session metadata snapshot |
| `POST` | `/api/sessions/:token/commands/access` | 持久化 session 访问计数和 access log |
| `POST` | `/api/sessions/:token/commands/event` | 持久化一条 hosted event |

### 初始化 Attempt

```json
{
  "runId": "uuid",
  "caseId": "uuid",
  "callbackSecret": "optional",
  "suiteSlug": "hosted-web-suite-v1",
  "suiteVersion": "v1",
  "sessions": [
    {
      "app": "shopping-lite",
      "taskSlug": "shopping-constrained-checkout",
      "sequenceIndex": 0,
      "weight": 1,
      "required": true
    }
  ]
}
```

### 完成 Session Command

Body 包含 `sessionToken`、`result` 和可选 `finalState`。`result` 包含 `status`、`score`、`summary`、`evaluators` 和 `breakdown`。重复完成是幂等的，会返回最近一次持久化结果。

### Session 持久化 Commands

`snapshot` 接收 `{ "metadata": { ... } }`；`access` 接收当前访问计数、时间、客户端字段和 event 名；`event` 接收 `{ "payload": { "type": "...", ... } }`。这些鉴权 command 使 hosted-sites 不再直接写数据库，同时 Redis 继续作为共享运行时缓存。

## 错误语义

- `400`：输入无效、缺少 session 或 attempt/session 不匹配
- `401`：缺少或使用错误的内部 shared secret
- `404`：run/session/resource 不存在
- `409`：生命周期冲突，例如终态后再次 timeout
- `502`：hosted-sites 无法访问 orchestrator
- `500`：未预期的服务端错误
