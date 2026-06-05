[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# 架构总览

本文描述 JARVIS 的整体结构：可部署宿主、代码分层与依赖边界、插件系统，以及若干关键设计决策。多种运行形态（浏览器扩展、Web、桌面应用）共享核心工作区 UI 和插件系统契约，但在环境接入和能力暴露上有所不同。

## 1. 可部署单元 / 宿主

可独立运行、部署的单元；它们是运行时外壳，向业务暴露其作为基础设施的能力，不拥有任何业务相关逻辑。

- Browser Extension App

- Web App

- Desktop App

- Sync Server： 暴露会话同步 API、上下文 API 和 provider 配置接口。将共享契约连接到基于文件系统或数据库的持久化实现，是远程上下文与数据同步的后端边界。

## 2. 代码组织与分层边界

各层的模块、职责与依赖方向如下表。原则是：环境接入归宿主，核心基本工作区（节点树+markdown文档）前端归 `packages/ui`，其他领域业务归插件，全局共享契约归 `packages/core`。

| 模块 | 职责分配 | 依赖 |
|---|---|---|
| `apps/*`（宿主）<br/>（web / desktop / extension） | 运行时外壳与组合根：生命周期、bridge、存储、文件系统、浏览器能力等环境接入；在入口点将控制权交给 `ui`，不负责插件的启用与装配 | → `ui` / `core`（不直接依赖 `plugins` / `plugin-system`） |
| `apps/server` | 会话与上下文同步后端：暴露会话同步 API、上下文查询与写入接口；适配文件系统持久化；是远程 UI 与本地数据的同步边界 | → `core` / `node`；编译期依赖 `@plugins/ai-agent`（暂缓迁移至通用 CRUD API） |
| `packages/ui` | Markdown 文档工作区核心前端层：工作区壳、布局容器、文档树交互、文档打开/编辑/保存、通用展示组件、扩展点渲染；负责装载插件系统 | → `plugin-system` / `core`；可消费宿主暴露的环境事实与 context；不承载 AI / 任务特有的工作流、store 或业务规则 |
| `packages/plugin-system` | 插件系统：插件注册、启用、装配，运行时上下文构建，插件运行时编排 | → `core`；理想情况下不编译依赖 `plugins`，通过动态 / 运行时加载（按 `core` 中的插件契约） |
| `packages/core` | 跨包最小稳定契约、插件契约、宿主无关的通用基础设施 | 不依赖任何上层；不长期保留 AI / 任务的领域契约 |
| `packages/node` | Desktop main 与同步服务复用的 Node-only 适配层与基础设施实现 | → `core` |
| `plugins/*` | AI / 任务等领域能力：领域模型、工作流、store、业务视图、能力特定规则 | → `core`（实现其插件契约）；理想情况下不对外暴露 `api`，也不被任何包编译期依赖 |

依赖链为 `apps → ui → plugin-system ⇢ plugins`：宿主在入口点把控制权交给 `ui`，由 `ui` 装载 `plugin-system`，再由 `plugin-system` 在运行时按插件契约动态加载、注册并装配 `plugins`（`⇢` 表示运行时加载，而非编译期依赖）。宿主因此与具体插件解耦，仅依赖 `ui` 与 `core`。


**通用依赖原则：**

- 当运行环境差异会影响上层行为时，宿主应将其暴露为**环境属性、能力句柄或 context**，由上层就地消费，而不是在宿主内部直接编写业务分支。
- 对容易模糊的运行时概念、bootstrap 结果对象或 UI 壳层对象，默认遵循“**不为未来设计，需要时再重构拆分，否则按简单的来（类越少越好）**”的原则；只有当当前职责已经明显不同，才引入新的独立类型或壳层。
- 宿主不直接依赖 `plugins` / `plugin-system`，也不负责插件的启用与装配；插件的注册与装配由 `plugin-system` 负责。
- 插件之间、以及 `plugin-system` 与具体插件之间的交互均通过 `core` 中定义的插件契约完成；理想情况下插件无需对外暴露 `api`，也不应被任何包编译期依赖。
- `packages/core` 不依赖任何上层；属于 AI 或任务能力的领域契约不应沉积在此。
- AI、任务以及未来新增能力的业务逻辑归属于各自插件，不应继续沉积在 `packages/ui` 中。
- 知识资料库即使部署在本地，也仍然被视为外部依赖（见第 5 节）。

## 3. 插件系统

### 3.1 plugin-system 的定位

- `packages/plugin-system` 是插件系统的实现层，负责插件注册（`PluginRegistry`）、启用与装配（`PluginManager`）、运行时上下文构建，以及插件运行时编排。
- 它由 `packages/ui` 在工作区初始化时装载；宿主不直接依赖它，也不参与插件的启用与装配。
- 它只编译依赖 `packages/core`，理想情况下不在编译期依赖具体 `plugins`，而是在运行时按 `core` 中定义的插件契约动态加载插件，从而成为「核心工作区前端」与「具体领域插件」之间的解耦层。

### 3.2 插件的定位与边界

- `plugins/*` 拥有领域模型、工作流、store、业务视图以及能力特定规则。
- AI、任务及未来新增的能力均以插件形式承载；其业务状态机与工作流编排不应外泄到宿主或 `packages/ui`。

### 3.3 插件契约与隔离

- 插件通过实现 `core` 中定义的插件契约接入系统，由 `plugin-system` 在运行时发现并加载。
- 理想情况下插件**无需对外暴露 `api`**——没有其他模块需要直接消费插件，交互全部经由契约与运行时 context 完成。
- 插件内部实现完全留在插件目录内部，不被任何包编译期依赖，也不应有人依赖其内部实现路径。

### 3.4 插件与宿主 / UI 的协作

- 插件可以消费宿主暴露（经 `plugin-system` 构建的运行时 context）的环境事实，并据此决定能力相关的行为。
- 扩展点的渲染层由 `packages/ui` 消费，插件通过扩展点将业务视图注入核心工作区。

### 3.5 启用与装配

- 插件的启用与装配由 `plugin-system` 负责，发生在 `ui` 装载插件系统的阶段，而非宿主组合根。
- 宿主只在入口点把控制权交给 `ui`，并向上暴露环境事实供 `plugin-system` 构建运行时 context；业务判断仍留在插件内部。

## 4. 关键设计决策（ADR）

### 4.1 Markdown 文档编辑策略

markdown viewer（Milkdown / ProseMirror）编辑的是结构化文档树，而文档的真值仍是磁盘上的原始 markdown 字符串。任何"viewer 光标 → 源码字符偏移"的映射在原理上都不稳定——Milkdown 是 WYSIWYG 编辑器，本身不维护"文档树 ↔ 原始字节流"的源映射。

**决策**

viewer 模式下的插入操作（文档工具栏触发的链接 / 会话引用 / 资源嵌入）通过 Milkdown 的 parser 解析为节点，作为原生 ProseMirror transaction 派发；新的 markdown 源由 Milkdown 的 serializer 整篇重新生成。不再尝试任何"viewer → 源码"的坐标换算。

**影响**

- 插入位置在任意块类型上都准确，包括空段落与 raw HTML 邻位。
- 打开文档后的首次插入可能规范化格式（强调标记风格、列表符号、连续空行合并等），产生较大的初始 git diff。后续编辑稳定，因为 serializer 输出是确定性的。
- edit 模式（纯 textarea）继续在源字符串上直接 splice，在需要字节级真值时保留这条路径。
- 这是 `packages/ui` 内部决策，不影响同步服务契约或跨宿主接口。

viewer 模式插入入口位于 `packages/ui/src/utils/markdownDocument.ts` 的 `insertMarkdownAtViewerSelection`。

### 4.2 文档身份标识与节点移动

**概述**

每个 markdown 文档在 YAML frontmatter 中写有一个稳定的 ULID，键名为 `jarvis_id`。无论文件路径如何变化，该 ID 始终是文档的不可变规范标识。

**身份标识分配**

- 首次打开时，`DocumentIdentityIndex` 检查 frontmatter 中是否存在 `jarvis_id`；若不存在则生成并写回。
- 索引仅保留在内存中（`path → id` 与 `id → path` 双向映射）。没有独立的持久化索引文件；源码 frontmatter 才是真值。
- Milkdown 编辑器通过以文档实例为键的 WeakMap 将 frontmatter 在展现层剥离，序列化时再还原。用户不会看到也不会直接编辑 `jarvis_id`。

**移动 / 重命名策略（零成本）**

节点移动或重命名时：

1. 仅更新内存中的 `DocumentIdentityIndex`（`identityIndex.remap(oldPath, newPath)`）。
2. 不写数据库、不改路径列。会话和任务记录中原有的 `documentIds[]` 条目保持不变，依然与文档 frontmatter 中的 ULID 匹配，和文件当前位置无关。
3. `moveNode` 内部的跨 Agent 守卫确保当另一个 Agent 进程持有文件锁时拒绝重命名，防止并发访问导致身份标识分裂。

**查询路由**

所有上下文查询均以 **`documentId` 优先**：

- 服务端：有 `documentId` 时优先走 `_getConversationsByDocumentId` / `_getTasksByDocumentId`；`documentPath` 仅作为早期记录的降级回退。
- 客户端：`AgentConversationPanel` 中的 `documentScopedConversations` 接受同时满足以下任一条件的会话：`documentPaths` 包含当前路径，**或** `documentIds` 包含当前文档的 ULID。这一双重匹配守卫处理了移动操作与下一次异步数据重载之间的窗口期，确保重命名后会话依然立即显示。

**出链重写**

工具栏写入文档的链接（会话引用、资源嵌入）使用相对于仓库根目录的标准相对路径。`references/` 目录受保护，其内容不受链接重写操作影响。


## 5. 运行时与外部依赖链路

- Web、Extension、Desktop 通过共享运行时契约调用外部模型提供方。
- Extension 和 Desktop 还会桥接浏览器控制页面以访问 ChatGPT 和 Gemini 历史。
- Sync Server 与 Desktop 宿主都可以通过文件系统适配层访问知识资料库；知识资料库即使部署在本地也视为外部依赖。

