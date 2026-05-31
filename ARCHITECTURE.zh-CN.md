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

- `packages/core`：领域模型、运行时抽象、provider 契约和工作流编排。
- `packages/ui`：供 Web、Extension、Desktop renderer 复用的 UI 组件、视图和状态管理。
- `packages/node`：供 Desktop main 和同步服务复用的 Node-only 适配层与基础设施实现。

## 职责边界

- 各宿主应用负责按运行时装配能力，但不重新定义共享契约。
- 共享包负责沉淀会话、provider 和上下文抽象。
- 同步服务是远程上下文和数据同步的后端边界。
- 知识资料库即使部署在本地，也仍然被视为外部依赖。

## Markdown 文档编辑策略

markdown viewer（Milkdown / ProseMirror）编辑的是结构化文档树，而文档的
真值仍是磁盘上的原始 markdown 字符串。任何"viewer 光标 → 源码字符偏移"
的映射在原理上都不稳定——Milkdown 是 WYSIWYG 编辑器，本身不维护
"文档树 ↔ 原始字节流"的源映射。

### 决策

viewer 模式下的插入操作（文档工具栏触发的链接 / 会话引用 / 资源嵌入）
通过 Milkdown 的 parser 解析为节点，作为原生 ProseMirror transaction
派发；新的 markdown 源由 Milkdown 的 serializer 整篇重新生成。不再尝试
任何"viewer → 源码"的坐标换算。

### 影响

- 插入位置在任意块类型上都准确，包括空段落与 raw HTML 邻位。
- 打开文档后的首次插入可能规范化格式（强调标记风格、列表符号、连续空行
  合并等），产生较大的初始 git diff。后续编辑稳定，因为 serializer 输出
  是确定性的。
- edit 模式（纯 textarea）继续在源字符串上直接 splice，在需要字节级
  真值时保留这条路径。
- 这是 `packages/ui` 内部决策，不影响同步服务契约或跨宿主接口。

viewer 模式插入入口位于 `packages/ui/src/utils/markdownDocument.ts` 的
`insertMarkdownAtViewerSelection`。

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
