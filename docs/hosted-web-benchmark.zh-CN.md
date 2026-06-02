# 托管 Web 基准测试

> [English](./hosted-web-benchmark.md) | 中文
>
> App 生成与评分实现指南见：[Hosted-Site App 设计与评分指南](./hosted-site-app-authoring.zh-CN.md)。

## 目的

托管 Web 基准测试是公共的、由 AgentBench 控制的网站，模拟真实的 Web 应用程序，同时将执行保留在用户的代理环境中。

此模型适用于 WebArena 类任务，其中平台应提供确定性的目标网站、会话状态、遥测和评分，但不应为每次运行启动服务器端 Chromium 实例。

## 为什么存在

当前的 AgentBench runner 支持两种有用的模式：

- 用于确定性本地演示的内部 Playwright 场景
- 用户代理执行工作的外部代理 MCP 会话

完整的 WebArena 风格托管增加了另一个维度：具有任务特定状态的真实多页 Web 应用程序。将那些环境与每个运行一个浏览器一起运行会很快变得昂贵。

托管 Web 基准测试将问题拆分：

- AgentBench 托管基准网站。
- 用户的代理控制自己的浏览器。
- 网站和平台报告观察到的行为和服务器端状态。
- 评分基于受控的基准状态，而不是浏览器执行所有权。

这在避免服务器端浏览器横向扩展的同时保留了大部分基准价值。

## 非目标

此模型不是规范 WebArena 评估的直接替代品。

它不保证：

- 与 WebArena 论文或排行榜相同的分数
- 与 WebArena Python 测试框架的完整轨迹兼容性
- 服务器拥有的浏览器隔离
- 对浏览器原生 UI、扩展、下载或跨源帧的完全可见性

当精确的 WebArena 可比性很重要时，AgentBench 应使用带有原始环境和评估器的专用 WebArena 提供程序。

## 高层架构

```text
外部代理浏览器
  |
  | 使用运行/会话令牌打开任务启动 URL
  v
托管基准站点
  |
  | 遥测事件、任务信号、截图
  v
AgentBench Web API
  |
  | run_events、产物、分数更新
  v
实时查看器和评分器
```

平台拥有基准站点和任务状态。代理拥有浏览器执行。

## 运行、尝试、会话

托管 Web 基准测试应支持单站点任务和多站点套件。

长期层次结构是：

```text
benchmark_runs
  面向用户的执行记录

benchmark_attempts
  运行下的一个具体套件执行

hosted_web_sessions
  尝试中的一个站点/任务会话

hosted_web_results
  每个会话的分数和最终状态证据

benchmark_attempt_scores
  尝试中所有会话的汇总分数
```

这避免将 `benchmark_runs` 直接绑定到单个托管站点。运行稍后可以执行如下套件：

```text
webarena-lite-v1
  01 shopping-lite / 受限结账
  02 forum-lite / 回复线程
  03 repo-lite / 创建合并请求
  04 wiki-lite / 检索答案
```

当前的单站点托管运行在 Supabase 服务角色访问可用时创建一个隐式的 `benchmark_attempt`。本地预览和模拟存储运行仍然可以将 `attempt_id` 留空，以便 hosted-sites 在没有数据库支持的运行行的情况下仍然可用。

### 编排器 URL

多站点托管套件最终应暴露一个面向代理的编排器 URL：

```text
https://hosted.agentbench.dev/attempt/<attempt-token>
```

编排器拥有：

- 有序会话列表
- 当前任务指针
- 下一个任务路由
- 套件完成检测
- 汇总评分触发

代理不应需要手动处理多个站点 URL。

## 目标服务边界

托管 Web 架构最终应将四个职责分开：

```text
apps/web
  运行控制平面
  认证和配额
  实时查看器和回放
  公共 API

apps/hosted-sites
  基准网站
  任务 UI
  遥测发射
  任务端状态变化

托管会话服务
  会话分配
  种子数据
  令牌发放
  生命周期和过期
  清理

评分服务
  评估器执行
  backend_state 检查
  ui_state 检查
  final_response 检查
  分数汇总
```

这些一开始不需要是独立的进程。第一个实现应通过 `apps/web` 和 `apps/hosted-sites` 保持部署简单，同时将会话和评分代码保留在包边界后面，这些包边界以后可以成为服务。

推荐的推进顺序：

1. `apps/web + apps/hosted-sites`：会话和评分逻辑是模块。
2. 为托管会话、任务状态、事件和分数结果添加持久表。
3. 提取 `packages/scoring` 用于评估器类型和确定性汇总。
4. 提取 `packages/hosted-sessions` 用于令牌、种子、生命周期和清理逻辑。
5. 仅当多个托管站点、异步评分、LLM 评判或清理压力证明拆分时，才拆分 `session-service` 和 `scoring-service`。

`apps/web` 应拥有运行生命周期。`apps/hosted-sites` 应拥有任务 UI 和任务端状态变更。评分应读取基准状态并生成评估器级结果。会话管理应拥有设置和清理。

## 核心组件

### 托管基准站点

一个长期运行的公共网站，模拟真实的应用程序，例如：

- 购物
- 论坛
- 邮件
- 文档
- 管理控制台
- CRM
- 项目跟踪器

该站点必须支持会话级数据，以便多个运行可以并发使用相同的部署。

### 会话分配器

Web 应用创建基准运行并分配基准会话。

会话绑定：

- 运行 ID
- 基准案例 ID
- 任务模板 ID
- 种子数据版本
- 初始账户或租户
- 启动 URL
- 评分策略

启动 URL 应包含一个不透明的会话令牌，例如：

```text
https://shop.benchmark.example/tasks/start?session=<session-token>
```

令牌不应暴露原始数据库 ID 或 secrets。

### 遥测脚本

托管基准站点应发送结构化的运行事件。

初始事件类型：

```ts
type HostedWebTelemetryEvent =
  | { type: "page.load"; url: string; title: string }
  | { type: "navigation"; from: string; to: string }
  | { type: "click"; selector: string; text?: string; role?: string }
  | { type: "input"; selector: string; valuePreview: string }
  | { type: "submit"; selector: string }
  | { type: "task.signal"; name: string; payload: Record<string, unknown> };
```

遥测应足以用于回放和调试，但它不应是主要评分来源。

### 评分器

评分应尽可能检查服务器端基准状态。

示例：

- 订单是使用所需产品和价格限制创建的
- 论坛回复发布在正确的线程下
- 草稿邮件存在且没有邮件被发送
- 文档已使用所需字段更新
- 管理设置更改为预期值

用户操作对可观测性很有用，但状态是更强的成功信号。

### 重置和清理

每次运行必须具有确定性的初始状态和清理路径。

首选模型：

- 一个长期运行的站点部署
- 每次运行会话一个租户或工作区
- 带有 `session_id` 标签的种子行
- 评分器仅读取该会话的状态
- 完成后清理删除或归档该会话

除非隔离要求强制，否则避免每次运行启动完整的应用程序堆栈。

## 会话隔离

首选的隔离模型是每个会话一个租户。

业务表应包含会话或租户键：

```sql
session_id uuid not null
```

运行设置：

1. 创建基准运行
2. 分配会话 ID
3. 为该会话植入任务特定数据
4. 返回启动 URL 和任务目标
5. 将运行标记为 `waiting_for_agent`

运行完成：

1. 评分器读取会话级状态
2. 评分器发出分数和失败原因
3. 平台存储产物和最终状态
4. 清理归档或删除会话数据

这允许多个运行共享相同的托管站点，同时保持基准状态分离。

## 遥测策略

第一个实现应避免完整的 DOM 差异和连续视频。

推荐默认值：

- 记录页面加载和导航
- 记录点击、输入、提交和任务信号事件
- 仅在重要状态转换时捕获截图
- 在完成或失败时捕获最终 DOM 快照
- 活动时每 5 到 10 秒使用心跳

当实时查看器正在 actively 观看运行时，截图频率可以增加。

输入值应默认被编辑或截断。仅在回放或评分需要时存储预览，并避免记录凭证或私有令牌。

## 评分策略

评分层次结构应为：

1. 确定性服务器端状态检查
2. 确定性 DOM 或页面状态检查
3. 用于自由形式内容质量的 LLM 评判
4. 用于模糊案例的人工审查

基于状态的评分应是生产基准案例的默认设置。

示例购物评分器：

```text
通过条件：
- 会话恰好有一个已提交的订单
- 订单包含请求的产品类别
- 总价低于任务限制
- 没有添加不允许的产品
```

示例邮件评分器：

```text
通过条件：
- 会话有一个草稿回复
- 草稿包含必需的实体
- 没有消息被发送
```

## 与 WebArena 的关系

托管 Web 基准测试可以将 WebArena 用作任务灵感来源，但除非它们运行原始的 WebArena 环境和评估器，否则应单独标记。

推荐命名：

- `native`：当前确定性的 AgentBench 模拟案例
- `hosted-web`：具有外部浏览器执行的公共 AgentBench 托管基准站点
- `webarena`：规范的 WebArena 环境和评估器集成

这种区分防止用户将 WebArena 类任务与 WebArena 可比结果混淆。

## 与当前仓库的契合

当前组件自然地映射到此模型：

- `apps/web`：运行创建、会话分配、遥测摄取、实时查看器
- `apps/mock-sites`：可以演变为托管基准站点
- `apps/runner`：对于内部 Playwright 演示和未来规范提供程序仍然有用
- `packages/protocol`：共享事件和运行模式
- `packages/scoring`：未来确定性评分器的归宿

对于第一个版本，`apps/mock-sites` 可以在 `apps/web` 记录遥测和评分事件的同时托管一个会话感知任务。

## 替换模拟站点

长期目标是让托管 Web 基准测试替换当前的静态 `mock-sites` 模式。

今天 `apps/mock-sites` 提供静态 HTML 页面，内部 runner 针对它们执行硬编码的 Playwright 场景。这对于演示很有用，但有三个限制：

- 基准状态主要是页面本地的，而不是会话级服务器状态
- 成功由 runner 模拟，而不是从任务状态评估
- 如果不将静态页面转变为应用层，任务无法扩展到 WebArena 类工作流

替换应将 AgentBench 从静态模拟页面转移到会话感知托管基准站点。

目标形态：

```text
apps/hosted-sites 或演进的 apps/mock-sites
  基准应用程序
  任务模板
  会话级种子数据
  遥测脚本
  任务信号 API

apps/web
  运行创建
  托管会话分配
  遥测摄取
  评分编排
  实时查看器

packages/scoring
  确定性评估器定义
  评分器实现
  共享分数结果类型
```

内部 Playwright runner 可以保留用于回归和冒烟测试，但它不应再是主要的基准执行路径。

## 精简基准应用

托管基准站点不应尝试克隆 Magento、GitLab、Postmill、Kiwix 或 OpenStreetMap 等重型产品。

目标是重现任务压力，而不是完整的应用程序。

AgentBench 应实现精简基准应用：

```text
任务界面 + 会话状态 + 评分器
```

而不是：

```text
完整产品克隆
```

每个应用应仅实现基准任务所需的页面、交互和持久化状态。

### WebArena 站点映射

| WebArena 风格站点 | 避免克隆 | 改为实现 |
| --- | --- | --- |
| 购物 | 完整目录、库存、促销、支付、账户系统 | 产品搜索、筛选、购物车、结账、订单状态 |
| 购物管理 | 完整商务管理 | 产品编辑、订单状态、折扣规则、设置切换 |
| GitLab | git 存储、CI、权限、完整合并请求引擎 | 问题列表、文件浏览器、文件编辑器、分支选择器、合并请求表单 |
| 论坛 | 完整社区平台 | 线程列表、帖子详情、回复、投票、管理操作 |
| Wikipedia/Kiwix | 完整离线百科全书 | 带有链接和引用的小型确定性 wiki 语料库 |
| 地图/OpenStreetMap | 瓦片服务器、路由引擎、地理编码器 | 地点搜索、地点详情、距离表、路由结果夹具 |

这使基准对代理足够真实，同时保持实现可控。

### 推荐应用集

初始托管应用：

- `email-lite`：收件箱、线程、草稿、发送、标签
- `shopping-lite`：产品目录、筛选、购物车、结账
- `repo-lite`：问题、文件、编辑器、合并请求
- `forum-lite`：线程、回复、投票、管理
- `wiki-lite`：确定性文章语料库和搜索
- `admin-lite`：设置、产品编辑、订单状态
- `map-lite`：地点搜索和路由夹具

`lite` 后缀是实现细节。面向用户的标签应描述任务领域，而不是暴露站点是部分的。

### 实现边界

一旦第一个会话感知 PoC 工作，创建一个单独的应用：

```text
apps/hosted-sites
  src/
    server.ts
    apps/
      email/
      shopping/
      repo/
      forum/
      wiki/
      admin/
      map/
    tasks/
      definitions.ts
      seed.ts
    telemetry/
      client.ts
      server.ts
    scoring/
      evaluate.ts
```

第一个 PoC 可能演进 `apps/mock-sites`，但替换路径应移至 `apps/hosted-sites`，以便静态演示页面和托管基准应用不共享相同的边界。

### 共享应用要求

每个托管基准应用应提供：

- 会话级种子数据
- 确定性启动 URL
- 遥测事件发射
- 重要状态变化的任务信号发射
- 可以评分的的服务器端状态
- 按会话 ID 清理

托管应用应避免每个站点添加一组关系表。使用运行时状态作为可变任务数据，并仅持久化已清理的事件和最终结果快照。

### 运行时状态模型

建议的运行时状态域：

```text
email-lite：线程、消息、草稿、已发送消息
shopping-lite：产品、购物车、订单
repo-lite：项目、问题、文件、合并请求、文件更改
forum-lite：线程、帖子、投票、管理操作
wiki-lite：页面、搜索索引
admin-lite：设置、审计日志
map-lite：地点、路由
```

这些模型可以存在于内存、Redis/KV 或站点本地存储中。AgentBench 控制平面数据库不应镜像每个托管应用的业务模式。

### 第一个 PoC 选择

从 `shopping-lite` 或 `repo-lite` 开始。

`shopping-lite` 优势：

- 在 UI 中易于解释
- 清晰的后端状态评分器
- 良好的搜索、筛选、购物车和结账覆盖
- 接近 WebArena 购物任务

`repo-lite` 优势：

- 无需运行 GitLab 的强 WebArena/GitLab 风格
- 对代码代理工作流有用
- 通过问题、文件编辑和合并请求进行清晰的状态验证

推荐的第一个任务：

```text
shopping-lite / 受限结账
```

原因：

- 更简单的状态模型
- 快速植入
- 简单的二元评分
- 适合实时回放

示例成功条件：

```text
backend_state:
- 会话存在已提交的订单
- 订单恰好包含一个充电器产品
- 总价小于或等于 30
- 订单配送方式是标准
- 订单中没有出现受限产品

ui_state:
- 最终页面显示订单确认

final_response:
- 代理报告已提交的订单 ID
```

### 构建顺序

1. 使用会话级种子数据实现 `shopping-lite`。
2. 在 `apps/web` 中添加托管会话分配。
3. 从运行连接负载返回托管启动 URL。
4. 从托管站点向 `run_events` 发射遥测。
5. 为结账任务实现 `backend_state` 评分器。
6. 在运行事件中展示评估器级分数详情。
7. 将应用代码移入 `apps/hosted-sites`。
8. 将剩余的静态模拟案例移植到精简应用中。

## WebArena-Verified 风格评估模型

托管 Web 基准测试应使用受 WebArena-Verified 启发的评分器形态。

每个任务可以在四个评估器族中定义成功条件：

- `retrieve_value`：验证代理报告的信息
- `backend_state`：验证持久化的应用程序状态
- `ui_state`：验证页面可见状态
- `final_response`：验证代理的最终响应格式和内容

这些族是独立的。任务可能只使用一个，但生产级任务应在可能时优先选择 `backend_state`。

示例任务定义：

```ts
type HostedWebTaskDefinition = {
  id: string;
  slug: string;
  title: string;
  goal: string;
  app: "shopping" | "email" | "forum" | "docs" | "admin";
  startPath: string;
  seedVersion: string;
  maxSteps?: number;
  evaluators: HostedWebEvaluator[];
};

type HostedWebEvaluator =
  | RetrieveValueEvaluator
  | BackendStateEvaluator
  | UiStateEvaluator
  | FinalResponseEvaluator;
```

### `retrieve_value`

当任务要求代理查找或报告信息时使用此选项。

示例：

```ts
type RetrieveValueEvaluator = {
  type: "retrieve_value";
  key: string;
  source: "final_response" | "task_signal";
  match:
    | { mode: "exact"; value: string }
    | { mode: "must_include"; values: string[] }
    | { mode: "numeric"; op: "eq" | "lt" | "lte" | "gt" | "gte"; value: number }
    | { mode: "llm_fuzzy"; reference: string; rubric: string };
};
```

这映射到原始的 WebArena 字符串匹配族，但保持结果结构化。

### `backend_state`

尽可能在基准站点拥有相关状态时使用此选项进行任务完成评估。

示例：

```ts
type BackendStateEvaluator = {
  type: "backend_state";
  entity: "order" | "draft" | "post" | "document" | "setting";
  query: Record<string, unknown>;
  assertions: Array<
    | { field: string; op: "exists" }
    | { field: string; op: "equals"; value: unknown }
    | { field: string; op: "contains"; value: string }
    | { field: string; op: "lte" | "gte" | "lt" | "gt"; value: number }
    | { field: string; op: "not_exists" }
  >;
};
```

这应该是默认评分来源，因为它是确定性的且与路径无关。

### `ui_state`

当可见的 UI 状态很重要或后端状态不足时使用此选项。

示例：

```ts
type UiStateEvaluator = {
  type: "ui_state";
  url?: { mode: "contains" | "exact"; value: string };
  selectors: Array<{
    selector: string;
    assertion:
      | { mode: "exists" }
      | { mode: "text_includes"; value: string }
      | { mode: "value_equals"; value: string };
  }>;
};
```

应谨慎使用，因为 DOM 选择器比服务器端状态更脆弱。

### `final_response`

使用此选项验证最终代理消息。

示例：

```ts
type FinalResponseEvaluator = {
  type: "final_response";
  schema?: Record<string, unknown>;
  requiredFields?: string[];
  assertions?: Array<
    | { field: string; op: "equals"; value: unknown }
    | { field: string; op: "must_include"; values: string[] }
    | { field: string; op: "llm_fuzzy"; reference: string; rubric: string }
  >;
};
```

对于托管 Web 基准测试，最终响应不应是成功的唯一证据，除非任务纯粹是信息性的。

## 分数结果形态

评分器应产生评估器级结果，而不仅仅是一个数字。

```ts
type HostedWebScoreResult = {
  score: number;
  status: "passed" | "failed" | "error";
  summary: string;
  evaluators: Array<{
    type: "retrieve_value" | "backend_state" | "ui_state" | "final_response";
    name: string;
    score: number;
    status: "passed" | "failed" | "error";
    evidence?: Record<string, unknown>;
    errorMessage?: string;
  }>;
};
```

汇总分数最初应是严格的：

- 所有必需的评估器通过：`1`
- 任何必需的评估器失败：`0`
- 可选评估器可以被记录而不改变通过/失败

可以稍后添加部分评分，但严格的二元评分在替换模拟站点路径时更容易理解。

## 从 `mock-sites` 的迁移路径

迁移应分阶段进行。

### 阶段 1：会话感知模拟站点

保持现有的应用名称，但添加会话感知行为。

交付物：

- 一个带有 `session_id` 的托管任务
- 确定性种子数据
- 遥测脚本
- 后端状态评分器
- 在运行连接负载中返回的启动 URL

候选任务：邮件草稿或购物结账。

### 阶段 2：托管提供程序元数据

为基准案例添加提供程序元数据。

交付物：

- 新案例的 `provider = "hosted-web"`
- 带有套件/会话形态、启动路径、应用名称、种子版本和评估器列表的任务元数据
- 运行连接负载包括 `hostedWeb.attemptId`、有序的 `sessions[]` 和一个编排器 URL 占位符
- 现有的 MCP 详情对于托管 Web 运行变为可选

### 阶段 3：评分包

将评分移入共享包。

交付物：

- `packages/scoring`
- 评估器结果类型
- 后端状态评估器
- 最终响应评估器
- 确定性分数汇总

### 阶段 4：替换静态页面

将当前的静态模拟工作流转为托管基准应用。

映射：

- `web-search` 变为带有 `retrieve_value` 和 `final_response` 的检索任务
- `invoice-download` 变为带有 `backend_state` 或产物验证的文档/会计任务
- `email-draft` 变为带有 `backend_state` 和 `final_response` 的邮件应用任务
- `safety-test` 变为带有 `backend_state`、`ui_state` 和禁止操作检查的策略任务

### 阶段 5：弃用内部演示 Runner 作为主要路径

保留内部 Playwright 执行用于冒烟测试和演示，但将正常基准运行移至托管 Web 外部执行。

交付物：

- 首页默认为托管 Web 案例
- 内部模式隐藏在开发/演示控制后面
- runner 不再拥有托管 Web 案例的主要成功分数
- 实时查看器从托管 Web 流中读取遥测和评分事件

## 建议的数据模型补充

第一个持久化模式有意限定于托管尝试、托管会话、轻量级托管事件、最终分数结果和汇总尝试分数。

`benchmark_cases` 补充：

```sql
provider text not null default 'native'
metadata jsonb not null default '{}'
```

托管会话和事件表：

```sql
benchmark_attempts
hosted_web_sessions
hosted_web_events
hosted_web_results
benchmark_attempt_scores
hosted_web_access_logs
```

`hosted_web_results.final_state` 将应用特定的最终快照存储为 JSON 证据，例如 `shopping-lite` 的已提交订单或 `repo-lite` 的合并请求。

会话令牌应在静态时进行哈希处理，因为它授予对任务状态和遥测提交的访问权限。托管运行时写入应使用服务器端代码的服务角色。经过身份验证的用户应只能读取与他们自己的基准运行关联的托管会话、事件和结果行。

当前迁移：

- `supabase/migrations/20260529000006_hosted_web_cases.sql`
- `supabase/migrations/20260529000007_hosted_web_persistence.sql`
- `supabase/migrations/20260529000008_benchmark_attempts.sql`

`attempt_id` 在托管会话/事件/结果行上对于第一次转换是可空的。Web 应用现在在可能的情况下为托管 Web 运行创建一个隐式尝试，将其传递给 hosted-sites，hosted-sites 针对该尝试写入会话、事件、结果和 `benchmark_attempt_scores` 行。一旦每个托管运行都有数据库支持，`attempt_id` 就可以变为必需的。

## API 形态

初始端点：

```text
POST /api/runs
POST /api/hosted-web/sessions
POST /api/hosted-web/telemetry
POST /api/hosted-web/score
POST /api/hosted-web/complete
```

遥测端点应通过会话令牌进行身份验证，并写入规范化的 `run_events`。

评分端点应由受信任的评分器服务或服务器端作业调用，而不是由任意浏览器代码调用。

## MVP 实现计划

1. 添加 `hosted-web` 作为基准提供程序概念。
2. 添加一个会话感知托管基准案例，最好是购物或邮件。
3. 在创建运行时分配会话。
4. 在连接负载中返回启动 URL。
5. 添加将观察到的 DOM 事件记录为 `run_events` 的遥测端点。
6. 添加读取会话级服务器状态的确定性评分器。
7. 在现有的实时运行查看器中显示遥测事件。
8. 添加已完成或过期会话的清理。

## 当前进度

在当前迁移轨道中实现：

- 托管基准元数据现在支持套件风格的 `sessions[]` 定义，带有 `app`、`taskSlug`、`sequenceIndex`、`weight` 和 `required`
- Web 端编排为每次运行创建一个托管 `benchmark_attempt` 加上一个有序的托管会话列表
- 连接负载现在是以尝试为范围的，而不是单会话范围的
- hosted-sites 会话创建接受套件/会话元数据并持久化 `app`、`sequence_index`、`goal` 和 `title`
- 尝试汇总现在读取尝试的所有托管结果并写入加权必需会话细分
- `wiki-lite` 现在作为第二个真实托管应用与 `shopping-lite` 一起可用
- hosted-sites 现在暴露一个尝试概览页面和一个最小的 `GET /api/attempts/:attemptId/advance` 辅助程序
- 尝试进度现在持久化在 `benchmark_attempts.metadata` 中，带有 `activeSessionId`、`activeSequenceIndex` 和 `completedSessionIds`
- Web 连接负载现在从 `benchmark_attempts + hosted_web_sessions` 重建托管套件状态，而不是仅依赖内存分配

最新的本地冒烟测试：

- 创建了一个本地尝试，带有 `shopping-lite` 会话 `0` 和 `wiki-lite` 会话 `1`
- 完成购物结账并验证 `advance` 返回了 wiki 会话 URL 而不是关闭套件
- 打开 wiki 发布历史内容，提交 `June 1, 2026`，并验证 `wiki-lite` 分数 `= 1`
- DB 支持的外部代理运行 `065fac39-7c5b-438e-ba2a-2a7c6d5546d9` 完成，具有：
  - `benchmark_runs.status = completed`，`score = 1`
  - 一个 `benchmark_attempt`，`status = completed`，`aggregate_score = 1`
  - 两个 `hosted_web_sessions`，序列 `0/1`，都 `completed`
  - 两个 `hosted_web_results`（`shopping-lite`、`wiki-lite`），`score = 1`
  - 一个 `benchmark_attempt_scores` 行，`aggregation = weighted-required-suite`
- 运行 `d21ec807-c135-42e0-abff-c13fe471fd36` 的重新连接冒烟测试显示：
  - 会话 `0` 完成后，`benchmark_attempts.metadata.activeSessionId` 前进到 wiki 会话
  - 新的 `GET /api/runs/:runId/connect` 返回 wiki 会话作为 `activeSessionId`
  - 连接负载进度从 `0 / 2` 变为 `1 / 2`
- 运行 `38a7e188-c0e9-41ce-b286-dcbef55f89bc` 的 hosted-sites 重启冒烟测试显示：
  - 购物车状态持久化到 `hosted_web_sessions.metadata.appState`
  - 重启 hosted-sites 后，`/shopping/cart?session=...` 仍然显示保存的购物车行和总价
  - `/attempts/:attemptId` 和 `/api/attempts/:attemptId/advance` 都从数据库恢复了兄弟会话
- 运行 `c6a6f5c7-f80e-4492-ae07-f9c86e387553` 的幂等性/转换冒烟测试显示：
  - 完成购物一次将 wiki 会话 `1` 从 `created` 提升到 `active`
  - 使用第一个会话令牌调用 `advance` 从持久化的尝试状态返回 wiki 会话 URL
  - 重复 `POST /api/sessions/:token/complete` 对于已完成的购物会话没有插入第二个 `hosted_web_results` 行
- 运行 `38f8f98f-8ebe-4b6f-9a7d-864a5fa21273` 的访问/过期冒烟测试显示：
  - 两个托管页面请求增加了 `hosted_web_sessions.access_count` 并记录了 `first_seen_*`、`last_seen_*` 和 `last_accessed_at`
  - `hosted_web_access_logs` 为每个请求写入一个 `session.access` 行，带有 IP 和用户代理元数据
  - 将 `expires_at` 强制设置为过去导致下一个托管请求返回 `400 {"error":"Missing or invalid session"}`
  - 相同的请求将会话行标记为 `expired` 并插入了一个 `session.expired_rejected` 访问日志行
- 运行 `9f6f04fa-6b81-4e33-ba05-05f7a1f1d253` 和 `31b86c0d-0665-40cd-a016-f9b6bba82d33` 的清理清理器冒烟测试显示：
  - 使用 `HOSTED_SESSION_SWEEP_INTERVAL_MS=1000`，一个 `session.access` 行在超过配置的保留窗口后自动被清理
  - 将第二个会话的 `expires_at` 强制设置为过去导致后台清理在没有等待另一个请求的情况下将行标记为 `expired`
  - 清理写入了一个 `session.expired_swept` 访问日志行并从内存运行时中移除了过期的会话
- 运行 `70fc317d-2c83-4799-b45c-5ac5dd67444b` 的超时策略冒烟测试显示：
  - 使活动的购物会话过期导致清理器将整个托管尝试标记为 `timeout`
  - 兄弟托管会话也被移至 `expired`，以便套件无法从陈旧的第二个会话恢复
  - `benchmark_runs.status` 移至 `timeout`，`score = 0`，`error_message` 从托管超时摘要中填充
  - `benchmark_attempt_scores` 接收到一个超时形态的 `error` 行，`aggregation = "timeout"`
  - 新的 `GET /api/runs/:runId/connect` 返回 `activeSessionId = null` 且没有编排器 URL，而不是回退到会话 `0`
- 生命周期提取进度：
  - 尝试转换逻辑现在提取到 `apps/hosted-sites/src/attempt-lifecycle.ts`
  - `server.ts` 现在调用专用的 `attemptLifecycle` 服务对象来执行：
    - 会话最终化
    - 尝试前进解析
    - 过期会话超时
  - 路由处理程序现在发出显式的生命周期命令，例如：
    - `complete-session`
    - `resolve-advance`
    - `timeout-attempt`
  - 这仍然是一个进程内命令边界，而不是单独的可部署服务，但它将生命周期规则从路由处理程序中移除，并使下一次服务拆分变得简单

当前限制：

- 尝试概览仍然是一个轻量级辅助页面，而不是有状态的编排器 UI
- UI 仅显示基本的套件进度和活动会话上下文
- 生命周期现在是一个专用的模块边界，但还不是单独部署的服务或队列支持的命令处理器
- wiki 文章查看证明仍然依赖于托管遥测而不是持久化的服务器端读取模型
- 还没有外部调度器；清理当前在每个 hosted-sites 进程内运行，基于间隔的尽力而为语义

## 操作指导

从低遥测量开始。

推荐默认值：

- 无连续服务器端浏览器
- 无连续视频
- 无完整 DOM 差异流
- 仅操作级遥测
- 在导航、任务信号、完成和失败时截图
- 固定保留期后清理会话

相关的 hosted-sites 清理旋钮：

- `HOSTED_SESSION_SWEEP_INTERVAL_MS`
- `HOSTED_SESSION_TERMINAL_RETENTION_MS`
- `HOSTED_ACCESS_LOG_RETENTION_MS`

这使托管 Web 基准测试更接近正常的 Web 应用托管，而不是浏览器云基础设施。

## 开放问题

- 托管基准站点应存在于 `apps/mock-sites` 内还是成为单独的 `apps/hosted-sites` 应用？
- 遥测应直接发送到 `apps/web`，还是通过 runner 网关以保持部署一致性？
- 哪个评分器包边界应拥有基准特定的业务逻辑？
- 应在不创建隐私或存储问题的情况下为回放保留多少原始 DOM？
- 实时截图应由代理浏览器、基准站点还是可选的服务器端观察者捕获？
