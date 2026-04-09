## Why

当前系统虽然已经在知识工作区里基于 `agentKey` 聚合 Agent 会话，但普通对话工作台缺少“把现有本地会话手动归到某个 Agent” 的显式入口，导致用户只能依赖自动绑定结果，无法把历史对话整理进某个 Agent 作用域下。随着 Agent 列表和目录级会话入口已经存在，这个缺口会直接影响用户围绕 Agent 组织和回看会话资产的效率。

## What Changes

- 在普通对话工作台左侧本地历史项操作区新增“绑定到 Agent”入口。
- 允许用户为任意本地普通会话设置、改绑或清空 `Conversation.agentKey`。
- 绑定候选项来自当前工作区 `contextProvider.getContext().agentConfigs`，同时提供默认根作用域 Agent 和“不绑定”选项。
- 绑定结果持久化到现有会话存储，不新增新的会话映射结构。
- 手动绑定仅影响会话在 Agent 相关列表中的归属与展示，不改变普通聊天页继续发送时实际使用的 Agent 上下文。
- 知识工作区中按 `agentKey` 展示的 Agent 会话列表，包括右侧 `AgentPane` 和中间 `AgentView`，都需要立即反映手动绑定结果。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `conversation-workspace`: 本地历史列表需要支持对会话进行手动 Agent 绑定、改绑和解绑。
- `knowledge-workspace`: 右侧 Agent 会话列表需要展示用户手动绑定到当前 Agent 的本地会话。
- `agent-view`: 中间主面板的 Agent 会话总览需要展示用户手动绑定到当前 Agent 的本地会话。

## Impact

- 受影响代码主要位于 `packages/ui` 的 `ConversationSidebar`、`ConversationWorkspaceView` 和 `chatStore`。
- Web、Extension、Desktop 三个宿主都需要把现有 `contextProvider` 透传给普通对话工作台。
- 现有 `Conversation.agentKey` 字段继续复用，不需要修改核心存储模型或同步结构。
- 相关组件测试、store 测试，以及知识工作区到普通会话工作台之间的联动 E2E 需要补齐。
