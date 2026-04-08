## Why

当前知识工作区右侧 `AgentPane` 只有单一会话详情视图，缺少“当前选中文档关联了哪些对话”以及“当前选中的 Agent 绑定目录下有哪些本地会话”的显式入口，导致用户在 AgentMode 下无法围绕某个文档或某个 Agent 作用域管理历史对话，也无法在列表和详情之间快速切换。与此同时，对话模式左侧 sidebar 当前缺少整会话级星标能力，用户无法把重要本地会话固定为可快速筛选的集合，也无法在顶部一键切换到“仅看星标”的精简视图。这个能力属于右侧 assistant pane 与对话工作台左侧 sidebar 的交互增强，而不是中间主面板 `AgentView`；同时，文档相关对话列表需要通过 `IContextProvider` 统一读取，避免 UI 直接拼装文件上下文与会话存储实现，而目录级 Agent 会话列表与对话工作台左侧星标筛选则应直接复用已有本地会话聚合能力。

## What Changes

- 在 `Conversation` 上新增可选 `documentPaths` 字段，用于持久化一个会话关联的多个工作区文档路径。
- 调整右侧 `AgentPane`，新增由外层管理的“会话列表 / 会话详情”双态面板；选中任意文档时默认显示该文档的会话列表，选中绑定 Agent 的目录时默认显示属于该 Agent 的本地会话列表。
- 扩展 `IContextProvider`，提供通用会话查询能力，并支持以 `documentPath` 条件读取相关会话列表，让右侧 AgentPanel 通过该契约获取文档会话。
- 新增右侧 Agent 会话列表组件，统一展示 `IContextProvider` 返回的当前文档相关会话或当前 Agent 作用域下的本地会话，并支持从列表进入详情。
- 为对话模式左侧本地历史列表增加整会话星标能力，并在顶部增加“全部 / 仅看星标”过滤切换。
- 保持 `NormalChatView` 作为详情视图复用，不重构其内部线程、输入区和工具栏逻辑；列表/详情导航由外层 `AgentConversationPanel` 统一管理。
- 在 Agent 首轮真实把当前文档作为附件发送时，将该文档路径写入会话的 `documentPaths`，并在本地存储与同步链路中完整保留。
- 扩展知识工作区、知识 context provider 与核心接口规范，使右侧 AgentPanel 的文档列表行为、`IContextProvider` 文档会话读取能力以及文档关联持久化具有稳定要求。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `knowledge-workspace`: 知识工作区右栏在选中任意文档时需要默认进入文档关联会话列表，在选中绑定 Agent 的目录时需要默认进入该 Agent 的本地会话列表，并继续复用现有 Agent 聊天详情。
- `conversation-workspace`: 对话模式左侧本地历史列表需要支持整会话星标与顶部星标过滤切换，并保持当前紧凑 sidebar 结构。
- `knowledge-context-provider`: `IContextProvider` 需要扩展通用会话查询的只读能力，并支持按文档读取关联会话列表，由各宿主 provider 实现。
- `storage-provider`: 本地持久化需要无损保存与读取 `Conversation.documentPaths`。
- `sync-storage-provider`: 同步存储需要在 push / pull / hydrate 中完整保留 `documentPaths`，避免多端丢失文档关联。
- `core-interfaces`: 核心会话数据模型 `Conversation` 需要扩展文档关联字段，并保持向后兼容。
- `sync-server`: HTTP context API 需要透传 `IContextProvider` 新增的文档会话读取语义。

## Impact

- 受影响代码主要位于 `packages/ui` 的 `AgentPane`、知识工作区视图与新增的 Agent 专属列表组件。
- `packages/ui` 的 `ConversationSidebar` 与对话工作台容器也需要增加本地会话星标与筛选交互。
- `packages/core` 的 `Conversation` 数据模型、`IContextProvider` 契约与 HTTP-backed context provider 需要扩展会话查询能力，并支持文档关联读取。
- `apps/server` 的 context service / route 与同步载荷解析需要支持新字段和新查询语义，但不需要新增数据库列或破坏现有 payload 结构。
- Web、Desktop、Extension 的知识工作区右栏交互和相关单测 / E2E 用例都需要更新。
