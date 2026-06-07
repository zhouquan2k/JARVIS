[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# 架构总览

`docs/workspace.dsl` 是本仓库公开架构的主设计源。本文基于其中的 system context 和 container 视图解释系统结构，并要求与 DSL 同步维护。

## 系统上下文

ChatPrism 处于终端用户、外部 AI 提供方和用户知识资料库之间。

### 主要参与者

- 重度 AI 对话用户，需要对比模型输出、恢复历史会话并整理知识资产。

### 外部系统

- ChatGPT Web：提供基于网页登录态的模型访问与历史读取。
- Google Gemini API：提供模型执行与模型目录查询。
- Gemini Web：提供基于浏览器页面的历史提取能力。
- 本地或托管的知识资料库：存放文档、导入文件和作用域化工作区上下文。

## 容器视图

### Browser Extension App

- 在浏览器中承载聊天、对比、历史导入和知识工作区流程。
- 使用 Cookie、content script、扩展存储等浏览器能力。

### Web App

- 提供浏览器中的主工作台，用于聊天、对比和文档中心工作流。
- 通过同步服务获取共享上下文和 provider 配置。

### Desktop App

- 在共享 UI 之上增加桌面文件能力和受控页面能力。
- 复用共享包，并补充 Electron 宿主桥接逻辑。

### Sync Server

- 暴露会话同步 API、上下文 API 和 provider 配置接口。
- 将共享契约连接到基于文件系统或数据库的持久化实现。

### Shared Packages

- `packages/core`：跨包最小稳定契约、插件契约以及与宿主无关的通用基础设施。
- `packages/ui`：Markdown 文档工作区核心前端实现层，供 Web、Extension、Desktop renderer 复用的工作区壳、文档树交互、文档编辑流程、通用展示组件与扩展点渲染层。
- `packages/node`：供 Desktop main 和同步服务复用的 Node-only 适配层与基础设施实现。

## 职责边界

- 各宿主应用是运行时外壳与组合根，负责生命周期、bridge、存储、文件系统、浏览器能力等环境接入，但不拥有 AI 或任务业务逻辑。
- 各宿主应用应向上层暴露环境事实、能力句柄与 context，但不基于这些事实直接完成业务判断。
- `packages/ui` 是 Markdown 文档工作区核心前端实现层，负责文档树、文档编辑、工作区交互等核心工作区业务逻辑，以及工作区布局、通用渲染和共享组件；但不承载 AI 或任务插件特有的工作流、业务 store 或业务规则。
- AI、任务以及未来新增能力的业务逻辑归属于各自插件。
- `packages/core` 只保留跨包共享的最小稳定契约与宿主无关基础设施。
- 插件可以公开稳定 `api` 供宿主与桥接层依赖，但非插件代码不应依赖插件内部实现路径。
- 同步服务是远程上下文和数据同步的后端边界。
- 知识资料库即使部署在本地，也仍然被视为外部依赖。

## 宿主、UI、插件与 Core 的边界

### 宿主应用

- `apps/web`、`apps/desktop`、`apps/extension`、`apps/server` 负责运行时环境接入。
- 宿主代码可以负责插件启用与装配，但不应内嵌 AI 或任务的业务规则。
- 当运行环境差异会影响上层行为时，宿主应将其暴露为环境属性、能力句柄或 context，而不是在宿主内部直接编写业务分支。

### 通用 UI 与核心工作区前端层

- `packages/ui` 负责可复用工作区外壳、布局容器、通用组件、Markdown 文档工作区核心行为以及扩展点消费。
- 文档树交互、节点选择、文档打开/编辑/保存等核心工作区业务逻辑可以保留在 `packages/ui`。
- `packages/ui` 可以消费宿主暴露的环境事实与 context，并据此决定核心工作区前端行为。
- AI 和任务特有的状态机、工作流编排和业务规则不应继续沉积在 `packages/ui` 中。

### 插件层

- `plugins/*` 拥有领域模型、工作流、store、业务视图以及能力特定规则。
- 插件可以消费宿主暴露的环境事实与 context，并据此决定能力相关的行为。
- 插件内部实现应留在插件目录内部；跨包消费必须通过显式公共 `api`。

### Core 层

- `packages/core` 仅拥有宿主、文档工作区与插件系统共同需要的最小稳定契约。
- 属于 AI 或任务能力的领域契约不应长期保留在 `packages/core` 中。

## Markdown 文档编辑策略

Markdown 编辑面有两种模式，后端各不相同：

- **viewer 模式**：渲染 Crepe/Milkdown（ProseMirror）实时文档，选区是 ProseMirror selection。
- **edit 模式**：显示原始 Markdown 源文本在 `<textarea>` 中，选区是字符串偏移。

### 一条语义命令，两套原生后端，按模式派发

每个编辑功能（高亮、链接插入）表达为一个语义操作，由当前模式的原生后端执行：

- **viewer 模式**：直接在 live `EditorView` 上执行 ProseMirror 命令（`toggleMark` / `addMark`），不切换到源码模式，不重建编辑器，视口不跳动，插入位置准确。
- **edit 模式**：继续在 textarea 源字符串上直接 splice，在需要字节级真值时保留此路径。

派发逻辑集中在 `MarkdownDocumentViewer.vue`（以 `props.markdownViewerMode` 为键），调用端 `DocumentEditorPane.vue` 无需感知当前模式。

### 关键 viewer 模式命令

位于 `packages/ui/src/utils/markdownDocument.ts`：

- `toggleMarkdownHighlightAtViewerSelection(editor)`：对当前 ProseMirror 选区切换 highlight mark（`==...==`）。
- `applyMarkdownLinkAtViewerSelection(editor, { label, href })`：非空选区添加 link mark；光标折叠则插入带 link mark 的 label 文本节点。

### 影响

- viewer 模式下的链接插入和高亮应用不再产生 viewer → edit → viewer 的模式轮询，视口不跳动。
- 链接插入位置精确到 ProseMirror 选区，与块类型（空段落、列表、表格、frontmatter 边界）无关。
- 序列化 Markdown 格式与 edit 模式一致（`[label](href)`、`==...==`）。
- edit 模式插入行为不变。
- 这是 `packages/ui` 内部决策，不影响同步服务契约或跨宿主接口。

## 文档身份标识与节点移动策略

### 概述

每个 markdown 文档在 YAML frontmatter 中写有一个稳定的 ULID，键名为 `jarvis_id`。
无论文件路径如何变化，该 ID 始终是文档的不可变规范标识。

### 身份标识分配

- 首次打开时，`DocumentIdentityIndex` 检查 frontmatter 中是否存在 `jarvis_id`；若不存在则生成并写回。
- 索引仅保留在内存中（`path → id` 与 `id → path` 双向映射）。没有独立的持久化索引文件；源码 frontmatter 才是真值。
- Milkdown 编辑器通过以文档实例为键的 WeakMap 将 frontmatter 在展现层剥离，序列化时再还原。用户不会看到也不会直接编辑 `jarvis_id`。

### 移动 / 重命名策略（零成本）

节点移动或重命名时：

1. 仅更新内存中的 `DocumentIdentityIndex`（`identityIndex.remap(oldPath, newPath)`）。
2. 不写数据库、不改路径列。会话和任务记录中原有的 `documentIds[]` 条目保持不变，依然与文档 frontmatter 中的 ULID 匹配，和文件当前位置无关。
3. `moveNode` 内部的跨 Agent 守卫确保当另一个 Agent 进程持有文件锁时拒绝重命名，防止并发访问导致身份标识分裂。

### 查询路由

所有上下文查询均以 **`documentId` 优先**：

- 服务端：有 `documentId` 时优先走 `_getConversationsByDocumentId` / `_getTasksByDocumentId`；`documentPath` 仅作为早期记录的降级回退。
- 客户端：`AgentConversationPanel` 中的 `documentScopedConversations` 接受同时满足以下任一条件的会话：`documentPaths` 包含当前路径，**或** `documentIds` 包含当前文档的 ULID。这一双重匹配守卫处理了移动操作与下一次异步数据重载之间的窗口期，确保重命名后会话依然立即显示。

### 出链重写

工具栏写入文档的链接（会话引用、资源嵌入）使用相对于仓库根目录的标准相对路径。`references/` 目录受保护，其内容不受链接重写操作影响。

### 数据迁移

首次设置 `contextProvider` 或工作区上下文时触发对存量文档的单次迁移。迁移在 frontmatter 写入 `jarvis_schema: 1` 作为完成标志，操作幂等；`_conversationIdsMigrated` / `_taskIdsMigrated` 两个标志分别追踪关联记录是否已回填新的 ULID。

### 与 OpenSpec 设计决策的一致性核查

| OpenSpec 决策 | 状态 |
|---|---|
| 决策 1：ID 写入 frontmatter，不使用独立持久化索引 | ✓ 已实现 |
| 决策 2：移动时的跨 Agent 守卫 | ✓ 已实现 |
| 决策 3：单次迁移，不进行双写 | ✓ 已实现 |
| 决策 4：出链使用标准相对路径，不用 `@/` 语法 | ✓ 已实现 |

实现过程中产生的两个 OpenSpec 未涵盖的细节：
- Milkdown 中基于 WeakMap 的 frontmatter 隔离（使 `jarvis_id` 对编辑器不可见）。
- `documentScopedConversations` 中的双重匹配过滤（`documentPaths` 或 `documentIds`），用于覆盖移动后异步重载的竞态窗口期。

## 外部依赖链路

- Web、Extension、Desktop 通过共享运行时契约调用外部模型提供方。
- Extension 和 Desktop 还会桥接浏览器控制页面以访问 ChatGPT 和 Gemini 历史。
- Sync Server 与 Desktop 宿主都可以通过文件系统适配层访问知识资料库。

## 相关文档

- 仓库概览：[README.zh-CN.md](README.zh-CN.md)
- C4 DSL 主设计源：[docs/zh/workspace.zh-CN.dsl](docs/zh/workspace.zh-CN.dsl)
- Context Provider 说明：[docs/zh/context-provider.zh-CN.md](docs/zh/context-provider.zh-CN.md)
