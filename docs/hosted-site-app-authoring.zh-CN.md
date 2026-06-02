# Hosted-Site App 设计与评分指南

本文用于指导小模型 agent 在 `apps/hosted-sites` 中生成新的轻量 benchmark app。目标不是复刻 WebArena 的原始站点，而是复用 WebArena 的任务思想和 WebArena-Verified 风格的评分结构，生成低成本、可控、可评分的 hosted-web 测试站点。

## 核心原则

Hosted-site app 应该像真实网站一样可浏览、可操作、可产生业务状态，但实现规模要明显小于真实 Magento、GitLab、论坛、Kiwix 或 OpenStreetMap。

每个 app 必须满足：

- `deterministic`: seed 数据固定，同一个 task 在同一个版本下结果可复现。
- `session-scoped`: 所有可变状态只属于当前 hosted session，不污染其他 session。
- `server-scored`: 成功条件优先从服务端状态读取，而不是从浏览器轨迹推断。
- `small-surface`: 只实现任务需要的页面、表单、列表和状态转移。
- `stable-ui`: URL、表单字段、按钮文案和可见确认信息要稳定，避免随机 DOM。
- `no-server-browser`: hosted-site 只提供网站和评分，不为每个 run 启动 Chromium。
- `app-local-state`: app 的业务状态保存在 session snapshot 或 app-local runtime state 中，控制平面数据库只保存 session、event、final result 和 attempt score。

不要为了“像真实网站”而实现完整平台。测试价值来自任务约束和可验证状态，不来自站点规模。

## 与 WebArena 的关系

AgentBench hosted-site app 可以参考 WebArena 的任务领域，但默认应标记为 `hosted-web` 或 `webarena-lite`，不能声称与 WebArena leaderboard 分数可比。只有运行原始 WebArena 环境和 evaluator 时，才应使用 canonical `webarena` 标签。

推荐映射方式：

| WebArena 风格 | 不建议实现 | hosted-site 实现目标 |
| --- | --- | --- |
| Magento / shopping | 完整目录、库存、支付、账号、促销系统 | 商品搜索、筛选、购物车、checkout、订单状态 |
| GitLab | git 存储、CI、权限、完整 MR 引擎 | issue 列表、文件浏览、编辑器、分支选择、MR 表单 |
| Postmill / forum | 完整社区平台、复杂权限、通知系统 | thread 列表、帖子详情、回复、投票、moderation 动作 |
| Kiwix / wiki | 大规模离线百科和全文索引 | 小型确定性文章语料、搜索、链接、引用 |
| OpenStreetMap | tile server、路由引擎、geocoder | 地点搜索、地点详情、固定距离表、fixture route |

实现时保留 WebArena 的“任务类型”和“需要跨页面完成目标”的特征，不保留重型生产系统。

## 当前服务边界

`apps/hosted-sites` 负责：

- 渲染 benchmark app 页面。
- 接收用户操作并修改 session-scoped app state。
- 写入轻量 telemetry。
- 在 session 完成时执行 app-level evaluate。
- 构造 app-specific final state evidence。

`apps/hosted-orchestrator` 负责：

- attempt 初始化。
- suite 内多个 session 的顺序推进。
- attempt state/read model。
- session 完成后的 attempt 聚合。
- timeout 和 cleanup。

`apps/web` 负责：

- 创建 benchmark run。
- 请求 orchestrator 初始化 attempt。
- 给前端返回 attempt-level connect payload。
- 展示 suite progress 和 score。

新增 hosted app 通常只需要修改 `apps/hosted-sites`。除非要改变 attempt lifecycle、suite 聚合或数据库结构，否则不要改 orchestrator、web API 或 migration。

## App 文件结构

每个 app 放在：

```text
apps/hosted-sites/src/apps/<app-slug>/
  types.ts
  seed.ts
  actions.ts
  render.ts
  evaluate.ts
  final-state.ts
```

配套路由放在：

```text
apps/hosted-sites/src/routes/<route-name>.ts
```

还需要注册：

```text
apps/hosted-sites/src/runtime/app-registry.ts
apps/hosted-sites/src/evaluation.ts
apps/hosted-sites/src/server.ts
```

文件职责：

- `types.ts`: 只定义该 app 的领域类型，例如 `ForumThread`、`RepoFile`、`WikiArticle`。
- `seed.ts`: 生成固定 seed、默认 start path、默认 goal。
- `actions.ts`: 封装所有业务 mutation，例如 add to cart、submit answer、create reply。
- `render.ts`: 生成 HTML。不要在 route 中堆大段模板。
- `evaluate.ts`: 返回 `HostedWebScoreResult`，包含 evaluator 级别明细。
- `final-state.ts`: 返回精简 JSON evidence，用于 `hosted_web_results.final_state`。
- `routes/<app>.ts`: 解析请求、调用 actions、持久化 session snapshot、调用 render。
- `runtime/app-registry.ts`: 声明 app id、默认入口、默认 goal、初始 state、final state builder。
- `evaluation.ts`: 将 `session.app` 分发到对应 `evaluate<App>`。

当前 `app-registry` 还不是完整 evaluator registry，所以新增 app 后仍要更新 `evaluation.ts` 的 dispatcher。后续可以把 evaluator hook 也收进统一 registry。

## 生成顺序

小模型 agent 生成新 app 时按这个顺序执行：

1. 先写 `types.ts`，让状态对象足够小。
2. 写 `seed.ts`，固定所有 fixture，不引入随机数据。
3. 写 `actions.ts`，所有 mutation 只接收 session 和显式输入。
4. 写 `render.ts`，页面只覆盖完成任务需要的路径。
5. 写 `evaluate.ts`，优先使用 `backend_state`。
6. 写 `final-state.ts`，只输出评分证据和关键业务状态。
7. 写 `routes/<app>.ts`，把 HTTP 与业务逻辑分开。
8. 在 `runtime/app-registry.ts` 注册 app。
9. 在 `evaluation.ts` 加 dispatcher。
10. 在 `server.ts` 接入 route handler。
11. 加测试，至少覆盖成功路径和一个失败路径。
12. 跑 hosted-sites test/build 和 orchestrator smoke。

## 评分原则

Hosted-site scoring 参考 WebArena-Verified 的 evaluator family，但当前实现使用严格聚合：

- 所有 required evaluator 通过，session score 为 `1`。
- 任意 required evaluator 失败，session score 为 `0`。
- required evaluator 出错，session status 为 `error`。
- optional evaluator 只记录诊断信息，不影响 pass/fail。

Evaluator 类型固定为：

```ts
type HostedWebEvaluatorType =
  | "retrieve_value"
  | "backend_state"
  | "ui_state"
  | "final_response";
```

### `backend_state`

默认首选。适用于 checkout、发帖、改设置、提交表单、创建 issue、编辑文件等任务。

原则：

- 验证最终业务状态，不验证点击路径。
- 检查必须具体，例如数量、价格上限、禁止项、状态字段。
- evidence 中放可解释的快照，例如 order、submitted answer、created issue。
- 不依赖 telemetry 判断核心成功。

示例：

```ts
passedEvaluator({
  type: "backend_state",
  name: "submitted standard-shipping charger order",
  evidence: { orderId: order.id, total: order.total },
});
```

### `retrieve_value`

用于信息检索任务，例如从 wiki、repo 文档、商品详情或论坛帖子中找到答案。

原则：

- 标准答案必须来自 deterministic seed。
- 比较前做必要 normalize，例如 trim、大小写、日期格式。
- 如果答案通过站内表单提交，则仍可配合 `backend_state` 验证提交已保存。
- 不要只靠最终自然语言回复，除非任务本身就是回答问题。

### `ui_state`

用于验证用户必须到达或看到某个页面状态，例如 order confirmation、search result、article viewed。

原则：

- 只检查稳定的 URL、标题、确认文案或 server-owned view marker。
- 不把 CSS class、布局细节、动画状态作为评分依据。
- 如果可以用 `backend_state` 表达成功，`ui_state` 应作为辅助 evaluator。

### `final_response`

用于验证 agent 最终文本格式或汇报内容。

原则：

- hosted-web 中不要把 `final_response` 作为唯一成功证据，除非任务是纯信息问答。
- 如果系统暂时没有收集 final response，应把它设为 optional evaluator。
- 需要结构化输出时，明确要求字段和格式。

## Task 设计规则

一个好的 hosted task 应该：

- goal 一句话可读，包含所有关键约束。
- start path 明确，不要求 agent 猜入口。
- 成功条件可由服务端状态判断。
- 页面数量控制在 2 到 6 个关键页面。
- 至少有一个容易犯错的约束，例如价格上限、禁止商品、目标日期、指定分类。
- 不依赖外部网络、真实账号、第三方 API 或真实付款。
- 不要求图片识别，除非专门测试视觉能力。

一个不好的 hosted task 通常有这些问题：

- 只靠“用户看起来完成了”来评分。
- seed 数据随机导致答案漂移。
- success condition 需要分析完整 DOM 轨迹。
- 任务目标含糊，例如“买一个合适的商品”但没有可评分约束。
- 实现了大量与任务无关的页面。
- 每个 app 新建独立数据库表，导致 hosted app 扩展困难。

## Route 与 Action 约束

Route 只做 HTTP 层工作：

- 校验 session token。
- 解析 path、query、form。
- 调用 app action。
- 调用 `persistSessionSnapshot`。
- 发必要 telemetry 或 task signal。
- 返回 app render HTML 或 redirect。

Action 只做业务状态变更：

- 不读写 HTTP request。
- 不直接写数据库。
- 不构造 HTML。
- 不调用 orchestrator。

这样小模型生成 app 时不容易把所有逻辑塞进 route，也方便后续复用 action 做测试。

## Evidence 与数据库粒度

Hosted app 不应该给每个 site 开业务表。控制平面数据库的持久化粒度应保持通用：

- `hosted_web_sessions`: session metadata、状态、app state snapshot。
- `hosted_web_events`: 轻量事件，用于前端展示和调试。
- `hosted_web_results`: session 完成后的 score、evaluator breakdown、final state。
- `benchmark_attempt_scores`: attempt 或 suite 聚合结果。

App-specific 业务数据优先保存在 session snapshot 中，完成后把必要 evidence 写入 `final_state`。这能支持长期扩展 app 列表，而不需要为 `forum-lite`、`repo-lite`、`map-lite` 分别创建表。

## 小模型实现提示词模板

给代码生成 agent 的任务可以使用以下结构：

```text
在 apps/hosted-sites 中新增 <app-slug> hosted benchmark app。

目标：
- app id: <app-slug>
- start path: <start-path>
- task goal: <one-sentence-goal>
- required success:
  - <backend condition 1>
  - <backend condition 2>
  - <retrieve/ui/final condition if needed>

实现要求：
- app 代码放在 apps/hosted-sites/src/apps/<app-slug>/
- 拆分 types.ts, seed.ts, actions.ts, render.ts, evaluate.ts, final-state.ts
- route 放在 apps/hosted-sites/src/routes/<route-name>.ts
- 注册 runtime/app-registry.ts
- 更新 evaluation.ts dispatcher
- 更新 server.ts route composition
- 使用 @agentbench/scoring 的 passedEvaluator, failedEvaluator, aggregateStrictScore
- 所有 Node ESM 相对 import 使用 .js 后缀
- 不新增数据库表
- 不修改 hosted-orchestrator，除非 task lifecycle 需要变化
- 添加至少一个成功评分测试和一个失败评分测试
```

## 示例：`forum-lite`

推荐最小状态：

```ts
type ForumState = {
  threads: Array<{
    id: string;
    title: string;
    category: string;
    posts: Array<{ id: string; author: string; body: string }>;
    locked?: boolean;
  }>;
  moderationActions: Array<{
    id: string;
    threadId: string;
    action: "lock" | "pin" | "remove_post";
    reason: string;
  }>;
};
```

推荐任务：

```text
Find the thread about battery swelling, reply with the official recall link from the policy post, then lock the thread with reason "safety escalation".
```

评分：

- `retrieve_value`: 回复内容包含 seed 中的 recall link。
- `backend_state`: 目标 thread 存在 agent reply。
- `backend_state`: 目标 thread 被 lock。
- `backend_state`: moderation reason 等于 `safety escalation`。
- `ui_state`: optional，最终页面显示 locked banner。

## 示例：`repo-lite`

推荐最小状态：

```ts
type RepoState = {
  issues: Array<{ id: string; title: string; labels: string[]; status: "open" | "closed" }>;
  files: Array<{ path: string; content: string }>;
  mergeRequests: Array<{
    id: string;
    title: string;
    changedFiles: Array<{ path: string; content: string }>;
    targetBranch: string;
  }>;
};
```

推荐任务：

```text
Fix the README install command to use pnpm, then open a merge request titled "Fix install instructions" targeting main.
```

评分：

- `backend_state`: MR title 精确匹配。
- `backend_state`: target branch 为 `main`。
- `backend_state`: README 内容包含 `pnpm install` 且不再包含错误命令。
- `ui_state`: optional，MR confirmation 页面可见。

## 测试要求

新增 app 后至少运行：

```bash
pnpm --filter hosted-sites test
pnpm --filter hosted-sites build
pnpm --filter hosted-orchestrator build
bash apps/hosted-sites/scripts/orchestrator-smoke.sh
```

如果 app 会进入默认 suite，还要运行 full-pass smoke：

```bash
HOSTED_SITES_PORT=4011 HOSTED_ORCHESTRATOR_PORT=5011 bash apps/hosted-sites/scripts/orchestrator-smoke-full-pass.sh
```

测试至少覆盖：

- seed state 能创建 session。
- 成功路径 evaluator 全部通过。
- 缺少关键业务状态时 score 为 `0`。
- route mutation 后 session snapshot 被持久化。
- complete 后 final state evidence 包含评分所需字段。

## 接受标准

一个新 hosted app 合格的最低标准：

- app id 已注册到 `runtime/app-registry.ts`。
- route 已接入 `server.ts`。
- `evaluate.ts` 返回 evaluator breakdown，而不是只返回总分。
- required evaluator 至少包含一个 `backend_state`，除非任务是纯信息检索。
- `final-state.ts` 不泄漏无关 session 数据或 token。
- app 不新增独立业务表。
- app 不要求 server 端启动浏览器。
- app 能在 orchestrator suite 中作为一个 session 被初始化、访问、完成、计分。

## 后续改进方向

当前新增 app 仍需手动更新 `evaluation.ts` dispatcher 和 `server.ts` route composition。后续可以继续把 app registry 扩展成完整插件式接口：

```ts
type HostedAppDefinition = {
  id: string;
  getDefaultStartPath: () => string;
  getDefaultGoal: (taskSlug: string) => string;
  buildInitialSessionState: () => HostedAppSessionState;
  buildFinalState: (session: HostedSession) => unknown;
  evaluate: (session: HostedSession) => HostedWebScoreResult;
  routes: HostedRouteHandler[];
};
```

这样 `forum-lite`、`repo-lite`、`map-lite` 可以只注册 app definition，而不继续扩大顶层 dispatcher。
