## 1. 核心接口与 Provider 上下文改造

- [x] 1.1 更新 `packages/core/src/interfaces/IContextProvider.ts`，移除 `listTree(parentPath)`，新增 `getContext(): Promise<WorkspaceContext>`、`WorkspaceContext` 类型，以及带 `children / isAgentOwner / agentKey` 的 `ContextNode`
- [x] 1.2 更新 `packages/core/src/providers/context/HttpContextProvider.ts`、`apps/server/src/routes/context.ts`、`apps/server/src/services/httpContextService.ts`、`apps/server/src/types/context.ts`，打通 `getContext()` 的 HTTP 契约
- [x] 1.3 更新 `apps/desktop/main/contextIpc.ts`、`apps/desktop/src/context/createDesktopContextProvider.ts` 与 `packages/core/src/testing/createMockContextProvider.ts`，让 desktop 与测试环境也实现 `getContext()`
- [x] 1.4 重构 `apps/server/src/providers/localFileContextProvider.ts`，一次构建完整目录树、标记 `isAgentOwner`、计算每个节点的 `agentKey`，并生成 `agentConfigs`
- [x] 1.5 简化 `AgentConfig` 继承与合并逻辑：从 `IAgentConfig` 移除 `inheritance` 模式并更新 `resolveScopedAgentConfig.ts`，让系统 `fallback` 配置成为 `reduce` 合并的最初基底。

## 2. 知识工作区与 AgentView 集成

- [x] 2.1 重构 `packages/ui/src/store/documentWorkspace.ts`，改为消费 `WorkspaceContext`，补齐 `findNodeByPath`、节点选择、当前 Agent 解析与 Markdown 子树收集逻辑
- [x] 2.2 更新 `packages/ui/src/components/DocumentFileTree.vue`，基于 `isAgentOwner` 为目录节点显示 Agent 图标，并适配完整树结构渲染
- [x] 2.3 新增 `packages/ui/src/components/AgentView.vue`，展示 Agent 基本信息、有效提示词、模型、owner 子树中的 Markdown 文档列表与按 `agentKey` 过滤的本地会话列表
- [x] 2.4 更新 `packages/ui/src/views/DocumentWorkspaceView.vue` 与相关容器组件，在选中 `isAgentOwner === true` 的目录时于中间主面板挂载 `AgentView`，并保持右侧 `AgentPane` 持续可用

## 3. 会话归属与持久化

- [x] 3.1 更新 `packages/core/src/interfaces/IStorageProvider.ts` 及相关会话归一化逻辑，为 `Conversation` 增加可选 `agentKey`
- [x] 3.2 更新 `packages/core/src/providers/storage/IndexedDBStorageProvider.ts` 与 `packages/core/src/providers/storage/SyncStorageProvider.ts`，确保保存和读取会话时无损保留 `agentKey`
- [x] 3.3 更新 `packages/ui/src/store/chat.ts`，在知识工作区 Agent 链路中写入实际回答该会话的 `agentKey`，并提供按 `agentKey` 聚合本地会话的方法

## 4. 测试与验证

- [x] 4.1 为 `packages/core` 与 `apps/server` 补充单元测试，覆盖 `getContext()` 返回完整树、`isAgentOwner` 标记、默认与真实 Agent 的 `agentKey` 分配，以及 `agentConfigs` 对齐
- [x] 4.2 为 `packages/ui` 补充组件或 store 测试，覆盖左侧树图标、`AgentView` 显示条件、Markdown 文档过滤和会话列表过滤
- [x] 4.3 补充 Playwright e2e 用例，覆盖选中 owner 目录后显示 `AgentView`、点击文档或会话的联动，以及非 owner 节点不显示 `AgentView`
- [x] 4.4 按顺序执行 lint、类型检查、构建、最小回归与目标范围测试，并清理仍依赖旧 `listTree(parentPath)` 的残余调用
