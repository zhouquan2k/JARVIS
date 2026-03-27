## Why

当前产品已经具备独立的 AI 聊天工作区，但还没有围绕本地知识文件的基础工作台。若继续把“文件浏览、类似 Obsidian 的所见即所得 Markdown 编辑、AI 协作读写”一次性打包推进，范围会过大，也会把新的知识工作区和现有 `conversation-workspace` 过早耦合在一起。

本次变更先收敛为“把三栏知识工作区壳层搭起来，并真正落地左边两栏”。这样可以先完成知识文件工作流最基础的浏览与编辑闭环，同时为右侧 AI 面板后续接入预留稳定结构，而不必现在就改造聊天面板、模型工具调用和跨文件检索链路。中间编辑区的目标不是 Markdown 源码输入框，而是单栏、无分栏预览的所见即所得编辑体验。

为了真实验证 Markdown 编辑器在知识文件工作流中的可用性，Web 宿主不再只停留在内存或 mock 数据层，而是需要通过 web server 暴露的 `/api/context` 访问一个可配置根路径下的知识文件集合。browser 端只面对 `IContextProvider` 语义，不直接接触本地文件系统；server 端当前先以本地文件作为临时后端实现，同时把文件访问边界控制在指定工作区根目录内。当前根路径来源明确为 server 配置的 `CHATPRISM_KNOWLEDGE_ROOT`，而不是由共享 UI 直接决定。

在左侧文件树与中间编辑器已经具备基础闭环后，知识工作区右栏如果继续保持纯占位，会让“三栏工作区”停留在结构演示阶段，无法验证知识编辑与 AI 对话并存时的真实使用方式。同时，当前三个宿主虽然都同时具备知识工作区与聊天工作区入口，但顶部导航缺少一级切换入口，用户需要依赖 URL 或工作区内部入口跳转，默认工作区之间的切换路径不够直接。

## What Changes

- 新增三栏式 `KnowledgeWorkspaceView`，作为新的知识工作区主视图，布局为左侧文件浏览、中间单栏所见即所得 Markdown 编辑、右侧 AI 面板。
- 首阶段先完成左侧文件浏览与中间所见即所得 Markdown 编辑，并在此基础上把右侧从 `KnowledgeAssistantPlaceholder` 升级为真实的 `KnowledgeAssistantPane`；该 pane 直接复用现有 `NormalChatView`，但本次不实现 AI 读取当前文件、跨文件搜索或受控文件写入。
- 保持现有 `conversation-workspace` 原样，不把它改造成三栏视图；知识工作区通过新的 `KnowledgeWorkspaceView` 独立演进。
- 新增独立的知识文件访问接口，统一目录树读取、文件读写、节点创建与权限初始化能力，不与聊天会话存储接口混用。
- 中间编辑器改为采用 `Milkdown` 作为 Markdown-first 的所见即所得编辑底座，不采用分栏预览，也不再把 `Tiptap` 作为本次首选方案。
- 在 `apps/server` 中新增 `/api/context`，按 `IContextProvider` 语义通过 HTTP 暴露知识文件访问能力；server 内部采用 `HttpContextService + LocalFileContextProvider` 的分层，后续可切换为 `DatabaseContextProvider` 以支持不同用户的 context 映射。
- 在核心接口层梳理命名边界，明确现有 `IStorageProvider` 实际承担的是会话持久化职责，并将其收敛为 `IConversationStorageProvider` 的方向纳入本次设计讨论。
- 在 `AppTopBar` 中增加一个默认工作区切换菜单，只在 `KnowledgeWorkspaceView (/)` 和 `ConversationWorkspaceView (/chat)` 之间切换；`/compare` 继续保留现有入口，不提升为一级工作区导航。
- 本次不修改 `NormalChatView` 本身的 props、空态和输入交互，而是通过新的 `KnowledgeAssistantPane` 直接复用它。

## Capabilities

### New Capabilities
- `knowledge-workspace`: 提供新的三栏知识工作区壳层，并落地左侧文件浏览、中间所见即所得 Markdown 编辑与右侧 AI pane。
- `knowledge-context-provider`: 定义知识文件访问接口以及 Web / Desktop / Extension 的适配边界，用于支持目录树、文档读取与写入。

### Modified Capabilities
- `core-interfaces`: 梳理核心接口命名，区分会话存储与知识文件访问两个领域，并为 `IConversationStorageProvider` / 知识文件 Provider 的分层提供契约。
- `conversation-workspace`: 保持现有聊天工作台结构不变，但通过顶部导航参与与知识工作区之间的一级切换。
- `sync-server`: 在现有服务端中新增 `/api/context`，将 `IContextProvider` 语义通过 HTTP 暴露给 browser 端，并允许底层 provider 从临时本地文件实现演进到数据库实现。
- `web-host-app`: 在 Web 宿主入口装配 `KnowledgeWorkspaceView` 并注入知识文件 Provider。
- `desktop-host-app`: 在桌面宿主入口装配 `KnowledgeWorkspaceView` 并注入桌面侧知识文件 Provider。
- `extension-host-app`: 在扩展宿主入口装配 `KnowledgeWorkspaceView` 并注入扩展侧知识文件 Provider。

## Impact

- 受影响范围主要包括 `packages/core` 的接口命名与知识文件访问契约、`packages/ui` 的新工作区壳层/文件树/`Milkdown` 编辑器/状态管理、`apps/server` 的 `/api/context` 服务分层，以及 Web、Desktop、Extension 三个宿主入口的工作区装配方式；其中 Web 端会补入“可配置根路径 -> LocalFileContextProvider -> HttpContextService -> /api/context -> browser ContextProvider”这条真实文件访问链路。
- 本次会把知识工作区右栏从占位升级为真实聊天 pane，并补入顶部工作区切换菜单；但不会修改 `NormalChatView` 的内部行为，也不改造现有 `conversation-workspace` 的布局与工作流。
- 若后续右侧 AI 面板接入知识上下文，将在此三栏壳层之上追加独立变更，而不是把本次基础工作区实现继续扩大范围。
