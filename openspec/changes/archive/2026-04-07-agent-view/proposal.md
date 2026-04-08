## Why

当前知识工作区已经能根据选中文件或目录解析生效 Agent，并在右侧 `AgentPane` 中进行对话，但 UI 侧仍然需要自行拼装目录树、推断哪些目录直绑了 Agent、再单独按路径解析完整 Agent 配置。这让左侧树图标、中间 Agent 视图和右侧聊天上下文依赖多套数据来源，既增加了重复请求，也容易让“目录是否直绑 Agent”和“当前生效 Agent 是谁”出现状态漂移。

同时，现有会话模型没有保存“这条会话由哪个生效 Agent 回答”的归属信息，导致系统无法稳定列出某个 Agent 的历史对话。现在需要把知识工作区上下文收敛为一次性 `getContext()` 返回的完整树和 Agent 配置缓存，并把会话归属补齐，建立一致的 Agent 视图、树标识和历史恢复基础。

## What Changes

- 将知识工作区的主数据入口收敛为 `ContextProvider.getContext()`，一次返回完整目录树和所有已解析的 Agent 配置缓存，并删除旧的 `listTree(parentPath)` 目录枚举接口与路径级 `resolveScopedAgentConfig(path)` 主链路。
- 扩展树节点元数据：每个节点携带 `isAgentOwner` 与 `agentKey`，其中 `isAgentOwner` 表示目录自身直接存在 `.agent.json`，`agentKey` 表示该节点当前生效的 Agent。该 Agent 可能来自真实目录配置，也可能来自 `ContextProvider` 内部默认兜底 Agent。
- 在左侧文件树中为 `isAgentOwner === true` 的目录显示 Agent 标识图标；在中间主面板中，仅当用户选中这样的目录节点时显示 Agent 视图。
- Agent 视图集中展示当前 Agent 的基本信息、有效提示词、模型信息、目录树下的 Markdown 文档列表，以及该 Agent 的本地会话列表；完整 Agent 配置统一通过 `agentConfigs[agentKey]` 获取，而不是重复挂载到每个节点上。
- 为本地 `Conversation` 增加可选 `agentKey` 字段，用于记录“实际回答该会话的生效 Agent”身份；在知识工作区 Agent 链路中，该 key 既可能指向真实目录 Agent，也可能指向 provider 内部默认 Agent。
- UI 主链路不再依赖 `resolveScopedAgentConfig(path)` 解析当前 Agent，而是统一消费 `getContext()` 返回的 `agentKey + agentConfigs`。
- 简化 AgentConfig 继承机制，移除 `inheritance: 'override'` 模式，统一使用 `merge`；将系统默认设置（`fallback`）作为解析的最底层基底，使得任何级别的子目录都能自动继承并追加/覆盖全局默认配置。

## Capabilities

### New Capabilities
- `agent-view`: 定义目录级 Agent 视图的独立能力契约，包括显示条件、元信息展示、Markdown 文档列表与 Agent 会话列表，以及基于 `agentKey + agentConfigs` 读取当前 Agent 的统一方式。

### Modified Capabilities
- `knowledge-workspace`: 扩展左侧树和中间主面板的数据来源与渲染规则，使知识工作区基于 `getContext()` 返回的完整树、`isAgentOwner` 和 `agentKey` 渲染 Agent 图标，并在宿主三栏布局中挂载新的 `AgentView`。
- `knowledge-context-provider`: 调整知识上下文 Provider 契约，使其删除逐层 `listTree(parentPath)` 目录枚举接口，改为一次返回完整目录树、节点 Agent 元数据和 Agent 配置缓存。
- `core-interfaces`: 调整 `IContextProvider` 的核心契约，移除 `listTree(parentPath)`，引入 `getContext()` 和带 `children / isAgentOwner / agentKey` 的节点结构，并让 `agentConfigs` 成为 UI 获取完整 Agent 配置的主入口。
- `storage-provider`: 扩展会话持久化语义，使存储层能够保存并恢复可选 `agentKey`，从而支持按 Agent 聚合会话，同时保持旧会话兼容。

## Impact

- 影响代码范围：`packages/core/src/interfaces/IContextProvider.ts`、`packages/core/src/interfaces/IAgentConfig.ts`、`packages/core/src/agents/config/resolveScopedAgentConfig.ts`、`packages/core/src/providers/context/HttpContextProvider.ts`、`apps/server/src/providers/localFileContextProvider.ts`、`apps/server/src/services/httpContextService.ts`、`apps/server/src/routes/context.ts`、`apps/desktop/main/contextIpc.ts`、`apps/desktop/src/context/createDesktopContextProvider.ts`、`packages/ui/src/store/documentWorkspace.ts`、`packages/ui/src/components/DocumentFileTree.vue`、新的 `packages/ui/src/components/AgentView.vue`、`packages/ui/src/views/DocumentWorkspaceView.vue`、`packages/ui/src/store/chat.ts`、`packages/core/src/interfaces/IStorageProvider.ts` 及相关测试。
- 影响的数据模型：`ContextNode` 将携带 `children`、`isAgentOwner`、`agentKey`；新增 `WorkspaceContext` / `agentConfigs`；`Conversation` 新增可选字段 `agentKey?: string`；`AgentConfig` 移除 `inheritance` 属性。
- 影响的运行时行为：知识工作区初始化与刷新将改为一次获取完整上下文；左侧树图标、中间 Agent 视图和右侧聊天上下文改为共享同一份 provider 结果。
- 无计划引入破坏性业务行为变更；旧会话仍可继续读取，只是未绑定 `agentKey` 的历史不会自动出现在 Agent 会话列表中。
